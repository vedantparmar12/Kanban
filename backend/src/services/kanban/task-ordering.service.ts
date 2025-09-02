import { prisma } from '../../database/connection';
import { AppError } from '../../api/middlewares/error.middleware';
import { logger } from '../../utils/logger';

export interface TaskReorderParams {
  taskId: string;
  newColumnId: string;
  newPosition: number;
  swimlaneId?: string;
  userId: string;
}

export interface TaskOrderItem {
  id: string;
  position: number;
}

export class TaskOrderingService {
  
  /**
   * Reorder a task within a column or move it to a different column
   * Uses a proper algorithm to handle position conflicts during drag-and-drop
   */
  async reorderTask(params: TaskReorderParams): Promise<void> {
    const { taskId, newColumnId, newPosition, swimlaneId, userId } = params;

    // Validate task exists and user has access
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: {
          include: {
            board: {
              select: { id: true, ownerId: true, members: true }
            }
          }
        }
      }
    });

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    // Check user access to board
    const hasAccess = task.column.board.ownerId === userId || 
                     task.column.board.members.some(member => member.userId === userId);

    if (!hasAccess) {
      throw new AppError(403, 'Access denied');
    }

    const oldColumnId = task.columnId;
    const oldPosition = task.position;

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // If moving to a different column
      if (oldColumnId !== newColumnId) {
        await this.moveTaskToNewColumn(tx, taskId, oldColumnId, newColumnId, newPosition, swimlaneId);
      } else {
        // Reordering within the same column
        await this.reorderWithinColumn(tx, taskId, newColumnId, oldPosition, newPosition, swimlaneId);
      }

      // Update the task's column and position
      await tx.task.update({
        where: { id: taskId },
        data: {
          columnId: newColumnId,
          position: newPosition,
          swimlaneId: swimlaneId || null,
          updatedAt: new Date()
        }
      });

      logger.info(`Task ${taskId} moved from column ${oldColumnId} position ${oldPosition} to column ${newColumnId} position ${newPosition}`);
    });
  }

  /**
   * Move task to a new column and update positions in both columns
   */
  private async moveTaskToNewColumn(
    tx: any,
    taskId: string,
    oldColumnId: string,
    newColumnId: string,
    newPosition: number,
    swimlaneId?: string
  ): Promise<void> {
    // Get tasks in the new column to make space
    const newColumnTasks = await tx.task.findMany({
      where: {
        columnId: newColumnId,
        ...(swimlaneId && { swimlaneId }),
        id: { not: taskId }
      },
      orderBy: { position: 'asc' },
      select: { id: true, position: true }
    });

    // Update positions in new column: shift tasks down that are >= newPosition
    for (const task of newColumnTasks) {
      if (task.position >= newPosition) {
        await tx.task.update({
          where: { id: task.id },
          data: { position: task.position + 1 }
        });
      }
    }

    // Compact positions in old column (remove gaps)
    await this.compactColumnPositions(tx, oldColumnId, swimlaneId);
  }

  /**
   * Reorder task within the same column
   */
  private async reorderWithinColumn(
    tx: any,
    taskId: string,
    columnId: string,
    oldPosition: number,
    newPosition: number,
    swimlaneId?: string
  ): Promise<void> {
    if (oldPosition === newPosition) {
      return; // No change needed
    }

    const tasks = await tx.task.findMany({
      where: {
        columnId,
        ...(swimlaneId && { swimlaneId }),
        id: { not: taskId }
      },
      orderBy: { position: 'asc' },
      select: { id: true, position: true }
    });

    if (oldPosition < newPosition) {
      // Moving down: shift tasks up between old and new position
      for (const task of tasks) {
        if (task.position > oldPosition && task.position <= newPosition) {
          await tx.task.update({
            where: { id: task.id },
            data: { position: task.position - 1 }
          });
        }
      }
    } else {
      // Moving up: shift tasks down between new and old position
      for (const task of tasks) {
        if (task.position >= newPosition && task.position < oldPosition) {
          await tx.task.update({
            where: { id: task.id },
            data: { position: task.position + 1 }
          });
        }
      }
    }
  }

  /**
   * Compact positions in a column to remove gaps
   * This helps maintain clean, sequential positioning
   */
  private async compactColumnPositions(tx: any, columnId: string, swimlaneId?: string): Promise<void> {
    const tasks = await tx.task.findMany({
      where: {
        columnId,
        ...(swimlaneId && { swimlaneId })
      },
      orderBy: { position: 'asc' },
      select: { id: true }
    });

    // Update positions to be sequential starting from 0
    for (let i = 0; i < tasks.length; i++) {
      await tx.task.update({
        where: { id: tasks[i].id },
        data: { position: i }
      });
    }
  }

  /**
   * Get the next position for a new task in a column
   */
  async getNextPosition(columnId: string, swimlaneId?: string): Promise<number> {
    const maxPositionResult = await prisma.task.findFirst({
      where: {
        columnId,
        ...(swimlaneId && { swimlaneId })
      },
      orderBy: { position: 'desc' },
      select: { position: true }
    });

    return (maxPositionResult?.position ?? -1) + 1;
  }

  /**
   * Bulk reorder multiple tasks (useful for drag-and-drop of multiple items)
   */
  async bulkReorderTasks(orders: TaskOrderItem[], columnId: string, userId: string, swimlaneId?: string): Promise<void> {
    // Validate all tasks exist and user has access
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: orders.map(o => o.id) },
        column: {
          board: {
            OR: [
              { ownerId: userId },
              { members: { some: { userId } } }
            ]
          }
        }
      },
      include: {
        column: {
          include: {
            board: { select: { id: true } }
          }
        }
      }
    });

    if (tasks.length !== orders.length) {
      throw new AppError(400, 'Some tasks not found or access denied');
    }

    // Use transaction for atomicity
    await prisma.$transaction(async (tx) => {
      for (const order of orders) {
        await tx.task.update({
          where: { id: order.id },
          data: { 
            position: order.position,
            columnId,
            ...(swimlaneId && { swimlaneId }),
            updatedAt: new Date()
          }
        });
      }
    });

    logger.info(`Bulk reordered ${orders.length} tasks in column ${columnId}`);
  }

  /**
   * Fix any position conflicts in a column (maintenance function)
   */
  async fixColumnPositions(columnId: string, swimlaneId?: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await this.compactColumnPositions(tx, columnId, swimlaneId);
    });

    logger.info(`Fixed positions in column ${columnId}${swimlaneId ? ` swimlane ${swimlaneId}` : ''}`);
  }

  /**
   * Get tasks in a column ordered by position
   */
  async getOrderedTasks(columnId: string, swimlaneId?: string): Promise<{ id: string; position: number; title: string }[]> {
    return prisma.task.findMany({
      where: {
        columnId,
        ...(swimlaneId && { swimlaneId })
      },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        position: true,
        title: true
      }
    });
  }
}

export const taskOrderingService = new TaskOrderingService();