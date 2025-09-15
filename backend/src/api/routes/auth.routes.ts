import { Router } from 'express';
import { authService } from '../../services/auth.service';
import { validateBody } from '../middlewares/validation.middleware';
import { authSchemas } from '../validators/schemas';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { authRateLimit } from '../middlewares/rate-limiter.middleware';
import { prisma } from '../../database/connection';

const router = Router();

router.post('/register',
  authRateLimit,
  validateBody(authSchemas.register),
  async (req, res, next) => {
    try {
      const result = await authService.register(req.body);
      
      // Set refresh token as httpOnly cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      // Don't send refresh token in response body
      const { refreshToken, ...responseData } = result;
      return res.status(201).json(responseData);
    } catch (error) {
      return next(error);
    }
  }
);

router.post('/login',
  authRateLimit,
  validateBody(authSchemas.login),
  async (req, res, next) => {
    try {
      const result = await authService.login(req.body.email, req.body.password);
      
      // Set refresh token as httpOnly cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      // Don't send refresh token in response body
      const { refreshToken, ...responseData } = result;
      return res.json(responseData);
    } catch (error) {
      return next(error);
    }
  }
);

router.post('/refresh',
  authRateLimit,
  async (req, res, next) => {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token not found' });
      }
      
      const result = await authService.refreshToken(refreshToken);
      
      // Set new refresh token as httpOnly cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      // Only send access token in response
      return res.json({ accessToken: result.accessToken });
    } catch (error) {
      return next(error);
    }
  }
);

router.post('/logout',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const refreshToken = req.cookies.refreshToken;
      await authService.logout(req.user!.id, refreshToken);
      
      // Clear refresh token cookie
      res.clearCookie('refreshToken');
      
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      return next(error);
    }
  }
);

router.put('/password',
  authRateLimit,
  authenticate,
  validateBody(authSchemas.changePassword),
  async (req: AuthRequest, res, next) => {
    try {
      await authService.changePassword(
        req.user!.id,
        req.body.currentPassword,
        req.body.newPassword
      );
      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      return next(error);
    }
  }
);

router.get('/me',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          role: true,
          createdAt: true,
          lastLogin: true
        }
      });
      res.json(user);
    } catch (error) {
      return next(error);
    }
  }
);

router.put('/profile',
  authenticate,
  validateBody(authSchemas.updateProfile),
  async (req: AuthRequest, res, next) => {
    try {
      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: req.body,
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          role: true
        }
      });
      res.json(user);
    } catch (error) {
      return next(error);
    }
  }
);

export { router as authRouter };