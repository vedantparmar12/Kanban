import { prisma } from '../../database/connection';
import { AppError } from '../../api/middlewares/error.middleware';
import { logger } from '../../utils/logger';
import { AutomationTriggerType, AutomationActionType } from '@prisma/client';

export interface TriggerConfig {
  [key: string]: any;
}

export interface ActionConfig {
  [key: string]: any;
}

export interface AutomationContext {
  taskId: string;
  userId: string;
  boardId: string;
  columnId?: string;
  swimlaneId?: string;
  previousValues?: any;
  currentValues?: any;
  triggerData?: any;
}

export class AutomationService {
  async createRule(userId: string, data: {
    name: string;
    description?: string;
    boardId: string;
    triggerType: AutomationTriggerType;
    triggerConfig: TriggerConfig;
    actionType: AutomationActionType;
    actionConfig: ActionConfig;
  }) {
    await this.checkBoardAccess(data.boardId, userId);

    const rule = await prisma.automationRule.create({
      data: {
        name: data.name,
        description: data.description,
        boardId: data.boardId,
        creatorId: userId,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig,
        actionType: data.actionType,
        actionConfig: data.actionConfig
      }
    });

    logger.info(`Automation rule created: ${rule.id} by user: ${userId}`);
    return rule;
  }

  async getRules(boardId: string, userId: string) {
    await this.checkBoardAccess(boardId, userId);

    const rules = await prisma.automationRule.findMany({
      where: { boardId },
      include: {
        creator: {
          select: { id: true, username: true, avatar: true }
        },
        _count: {
          select: { executions: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return rules;
  }

  async updateRule(ruleId: string, userId: string, data: {
    name?: string;
    description?: string;
    isActive?: boolean;
    triggerConfig?: TriggerConfig;
    actionConfig?: ActionConfig;
  }) {
    const rule = await prisma.automationRule.findUnique({
      where: { id: ruleId },
      include: { board: true }
    });

    if (!rule) {
      throw new AppError(404, 'Automation rule not found');
    }

    await this.checkBoardAccess(rule.boardId, userId);

    const updatedRule = await prisma.automationRule.update({
      where: { id: ruleId },
      data
    });

    logger.info(`Automation rule updated: ${ruleId} by user: ${userId}`);
    return updatedRule;
  }

  async deleteRule(ruleId: string, userId: string) {
    const rule = await prisma.automationRule.findUnique({
      where: { id: ruleId }
    });

    if (!rule) {
      throw new AppError(404, 'Automation rule not found');
    }

    await this.checkBoardAccess(rule.boardId, userId);

    await prisma.automationRule.delete({
      where: { id: ruleId }
    });

    logger.info(`Automation rule deleted: ${ruleId} by user: ${userId}`);
  }

  async executeAutomationsForEvent(
    triggerType: AutomationTriggerType,
    context: AutomationContext
  ) {
    try {
      const rules = await prisma.automationRule.findMany({
        where: {
          boardId: context.boardId,
          triggerType,
          isActive: true
        }
      });

      for (const rule of rules) {
        await this.executeRule(rule, context);
      }
    } catch (error) {
      logger.error('Error executing automations:', error);
    }
  }

  private async executeRule(rule: any, context: AutomationContext) {
    try {
      // Check if trigger conditions are met
      if (!this.evaluateTriggerConditions(rule.triggerType, rule.triggerConfig, context)) {
        await this.recordExecution(rule.id, context.taskId, 'skipped', 'Trigger conditions not met');
        return;
      }

      // Execute the action
      const success = await this.executeAction(rule.actionType, rule.actionConfig, context);

      if (success) {
        // Update rule execution count
        await prisma.automationRule.update({
          where: { id: rule.id },
          data: {
            executionCount: { increment: 1 },
            lastExecuted: new Date()
          }
        });

        await this.recordExecution(rule.id, context.taskId, 'success');
        logger.info(`Automation rule executed successfully: ${rule.id}`);
      } else {
        await this.recordExecution(rule.id, context.taskId, 'failed', 'Action execution failed');
      }
    } catch (error) {
      logger.error(`Error executing automation rule ${rule.id}:`, error);
      await this.recordExecution(rule.id, context.taskId, 'failed', (error as any).message);
    }
  }

  private evaluateTriggerConditions(
    triggerType: AutomationTriggerType,
    triggerConfig: TriggerConfig,
    context: AutomationContext
  ): boolean {
    switch (triggerType) {
      case 'TASK_CREATED':
        return true; // Always trigger for task creation

      case 'TASK_MOVED':
        if (triggerConfig.fromColumnId && context.previousValues?.columnId !== triggerConfig.fromColumnId) {
          return false;
        }
        if (triggerConfig.toColumnId && context.columnId !== triggerConfig.toColumnId) {
          return false;
        }
        return true;

      case 'TASK_UPDATED':
        if (triggerConfig.field) {
          return context.previousValues?.[triggerConfig.field] !== context.currentValues?.[triggerConfig.field];
        }
        return true;

      case 'TASK_COMPLETED':
        return context.currentValues?.status === 'DONE';

      case 'ASSIGNED_TO_USER':
        if (triggerConfig.userId) {
          return context.currentValues?.assigneeId === triggerConfig.userId;
        }
        return context.currentValues?.assigneeId !== null;

      case 'PRIORITY_CHANGED':
        if (triggerConfig.priority) {
          return context.currentValues?.priority === triggerConfig.priority;
        }
        return context.previousValues?.priority !== context.currentValues?.priority;

      case 'DUE_DATE_APPROACHING':
        if (context.currentValues?.dueDate) {
          const dueDate = new Date(context.currentValues.dueDate);
          const now = new Date();
          const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
          return daysUntilDue <= (triggerConfig.daysBefore || 1);
        }
        return false;

      default:
        return false;
    }
  }

  private async executeAction(
    actionType: AutomationActionType,
    actionConfig: ActionConfig,
    context: AutomationContext
  ): Promise<boolean> {
    try {
      switch (actionType) {
        case 'MOVE_TASK':
          await this.moveTask(context.taskId, actionConfig.columnId, actionConfig.swimlaneId);
          return true;

        case 'ASSIGN_USER':
          await this.assignUser(context.taskId, actionConfig.userId);
          return true;

        case 'ADD_LABEL':
          await this.addLabel(context.taskId, actionConfig.labelId);
          return true;

        case 'REMOVE_LABEL':
          await this.removeLabel(context.taskId, actionConfig.labelId);
          return true;

        case 'SET_PRIORITY':
          await this.setPriority(context.taskId, actionConfig.priority);
          return true;

        case 'SET_DUE_DATE':
          await this.setDueDate(context.taskId, actionConfig.dueDate);
          return true;

        case 'SEND_NOTIFICATION':
          await this.sendNotification(
            context.userId,
            actionConfig.title || 'Automation Triggered',
            actionConfig.message || 'An automation rule was triggered for your task',
            { taskId: context.taskId, ruleType: actionType }
          );
          return true;

        case 'ADD_COMMENT':
          await this.addComment(context.taskId, context.userId, actionConfig.comment);
          return true;

        case 'CREATE_SUBTASK':
          await this.createSubtask(context.taskId, actionConfig.title, actionConfig.description);
          return true;

        default:
          logger.warn(`Unknown automation action type: ${actionType}`);
          return false;
      }
    } catch (error) {
      logger.error(`Error executing automation action ${actionType}:`, error);
      return false;
    }
  }

  // Action implementation methods
  private async moveTask(taskId: string, columnId: string, swimlaneId?: string) {
    const maxPosition = await prisma.task.findFirst({
      where: { columnId },
      orderBy: { position: 'desc' },
      select: { position: true }
    });

    await prisma.task.update({
      where: { id: taskId },
      data: {
        columnId,
        swimlaneId,
        position: (maxPosition?.position ?? -1) + 1
      }
    });
  }

  private async assignUser(taskId: string, userId: string) {
    await prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: userId }
    });
  }

  private async addLabel(taskId: string, labelId: string) {
    try {
      await prisma.taskLabel.create({
        data: { taskId, labelId }
      });
    } catch (error) {
      // Ignore if label already exists
      if (!(error as any).code || (error as any).code !== 'P2002') {
        throw error;
      }
    }
  }

  private async removeLabel(taskId: string, labelId: string) {
    await prisma.taskLabel.deleteMany({
      where: { taskId, labelId }
    });
  }

  private async setPriority(taskId: string, priority: string) {
    await prisma.task.update({
      where: { id: taskId },
      data: { priority: priority as any }
    });
  }

  private async setDueDate(taskId: string, dueDate: string | Date) {
    await prisma.task.update({
      where: { id: taskId },
      data: { dueDate: new Date(dueDate) }
    });
  }

  private async sendNotification(userId: string, title: string, message: string, metadata?: any) {
    await prisma.notification.create({
      data: {
        type: 'automation',
        title,
        message,
        userId,
        metadata
      }
    });
  }

  private async addComment(taskId: string, userId: string, content: string) {
    await prisma.comment.create({
      data: {
        content,
        taskId,
        authorId: userId
      }
    });
  }

  private async createSubtask(taskId: string, title: string, description?: string) {
    const parentTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { columnId: true, creatorId: true }
    });

    if (!parentTask) return;

    const maxPosition = await prisma.task.findFirst({
      where: { columnId: parentTask.columnId },
      orderBy: { position: 'desc' },
      select: { position: true }
    });

    await prisma.task.create({
      data: {
        title,
        description,
        columnId: parentTask.columnId,
        parentTaskId: taskId,
        creatorId: parentTask.creatorId,
        position: (maxPosition?.position ?? -1) + 1
      }
    });
  }

