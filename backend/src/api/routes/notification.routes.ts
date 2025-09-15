import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { notificationService } from '../../services/notifications/notification.service';
import { z } from 'zod';
import { idSchema } from '../validators/schemas';

const router = Router();

const notificationQuerySchema = z.object({
  unreadOnly: z.boolean().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  offset: z.coerce.number().min(0).optional()
});

const markAsReadSchema = z.object({
  notificationIds: z.array(z.string())
});

// Get user's notifications
router.get('/',
  authenticate,
  validateQuery(notificationQuerySchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { unreadOnly, limit, offset } = req.query;
      const result = await notificationService.getUserNotifications(req.user!.id, {
        unreadOnly: unreadOnly as boolean | undefined,
        limit: limit as number | undefined,
        offset: offset as number | undefined
      });
      res.json(result);
    } catch (error) {
      return next(error);
    }
  }
);

// Get notification counts
router.get('/counts',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const result = await notificationService.getUserNotifications(req.user!.id, {
        limit: 0
      });
      res.json({
        totalCount: result.totalCount,
        unreadCount: result.unreadCount
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Mark specific notifications as read
router.put('/mark-read',
  authenticate,
  validateBody(markAsReadSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await notificationService.markAsRead(
        req.user!.id,
        req.body.notificationIds
      );
      res.json({ markedCount: result.count });
    } catch (error) {
      return next(error);
    }
  }
);

// Mark all notifications as read
router.put('/mark-all-read',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const result = await notificationService.markAllAsRead(req.user!.id);
      res.json({ markedCount: result.count });
    } catch (error) {
      return next(error);
    }
  }
);

// Delete a specific notification
router.delete('/:notificationId',
  authenticate,
  validateParams(idSchema('notificationId')),
  async (req: AuthRequest, res, next) => {
    try {
      await notificationService.deleteNotification(
        req.user!.id,
        req.params.notificationId
      );
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }
);

// Delete all notifications for user
router.delete('/',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const result = await notificationService.deleteAllNotifications(req.user!.id);
      res.json({ deletedCount: result.count });
    } catch (error) {
      return next(error);
    }
  }
);

// Test endpoint for sending notifications (development only)
if (process.env.NODE_ENV === 'development') {
  router.post('/test',
    authenticate,
    validateBody(z.object({
      type: z.string(),
      title: z.string(),
      message: z.string(),
      recipientId: z.string().optional()
    })),
    async (req: AuthRequest, res, next) => {
      try {
        const notifications = await notificationService.createNotification({
          type: req.body.type,
          title: req.body.title,
          message: req.body.message,
          recipients: req.body.recipientId ? [req.body.recipientId] : [req.user!.id]
        });
        res.json(notifications);
      } catch (error) {
        next(error);
      }
    }
  );
}

export { router as notificationRouter };