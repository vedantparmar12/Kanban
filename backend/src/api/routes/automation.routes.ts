import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { automationService } from '../../services/automation/automation.service';
import { z } from 'zod';
import { AutomationTriggerType, AutomationActionType } from '@prisma/client';

const router = Router();

const createRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  boardId: z.string(),
  triggerType: z.nativeEnum(AutomationTriggerType),
  triggerConfig: z.record(z.any()),
  actionType: z.nativeEnum(AutomationActionType),
  actionConfig: z.record(z.any())
});

const updateRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  triggerConfig: z.record(z.any()).optional(),
  actionConfig: z.record(z.any()).optional()
});

const boardIdSchema = z.object({
  boardId: z.string()
});

const ruleIdSchema = z.object({
  ruleId: z.string()
});

// Get automation rules for a board
router.get('/',
  authenticate,
  validateQuery(boardIdSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const rules = await automationService.getRules(
        req.query.boardId as string,
        req.user!.id
      );
      res.json(rules);
    } catch (error) {
      next(error);
    }
  }
);

// Create new automation rule
router.post('/',
  authenticate,
  validateBody(createRuleSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const rule = await automationService.createRule(req.user!.id, req.body);
      res.status(201).json(rule);
    } catch (error) {
      next(error);
    }
  }
);

// Update automation rule
router.put('/:ruleId',
  authenticate,
  validateParams(ruleIdSchema),
  validateBody(updateRuleSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const rule = await automationService.updateRule(
        req.params.ruleId,
        req.user!.id,
        req.body
      );
      res.json(rule);
    } catch (error) {
      next(error);
    }
  }
);