  private async recordExecution(
    ruleId: string,
    taskId: string | null,
    status: string,
    errorMessage?: string
  ) {
    await prisma.automationExecution.create({
      data: {
        ruleId,
        taskId,
        status,
        errorMessage
      }
    });
  }

  private async checkBoardAccess(boardId: string, userId: string) {
    const access = await prisma.board.findFirst({
      where: {
        id: boardId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      }
    });

    if (!access) {
      throw new AppError(403, 'Access denied');
    }
  }

  // Scheduled automation checks (called by cron job)
  async runScheduledChecks() {
    try {
      await this.checkOverdueTasks();
      await this.checkApproachingDueDates();
      await this.checkTimeInColumn();
      await this.checkWipLimits();
    } catch (error) {
      logger.error('Error running scheduled automation checks:', error);
    }
  }

  private async checkOverdueTasks() {
    const now = new Date();
    const overdueTasks = await prisma.task.findMany({
      where: {
        dueDate: { lt: now },
        completedAt: null
      },
      include: {
        column: { include: { board: true } }
      }
    });

    for (const task of overdueTasks) {
      const context: AutomationContext = {
        taskId: task.id,
        userId: task.creatorId,
        boardId: task.column.board.id,
        columnId: task.columnId,
        triggerData: { overdueBy: now.getTime() - task.dueDate!.getTime() }
      };

      await this.executeAutomationsForEvent('TASK_OVERDUE', context);
    }
  }

