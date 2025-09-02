import { createLogger } from './logger.js';

const logger = createLogger('RateLimiter');

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
  used: number;
}

export class RateLimiter {
  private limit: number = 5000; // GitHub default
  private remaining: number = 5000;
  private resetTime: number = Date.now() + 3600000; // 1 hour from now
  private used: number = 0;

  constructor() {
    logger.info('Rate limiter initialized');
  }

  updateFromHeaders(headers: Record<string, any>): void {
    const limit = headers['x-ratelimit-limit'];
    const remaining = headers['x-ratelimit-remaining'];
    const resetTime = headers['x-ratelimit-reset'];
    const used = headers['x-ratelimit-used'];

    if (limit) this.limit = parseInt(limit, 10);
    if (remaining) this.remaining = parseInt(remaining, 10);
    if (resetTime) this.resetTime = parseInt(resetTime, 10) * 1000; // Convert to milliseconds
    if (used) this.used = parseInt(used, 10);

    logger.debug({
      limit: this.limit,
      remaining: this.remaining,
      resetTime: new Date(this.resetTime).toISOString(),
      used: this.used
    }, 'Rate limit updated');
  }

  getRateLimitInfo(): RateLimitInfo {
    return {
      limit: this.limit,
      remaining: this.remaining,
      resetTime: this.resetTime,
      used: this.used
    };
  }

  async withBackoff<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we're close to hitting the rate limit
    if (this.remaining < 10) {
      const now = Date.now();
      const waitTime = Math.max(0, this.resetTime - now);
      
      if (waitTime > 0) {
        logger.warn({
          remaining: this.remaining,
          waitTime: Math.round(waitTime / 1000)
        }, 'Rate limit approaching, waiting for reset');
        
        await this.sleep(waitTime);
      }
    }

    try {
      const result = await operation();
      return result;
    } catch (error: any) {
      // Handle rate limit errors
      if (error.status === 403 && error.message?.includes('rate limit')) {
        logger.error({ error: error.message }, 'Rate limit exceeded');
        
        // Extract reset time from error if available
        const resetTime = error.response?.headers?.['x-ratelimit-reset'];
        if (resetTime) {
          const waitTime = (parseInt(resetTime, 10) * 1000) - Date.now();
          if (waitTime > 0) {
            logger.info({ waitTime: Math.round(waitTime / 1000) }, 'Waiting for rate limit reset');
            await this.sleep(waitTime);
            // Retry once after waiting
            return await operation();
          }
        }
      }
      
      // Handle other API errors with exponential backoff
      if (error.status >= 500 || error.code === 'ECONNRESET') {
        logger.warn({ error: error.message }, 'Temporary error, retrying with backoff');
        await this.sleep(1000); // 1 second delay
        return await operation();
      }
      
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Check if we should wait before making another request
  shouldWait(): boolean {
    return this.remaining < 10 && Date.now() < this.resetTime;
  }

  // Get estimated wait time in milliseconds
  getWaitTime(): number {
    if (!this.shouldWait()) return 0;
    return Math.max(0, this.resetTime - Date.now());
  }

  // Get percentage of rate limit used
  getUsagePercentage(): number {
    if (this.limit === 0) return 0;
    return (this.used / this.limit) * 100;
  }

  // Check if we're in a danger zone (>80% used)
  isInDangerZone(): boolean {
    return this.getUsagePercentage() > 80;
  }

  // Reset the rate limiter (useful for testing)
  reset(): void {
    this.limit = 5000;
    this.remaining = 5000;
    this.resetTime = Date.now() + 3600000;
    this.used = 0;
    logger.info('Rate limiter reset');
  }
}