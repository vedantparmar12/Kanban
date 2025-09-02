import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { validateParams, validateQuery } from '../middlewares/validation.middleware';
import { metricsService } from '../../services/analytics/metrics.service';
import { z } from 'zod';

const router = Router();

const boardIdSchema = z.object({
  boardId: z.string()
});

const taskIdSchema = z.object({
  taskId: z.string()
});

const columnIdSchema = z.object({
  columnId: z.string()
});

const dateRangeSchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1).max(1000)).optional().default(100),
  offset: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(0)).optional().default(0)
});

// Get board metrics with cumulative flow and burndown data
router.get('/board/:boardId',
  authenticate,
  validateParams(boardIdSchema),
  validateQuery(dateRangeSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
      
      const limit = req.query.limit as number || 100;
      const offset = req.query.offset as number || 0;
      
      const metrics = await metricsService.getBoardMetrics(
        req.params.boardId,
        req.user!.id,
        dateFrom,
        dateTo,
        limit,
        offset
      );
      
      // Add pagination metadata
      const totalTasks = await metricsService.getTotalTasksCount(req.params.boardId, dateFrom, dateTo);
      const hasMore = offset + limit < totalTasks;
      
      res.json({
        ...metrics,
        pagination: {
          limit,
          offset,
          total: totalTasks,
          hasMore
        }
      });
      
      res.json(metrics);
    } catch (error) {
      next(error);
    }
  }
);

// Get detailed metrics for a specific task
router.get('/task/:taskId',
  authenticate,
  validateParams(taskIdSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const metrics = await metricsService.getTaskMetrics(
        req.params.taskId,
        req.user!.id
      );
      
      res.json(metrics);
    } catch (error) {
      next(error);
    }
  }
);

// Get column-specific metrics
router.get('/column/:columnId',
  authenticate,
  validateParams(columnIdSchema),
  validateQuery(dateRangeSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
      
      const metrics = await metricsService.getColumnMetrics(
        req.params.columnId,
        req.user!.id,
        dateFrom,
        dateTo
      );
      
      res.json(metrics);
    } catch (error) {
      next(error);
    }
  }
);

// Get cycle time distribution for board
router.get('/board/:boardId/cycle-time-distribution',
  authenticate,
  validateParams(boardIdSchema),
  validateQuery(dateRangeSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
      
      const boardMetrics = await metricsService.getBoardMetrics(
        req.params.boardId,
        req.user!.id,
        dateFrom,
        dateTo
      );
      
      // Extract cycle time distribution from column metrics
      const cycleTimeDistribution = boardMetrics.columnMetrics.map(col => ({
        columnName: col.columnName,
        averageCycleTime: col.averageCycleTime,
        throughput: col.throughput
      }));
      
      res.json({ distribution: cycleTimeDistribution });
    } catch (error) {
      next(error);
    }
  }
);

// Get WIP limit violations summary
router.get('/board/:boardId/wip-violations',
  authenticate,
  validateParams(boardIdSchema),
  validateQuery(dateRangeSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
      
      const boardMetrics = await metricsService.getBoardMetrics(
        req.params.boardId,
        req.user!.id,
        dateFrom,
        dateTo
      );
      
      const wipViolations = boardMetrics.columnMetrics.map(col => ({
        columnId: col.columnId,
        columnName: col.columnName,
        violations: col.wipViolations,
        tasksInProgress: col.tasksInProgress
      }));
      
      const totalViolations = wipViolations.reduce((sum, col) => sum + col.violations, 0);
      
      res.json({ 
        totalViolations,
        violationsByColumn: wipViolations
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as metricsRouter };