// Delete automation rule
router.delete('/:ruleId',
  authenticate,
  validateParams(ruleIdSchema),
  async (req: AuthRequest, res, next) => {
    try {
      await automationService.deleteRule(req.params.ruleId, req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// Get automation rule executions
router.get('/:ruleId/executions',
  authenticate,
  validateParams(ruleIdSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const executions = await prisma.automationExecution.findMany({
        where: { ruleId: req.params.ruleId },
        include: {
          rule: {
            select: { boardId: true }
          },
          task: {
            select: { id: true, title: true }
          }
        },
        orderBy: { executedAt: 'desc' },
        take: 50
      });

      // Check board access
      if (executions.length > 0) {
        await automationService['checkBoardAccess'](executions[0].rule.boardId, req.user!.id);
      }

      res.json(executions);
    } catch (error) {
      next(error);
    }
  }
);

// Get available trigger types and their configurations
router.get('/trigger-types',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const triggerTypes = [
        {
          type: 'TASK_CREATED',
          name: 'Task Created',
          description: 'Triggers when a new task is created',
          configSchema: {}
        },
        {
          type: 'TASK_MOVED',
          name: 'Task Moved',
          description: 'Triggers when a task is moved between columns',
          configSchema: {
            fromColumnId: { type: 'string', optional: true, description: 'Source column ID' },
            toColumnId: { type: 'string', optional: true, description: 'Target column ID' }
          }
        },
        {
          type: 'TASK_UPDATED',
          name: 'Task Updated',
          description: 'Triggers when task properties are updated',
          configSchema: {
            field: { type: 'string', optional: true, description: 'Specific field to watch' }
          }
        },
        {
          type: 'TASK_COMPLETED',
          name: 'Task Completed',
          description: 'Triggers when a task is marked as done',
          configSchema: {}
        },
        {
          type: 'TASK_OVERDUE',
          name: 'Task Overdue',
          description: 'Triggers when a task becomes overdue',
          configSchema: {}
        },
        {
          type: 'ASSIGNED_TO_USER',
          name: 'Task Assigned',
          description: 'Triggers when a task is assigned to a user',
          configSchema: {
            userId: { type: 'string', optional: true, description: 'Specific user ID' }
          }
        },
        {
          type: 'PRIORITY_CHANGED',
          name: 'Priority Changed',
          description: 'Triggers when task priority is changed',
          configSchema: {
            priority: { type: 'string', optional: true, description: 'Specific priority level' }
          }
        },
        {
          type: 'DUE_DATE_APPROACHING',
          name: 'Due Date Approaching',
          description: 'Triggers when a task due date is approaching',
          configSchema: {
            daysBefore: { type: 'number', default: 1, description: 'Days before due date' }
          }
        }
      ];

      res.json(triggerTypes);
    } catch (error) {
      next(error);
    }
  }
);

// Get available action types and their configurations
router.get('/action-types',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const actionTypes = [
        {
          type: 'MOVE_TASK',
          name: 'Move Task',
          description: 'Move the task to a different column',
          configSchema: {
            columnId: { type: 'string', required: true, description: 'Target column ID' },
            swimlaneId: { type: 'string', optional: true, description: 'Target swimlane ID' }
          }
        },
        {
          type: 'ASSIGN_USER',
          name: 'Assign User',
          description: 'Assign the task to a specific user',
          configSchema: {
            userId: { type: 'string', required: true, description: 'User ID to assign' }
          }
        },
        {
          type: 'ADD_LABEL',
          name: 'Add Label',
          description: 'Add a label to the task',
          configSchema: {
            labelId: { type: 'string', required: true, description: 'Label ID to add' }
          }
        },
        {
          type: 'REMOVE_LABEL',
          name: 'Remove Label',
          description: 'Remove a label from the task',
          configSchema: {
            labelId: { type: 'string', required: true, description: 'Label ID to remove' }
          }
        },
        {
          type: 'SET_PRIORITY',
          name: 'Set Priority',
          description: 'Change the task priority',
          configSchema: {
            priority: { type: 'string', required: true, description: 'Priority level' }
          }
        },
        {
          type: 'SET_DUE_DATE',
          name: 'Set Due Date',
          description: 'Set or update the task due date',
          configSchema: {
            dueDate: { type: 'string', required: true, description: 'Due date (ISO string)' }
          }
        },
        {
          type: 'SEND_NOTIFICATION',
          name: 'Send Notification',
          description: 'Send a notification to users',
          configSchema: {
            title: { type: 'string', required: true, description: 'Notification title' },
            message: { type: 'string', required: true, description: 'Notification message' }
          }
        },
        {
          type: 'ADD_COMMENT',
          name: 'Add Comment',
          description: 'Add a comment to the task',
          configSchema: {
            comment: { type: 'string', required: true, description: 'Comment text' }
          }
        },
        {
          type: 'CREATE_SUBTASK',
          name: 'Create Subtask',
          description: 'Create a subtask under this task',
          configSchema: {
            title: { type: 'string', required: true, description: 'Subtask title' },
            description: { type: 'string', optional: true, description: 'Subtask description' }
          }
        }
      ];

      res.json(actionTypes);
    } catch (error) {
      next(error);
    }
  }
);

// Manual trigger for testing rules
router.post('/:ruleId/test',
  authenticate,
  validateParams(ruleIdSchema),
  validateBody(z.object({ taskId: z.string() })),
  async (req: AuthRequest, res, next) => {
    try {
      const rule = await prisma.automationRule.findUnique({
        where: { id: req.params.ruleId },
        include: { board: true }
      });

      if (!rule) {
        throw new AppError(404, 'Automation rule not found');
      }

      await automationService['checkBoardAccess'](rule.boardId, req.user!.id);

      const task = await prisma.task.findUnique({
        where: { id: req.body.taskId },
        include: { column: true }
      });

      if (!task) {
        throw new AppError(404, 'Task not found');
      }

      const context = {
        taskId: task.id,
        userId: req.user!.id,
        boardId: rule.boardId,
        columnId: task.columnId,
        currentValues: task
      };

      // Execute the rule manually for testing
      await automationService['executeRule'](rule, context);

      res.json({ message: 'Rule executed successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export { router as automationRouter };