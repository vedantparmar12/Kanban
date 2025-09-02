import { prisma } from '../../database/connection';
import { AppError } from '../../api/middlewares/error.middleware';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { logger } from '../../utils/logger';
import { automationService } from '../automation/automation.service';
import { notificationService } from '../notifications/notification.service';

export class TaskService {
  async getTasks(userId: string, filters: any) {
    const where: any = {
      column: {
        board: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } }
          ]
        }
      }
    };

    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    const skip = (filters.page - 1) * filters.limit;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          assignee: {
            select: { id: true, username: true, avatar: true }
          },
          column: {
            include: {
              board: {
                select: { id: true, name: true }
              }
            }
          },
          swimlane: {
            select: { id: true, name: true, color: true }
          },
          labels: {
            include: { label: true }
          },
          _count: {
            select: { comments: true, attachments: true, subTasks: true }
          }
        },
        skip,
        take: filters.limit,
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.task.count({ where })
    ]);

    return {
      tasks,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit)
      }
    };
  }

  async createTask(userId: string, data: any) {
    const column = await prisma.column.findUnique({
      where: { id: data.columnId },
      include: { board: true }
    });

    if (!column) {
      throw new AppError(404, 'Column not found');
    }

    await this.checkBoardAccess(column.boardId, userId);

    // Check WIP limits before creating task
    await this.checkWipLimit(data.columnId);

    const maxPosition = await prisma.task.findFirst({
      where: { columnId: data.columnId },
      orderBy: { position: 'desc' },
      select: { position: true }
    });

    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        columnId: data.columnId,
        swimlaneId: data.swimlaneId,
        position: (maxPosition?.position ?? -1) + 1,
        priority: data.priority || TaskPriority.MEDIUM,
        status: TaskStatus.TODO,
        assigneeId: data.assigneeId,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        estimatedHours: data.estimatedHours,
        creatorId: userId,
        labels: data.labelIds ? {
          create: data.labelIds.map((labelId: string) => ({ labelId }))
        } : undefined
      },
      include: {
        assignee: {
          select: { id: true, username: true, avatar: true }
        },
        creator: {
          select: { id: true, username: true, avatar: true }
        },
        labels: {
          include: { label: true }
        }
      }
    });

    await this.createActivity(column.boardId, task.id, userId, 'task_created', {
      taskTitle: task.title
    });

    // Trigger automation for task creation
    await automationService.executeAutomationsForEvent('TASK_CREATED', {
      taskId: task.id,
      userId,
      boardId: column.boardId,
      columnId: task.columnId,
      swimlaneId: task.swimlaneId,
      currentValues: task
    });

    logger.info(`Task created: ${task.id} by user: ${userId}`);
    return task;
  }

  async getTask(taskId: string, userId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: {
          select: { id: true, username: true, avatar: true, email: true }
        },
        creator: {
          select: { id: true, username: true, avatar: true }
        },
        column: {
          include: {
            board: {
              select: { id: true, name: true }
            }
          }
        },
        labels: {
          include: { label: true }
        },
        comments: {
          include: {
            author: {
              select: { id: true, username: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        attachments: true,
        subTasks: {
          include: {
            assignee: {
              select: { id: true, username: true, avatar: true }
            }
          }
        },
        activities: {
          include: {
            user: {
              select: { id: true, username: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    await this.checkBoardAccess(task.column.boardId, userId);

    return task;
  }

  async updateTask(taskId: string, userId: string, data: any) {
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: true }
    });

    if (!existingTask) {
      throw new AppError(404, 'Task not found');
    }

    await this.checkBoardAccess(existingTask.column.boardId, userId);

    const updateData: any = { ...data };
    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }

    if (data.status === TaskStatus.DONE && existingTask.status !== TaskStatus.DONE) {
      updateData.completedAt = new Date();
    } else if (data.status !== TaskStatus.DONE && existingTask.status === TaskStatus.DONE) {
      updateData.completedAt = null;
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        assignee: {
          select: { id: true, username: true, avatar: true }
        },
        labels: {
          include: { label: true }
        }
      }
    });

    await this.createActivity(existingTask.column.boardId, taskId, userId, 'task_updated', {
      changes: Object.keys(data)
    });

    // Trigger automation for task updates
    await automationService.executeAutomationsForEvent('TASK_UPDATED', {
      taskId,
      userId,
      boardId: existingTask.column.boardId,
      columnId: existingTask.columnId,
      previousValues: existingTask,
      currentValues: task
    });

    // Trigger completion automation if status changed to DONE
    if (data.status === TaskStatus.DONE && existingTask.status !== TaskStatus.DONE) {
      await automationService.executeAutomationsForEvent('TASK_COMPLETED', {
        taskId,
        userId,
        boardId: existingTask.column.boardId,
        columnId: existingTask.columnId,
        currentValues: task
      });
      
      // Send completion notification
      await notificationService.notifyTaskCompleted(taskId, userId);
    }

    // Trigger assignment automation if assignee changed
    if (data.assigneeId !== undefined && data.assigneeId !== existingTask.assigneeId) {
      await automationService.executeAutomationsForEvent('ASSIGNED_TO_USER', {
        taskId,
        userId,
        boardId: existingTask.column.boardId,
        columnId: existingTask.columnId,
        previousValues: existingTask,
        currentValues: task
      });
      
      // Send assignment notification
      if (data.assigneeId) {
        await notificationService.notifyTaskAssigned(taskId, data.assigneeId, userId);
      }
    }

    // Trigger priority automation if priority changed
    if (data.priority && data.priority !== existingTask.priority) {
      await automationService.executeAutomationsForEvent('PRIORITY_CHANGED', {
        taskId,
        userId,
        boardId: existingTask.column.boardId,
        columnId: existingTask.columnId,
        previousValues: existingTask,
        currentValues: task
      });
    }

    logger.info(`Task updated: ${taskId} by user: ${userId}`);
    return task;
  }

  async deleteTask(taskId: string, userId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: true }
    });

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    await this.checkBoardAccess(task.column.boardId, userId);

    await prisma.task.delete({
      where: { id: taskId }
    });

    await this.createActivity(task.column.boardId, null, userId, 'task_deleted', {
      taskTitle: task.title
    });

    logger.info(`Task deleted: ${taskId} by user: ${userId}`);
  }

  async moveTask(taskId: string, userId: string, columnId: string, position: number, swimlaneId?: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: true }
    });

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    const newColumn = await prisma.column.findUnique({
      where: { id: columnId },
      include: { board: true }
    });

    if (!newColumn) {
      throw new AppError(404, 'Column not found');
    }

    if (task.column.boardId !== newColumn.boardId) {
      throw new AppError(400, 'Cannot move task to different board');
    }

    await this.checkBoardAccess(task.column.boardId, userId);

    // Check WIP limits before moving to new column
    if (task.columnId !== columnId) {
      await this.checkWipLimit(columnId, taskId);
    }

    await prisma.$transaction(async (tx) => {
      if (task.columnId === columnId) {
        await tx.task.updateMany({
          where: {
            columnId,
            position: {
              gte: Math.min(task.position, position),
              lte: Math.max(task.position, position)
            },
            id: { not: taskId }
          },
          data: {
            position: {
              increment: task.position < position ? -1 : 1
            }
          }
        });
      } else {
        await tx.task.updateMany({
          where: {
            columnId: task.columnId,
            position: { gt: task.position }
          },
          data: {
            position: { decrement: 1 }
          }
        });

        await tx.task.updateMany({
          where: {
            columnId,
            position: { gte: position }
          },
          data: {
            position: { increment: 1 }
          }
        });
      }

      await tx.task.update({
        where: { id: taskId },
        data: { 
          columnId, 
          position,
          ...(swimlaneId !== undefined && { swimlaneId })
        }
      });
    });

    const updatedTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: {
          select: { id: true, username: true, avatar: true }
        },
        labels: {
          include: { label: true }
        }
      }
    });

    await this.createActivity(task.column.boardId, taskId, userId, 'task_moved', {
      fromColumn: task.column.name,
      toColumn: newColumn.name
    });

    // Trigger automation for task movement
    await automationService.executeAutomationsForEvent('TASK_MOVED', {
      taskId,
      userId,
      boardId: task.column.boardId,
      columnId,
      swimlaneId,
      previousValues: { columnId: task.columnId, swimlaneId: task.swimlaneId },
      currentValues: { columnId, swimlaneId }
    });

    logger.info(`Task moved: ${taskId} to column: ${columnId} by user: ${userId}`);
    return updatedTask;
  }

  async addComment(taskId: string, userId: string, content: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: true }
    });

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    await this.checkBoardAccess(task.column.boardId, userId);

    const comment = await prisma.comment.create({
      data: {
        content,
        taskId,
        authorId: userId
      },
      include: {
        author: {
          select: { id: true, username: true, avatar: true }
        }
      }
    });

    await this.createActivity(task.column.boardId, taskId, userId, 'comment_added', {
      commentPreview: content.substring(0, 100)
    });

    // Send comment notification
    await notificationService.notifyCommentAdded(taskId, comment.id, userId, content);

    logger.info(`Comment added to task: ${taskId} by user: ${userId}`);
    return comment;
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

  private async createActivity(
    boardId: string,
    taskId: string | null,
    userId: string,
    action: string,
    metadata?: any
  ) {
    await prisma.activity.create({
      data: {
        action,
        entityType: 'task',
        entityId: taskId || '',
        boardId,
        taskId,
        userId,
        metadata
      }
    });
  }

  private async checkWipLimit(columnId: string, excludeTaskId?: string) {
    const column = await prisma.column.findUnique({
      where: { id: columnId },
      select: { name: true, wipLimit: true }
    });

    if (!column || !column.wipLimit) {
      return; // No WIP limit set
    }

    const currentTaskCount = await prisma.task.count({
      where: {
        columnId,
        ...(excludeTaskId && { id: { not: excludeTaskId } })
      }
    });

    if (currentTaskCount >= column.wipLimit) {
      // Send WIP limit notification to board members
      const columnWithBoard = await prisma.column.findUnique({
        where: { id: columnId },
        include: { board: true }
      });
      
      if (columnWithBoard) {
        await notificationService.notifyWipLimitExceeded(columnId, columnWithBoard.board.id);
      }
      
      throw new AppError(400, 
        `WIP limit exceeded for column "${column.name}". ` +
        `Current: ${currentTaskCount}, Limit: ${column.wipLimit}`
      );
    }
  }
}

export const taskService = new TaskService();