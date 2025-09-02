import { Router } from 'express';
import { authService } from '../../services/auth.service';
import { validateBody } from '../middlewares/validation.middleware';
import { authSchemas } from '../validators/schemas';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { prisma } from '../../database/connection';

const router = Router();

router.post('/register', 
  validateBody(authSchemas.register),
  async (req, res, next) => {
    try {
      const result = await authService.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/login',
  validateBody(authSchemas.login),
  async (req, res, next) => {
    try {
      const result = await authService.login(req.body.email, req.body.password);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/refresh',
  validateBody(authSchemas.refreshToken),
  async (req, res, next) => {
    try {
      const result = await authService.refreshToken(req.body.refreshToken);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/logout',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      await authService.logout(req.user!.id, req.body.refreshToken);
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }
);

router.put('/password',
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
      next(error);
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
          emailVerified: true,
          createdAt: true,
          lastLogin: true
        }
      });
      res.json(user);
    } catch (error) {
      next(error);
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
      next(error);
    }
  }
);

export { router as authRouter };