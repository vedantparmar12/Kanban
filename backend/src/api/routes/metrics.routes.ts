import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { validateParams, validateQuery } from '../middlewares/validation.middleware';
import { metricsService } from '../../services/analytics/metrics.service';
import { z } from 'zod';
import { idSchema } from '../validators/schemas';

const router = Router();

const dateRangeSchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

// Get board metrics with cumulative flow and burndown data
router.get('/board/:boardId',
  authenticate,
  validateParams(idSchema('boardId')),
  validateQuery(dateRangeSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { dateFrom, dateTo, limit, offset } = req.query;
      
      const metrics = await metricsService.getBoardMetrics(
        req.params.boardId,
        req.user!.id,
        dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo ? new Date(dateTo as string) : undefined,
        limit as unknown as number,
        offset as unknown as number
      );
      
      // Add pagination metadata
      const totalTasks = await metricsService.getTotalTasksCount(req.params.boardId, dateFrom ? new Date(dateFrom as string) : undefined, dateTo ? new Date(dateTo as string) : undefined);
      const hasMore = (offset as unknown as number) + (limit as unknown as number) < totalTasks;
      
      return res.json({
        ...metrics,
        pagination: {
          limit,
          offset,
          total: totalTasks,
          hasMore
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get detailed metrics for a specific task
router.get('/task/:taskId',
  authenticate,
  validateParams(idSchema('taskId')),
  async (req: AuthRequest, res, next) => {
    try {
      const metrics = await metricsService.getTaskMetrics(
        req.params.taskId,
        req.user!.id
      );
      
      return res.json(metrics);
    } catch (error) {
      next(error);
    }
  }
);

// Get column-specific metrics
router.get('/column/:columnId',
  authenticate,
  validateParams(idSchema('columnId')),
  validateQuery(dateRangeSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { dateFrom, dateTo } = req.query;
      
      const metrics = await metricsService.getColumnMetrics(
        req.params.columnId,
        req.user!.id,
        dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo ? new Date(dateTo as string) : undefined
      );
      
      return res.json(metrics);
    } catch (error) {
      next(error);
    }
  }
);

// Get cycle time distribution for board
router.get('/board/:boardId/cycle-time-distribution',
  authenticate,
  validateParams(idSchema('boardId')),
  validateQuery(dateRangeSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { dateFrom, dateTo } = req.query;
      
      const boardMetrics = await metricsService.getBoardMetrics(
        req.params.boardId,
        req.user!.id,
        dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo ? new Date(dateTo as string) : undefined
      );
      
      // Extract cycle time distribution from column metrics
      const cycleTimeDistribution = boardMetrics.columnMetrics.map(col => ({
        columnName: col.columnName,
        averageCycleTime: col.averageCycleTime,
        throughput: col.throughput
      }));
      
      return res.json({ distribution: cycleTimeDistribution });
    } catch (error) {
      next(error);
    }
  }
);

// Get WIP limit violations summary
router.get('/board/:boardId/wip-violations',
  authenticate,
  validateParams(idSchema('boardId')),
  validateQuery(dateRangeSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { dateFrom, dateTo } = req.query;
      
      const boardMetrics = await metricsService.getBoardMetrics(
        req.params.boardId,
        req.user!.id,
        dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo ? new Date(dateTo as string) : undefined
      );
      
      const wipViolations = boardMetrics.columnMetrics.map(col => ({
        columnId: col.columnId,
        columnName: col.columnName,
        violations: col.wipViolations,
        tasksInProgress: col.tasksInProgress
      }));
      
      const totalViolations = wipViolations.reduce((sum, col) => sum + col.violations, 0);
      
      return res.json({ 
        totalViolations,
        violationsByColumn: wipViolations
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as metricsRouter };