import { Request, Response, NextFunction } from 'express';
import { appConfig } from '../../config/app.config';

interface RateLimitStore {
  [key: string]: {
    requests: number[];
    windowStart: number;
  };
}

class RateLimiter {
  private store: RateLimitStore = {};
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Clean up expired entries every 10 minutes
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  private getKey(req: Request): string {
    // Use IP address as the key, with fallback for different proxy configurations
    const ip = req.ip || 
               req.connection.remoteAddress || 
               req.headers['x-forwarded-for'] as string ||
               'unknown';
    return `${ip}:${req.route?.path || req.path}`;
  }

  private cleanup(): void {
    const now = Date.now();
    Object.keys(this.store).forEach(key => {
      const entry = this.store[key];
      if (now - entry.windowStart > this.windowMs) {
        delete this.store[key];
      }
    });
  }

  check(req: Request): { allowed: boolean; remaining: number; resetTime: number } {
    const key = this.getKey(req);
    const now = Date.now();
    
    if (!this.store[key]) {
      this.store[key] = {
        requests: [],
        windowStart: now
      };
    }

    const entry = this.store[key];
    
    // Reset window if expired
    if (now - entry.windowStart > this.windowMs) {
      entry.requests = [];
      entry.windowStart = now;
    }

    // Remove expired requests
    entry.requests = entry.requests.filter(
      timestamp => now - timestamp < this.windowMs
    );

    const allowed = entry.requests.length < this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - entry.requests.length - (allowed ? 1 : 0));
    const resetTime = entry.windowStart + this.windowMs;

    if (allowed) {
      entry.requests.push(now);
    }

    return { allowed, remaining, resetTime };
  }
}

// Create different rate limiters for different endpoints
const authRateLimiter = new RateLimiter(appConfig.rateLimitWindowMs, 10); // 10 requests per 15 minutes for auth
const generalRateLimiter = new RateLimiter(appConfig.rateLimitWindowMs, appConfig.rateLimitMaxRequests);

export const authRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const result = authRateLimiter.check(req);
  
  // Set rate limit headers
  res.set({
    'X-RateLimit-Limit': '10',
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
  });

  if (!result.allowed) {
    return res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Please try again later',
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
    });
  }

  next();
};

export const generalRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const result = generalRateLimiter.check(req);
  
  // Set rate limit headers
  res.set({
    'X-RateLimit-Limit': appConfig.rateLimitMaxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
  });

  if (!result.allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Please try again later',
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
    });
  }

  next();
};

// Custom rate limiter factory for specific use cases
export const createRateLimit = (windowMs: number, maxRequests: number) => {
  const limiter = new RateLimiter(windowMs, maxRequests);
  
  return (req: Request, res: Response, next: NextFunction) => {
    const result = limiter.check(req);
    
    res.set({
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
    });

    if (!result.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Please try again later',
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      });
    }

    next();
  };
};