  private async checkApproachingDueDates() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tasks = await prisma.task.findMany({
      where: {
        dueDate: { lte: tomorrow },
        completedAt: null
      },
      include: {
        column: { include: { board: true } }
      }
    });

    for (const task of tasks) {
      const context: AutomationContext = {
        taskId: task.id,
        userId: task.creatorId,
        boardId: task.column.board.id,
        currentValues: task
      };

      await this.executeAutomationsForEvent('DUE_DATE_APPROACHING', context);
    }
  }

  private async checkTimeInColumn() {
    // Check tasks that have been in columns for too long
    const threeHoursAgo = new Date();
    threeHoursAgo.setHours(threeHoursAgo.getHours() - 3);

    const staleTasks = await prisma.task.findMany({
      where: {
        updatedAt: { lte: threeHoursAgo },
        completedAt: null
      },
      include: {
        column: { include: { board: true } }
      }
    });

    for (const task of staleTasks) {
      const context: AutomationContext = {
        taskId: task.id,
        userId: task.creatorId,
        boardId: task.column.board.id,
        triggerData: { hoursInColumn: (Date.now() - task.updatedAt.getTime()) / (1000 * 60 * 60) }
      };

      await this.executeAutomationsForEvent('TIME_IN_COLUMN', context);
    }
  }

  private async checkWipLimits() {
    const columnsWithLimits = await prisma.column.findMany({
      where: {
        wipLimit: { not: null }
      },
      include: {
        tasks: {
          where: { completedAt: null }
        },
        board: true
      }
    });

    for (const column of columnsWithLimits) {
      if (column.tasks.length > column.wipLimit!) {
        // Find the most recently moved task that caused the violation
        const latestTask = column.tasks.sort((a, b) => 
          b.updatedAt.getTime() - a.updatedAt.getTime()
        )[0];

        const context: AutomationContext = {
          taskId: latestTask.id,
          userId: latestTask.creatorId,
          boardId: column.board.id,
          columnId: column.id,
          triggerData: { 
            wipLimit: column.wipLimit,
            currentCount: column.tasks.length,
            violation: column.tasks.length - column.wipLimit!
          }
        };

        await this.executeAutomationsForEvent('WIP_LIMIT_EXCEEDED', context);
      }
    }
  }
}

export const automationService = new AutomationService();