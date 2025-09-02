import { prisma } from '../../database/connection';
import { AppError } from '../../api/middlewares/error.middleware';
import { logger } from '../../utils/logger';
import { TaskStatus } from '@prisma/client';

export interface TaskMetrics {
  taskId: string;
  title: string;
  createdAt: Date;
  completedAt?: Date;
  cycleTime?: number; // hours from start to completion
  leadTime?: number; // hours from creation to completion
  timeInStatuses: Record<string, number>; // hours spent in each status
}

export interface ColumnMetrics {
  columnId: string;
  columnName: string;
  averageCycleTime: number;
  averageLeadTime: number;
  throughput: number; // tasks completed in period
  wipViolations: number;
  tasksInProgress: number;
  tasksCompleted: number;
}

export interface BoardMetrics {
  boardId: string;
  boardName: string;
  totalTasks: number;
  completedTasks: number;
  averageCycleTime: number;
  averageLeadTime: number;
  throughput: number;
  cumulativeFlowData: CumulativeFlowDataPoint[];
  burndownData: BurndownDataPoint[];
  columnMetrics: ColumnMetrics[];
}

export interface CumulativeFlowDataPoint {
  date: Date;
  [columnName: string]: number | Date;
}

export interface BurndownDataPoint {
  date: Date;
  totalTasks: number;
  completedTasks: number;
  remainingTasks: number;
  idealBurndown: number;
}

export class MetricsService {
  async getBoardMetrics(boardId: string, userId: string, dateFrom?: Date, dateTo?: Date): Promise<BoardMetrics> {
    await this.checkBoardAccess(boardId, userId);

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        columns: {
          include: {
            tasks: {
              where: {
                createdAt: {
                  ...(dateFrom && { gte: dateFrom }),
                  ...(dateTo && { lte: dateTo })
                }
              },
              include: {
                activities: {
                  where: {
                    action: { in: ['task_created', 'task_moved', 'task_updated'] }
                  },
                  orderBy: { createdAt: 'asc' }
                }
              }
            }
          }
        }
      }
    });

    if (!board) {
      throw new AppError(404, 'Board not found');
    }

    const allTasks = board.columns.flatMap(col => col.tasks);
    const completedTasks = allTasks.filter(task => task.completedAt);
    
    // Calculate individual task metrics
    const taskMetrics = await this.calculateTaskMetrics(allTasks);
    
    // Calculate column metrics
    const columnMetrics = await Promise.all(
      board.columns.map(column => this.calculateColumnMetrics(column, dateFrom, dateTo))
    );

    // Calculate board-level metrics
    const averageCycleTime = this.calculateAverage(taskMetrics.map(t => t.cycleTime).filter(Boolean) as number[]);
    const averageLeadTime = this.calculateAverage(taskMetrics.map(t => t.leadTime).filter(Boolean) as number[]);
    
    // Generate cumulative flow data
    const cumulativeFlowData = await this.generateCumulativeFlowData(boardId, dateFrom, dateTo);
    
    // Generate burndown data
    const burndownData = await this.generateBurndownData(boardId, dateFrom, dateTo);

    return {
      boardId,
      boardName: board.name,
      totalTasks: allTasks.length,
      completedTasks: completedTasks.length,
      averageCycleTime,
      averageLeadTime,
      throughput: completedTasks.length,
      cumulativeFlowData,
      burndownData,
      columnMetrics
    };
  }

  async getTaskMetrics(taskId: string, userId: string): Promise<TaskMetrics> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: {
          include: {
            board: {
              select: { id: true }
            }
          }
        },
        activities: {
          where: {
            action: { in: ['task_created', 'task_moved', 'task_updated'] }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    await this.checkBoardAccess(task.column.board.id, userId);

    const [taskMetrics] = await this.calculateTaskMetrics([task]);
    return taskMetrics;
  }

  async getColumnMetrics(columnId: string, userId: string, dateFrom?: Date, dateTo?: Date): Promise<ColumnMetrics> {
    const column = await prisma.column.findUnique({
      where: { id: columnId },
      include: {
        board: { select: { id: true } }
      }
    });

    if (!column) {
      throw new AppError(404, 'Column not found');
    }

    await this.checkBoardAccess(column.board.id, userId);

    return this.calculateColumnMetrics(column, dateFrom, dateTo);
  }

  private async calculateTaskMetrics(tasks: any[]): Promise<TaskMetrics[]> {
    return tasks.map(task => {
      const statusTransitions = this.parseStatusTransitions(task.activities);
      
      // Calculate cycle time (first in-progress to completion)
      const firstStartTime = statusTransitions.find(t => t.status === 'IN_PROGRESS')?.timestamp;
      const completionTime = task.completedAt;
      const cycleTime = firstStartTime && completionTime 
        ? this.calculateHoursDifference(firstStartTime, completionTime)
        : undefined;

      // Calculate lead time (creation to completion)
      const leadTime = completionTime 
        ? this.calculateHoursDifference(task.createdAt, completionTime)
        : undefined;

      // Calculate time in each status
      const timeInStatuses = this.calculateTimeInStatuses(statusTransitions, task.createdAt, task.completedAt);

      return {
        taskId: task.id,
        title: task.title,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        cycleTime,
        leadTime,
        timeInStatuses
      };
    });
  }

  private async calculateColumnMetrics(column: any, dateFrom?: Date, dateTo?: Date): Promise<ColumnMetrics> {
    const tasks = await prisma.task.findMany({
      where: {
        columnId: column.id,
        createdAt: {
          ...(dateFrom && { gte: dateFrom }),
          ...(dateTo && { lte: dateTo })
        }
      },
      include: {
        activities: {
          where: {
            action: { in: ['task_created', 'task_moved', 'task_updated'] }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    const taskMetrics = await this.calculateTaskMetrics(tasks);
    const completedTasks = taskMetrics.filter(t => t.completedAt);
    
    const averageCycleTime = this.calculateAverage(
      taskMetrics.map(t => t.cycleTime).filter(Boolean) as number[]
    );
    const averageLeadTime = this.calculateAverage(
      taskMetrics.map(t => t.leadTime).filter(Boolean) as number[]
    );

    // Calculate WIP violations
    const wipViolations = await this.calculateWipViolations(column.id, dateFrom, dateTo);
    
    // Current tasks in progress
    const tasksInProgress = await prisma.task.count({
      where: { 
        columnId: column.id,
        completedAt: null
      }
    });

    return {
      columnId: column.id,
      columnName: column.name,
      averageCycleTime,
      averageLeadTime,
      throughput: completedTasks.length,
      wipViolations,
      tasksInProgress,
      tasksCompleted: completedTasks.length
    };
  }

  private async generateCumulativeFlowData(
    boardId: string, 
    dateFrom?: Date, 
    dateTo?: Date
  ): Promise<CumulativeFlowDataPoint[]> {
    const startDate = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const endDate = dateTo || new Date();

    const columns = await prisma.column.findMany({
      where: { boardId },
      orderBy: { position: 'asc' }
    });

    const cumulativeData: CumulativeFlowDataPoint[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dataPoint: CumulativeFlowDataPoint = { date: new Date(currentDate) };

      for (const column of columns) {
        const taskCount = await prisma.task.count({
          where: {
            columnId: column.id,
            createdAt: { lte: currentDate },
            OR: [
              { completedAt: null },
              { completedAt: { gt: currentDate } }
            ]
          }
        });
        dataPoint[column.name] = taskCount;
      }

      cumulativeData.push(dataPoint);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return cumulativeData;
  }

  private async generateBurndownData(
    boardId: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<BurndownDataPoint[]> {
    const startDate = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = dateTo || new Date();

    const totalTasks = await prisma.task.count({
      where: {
        column: { boardId },
        createdAt: { lte: startDate }
      }
    });

    const burndownData: BurndownDataPoint[] = [];
    const currentDate = new Date(startDate);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

    while (currentDate <= endDate) {
      const completedTasks = await prisma.task.count({
        where: {
          column: { boardId },
          createdAt: { lte: startDate },
          completedAt: { lte: currentDate }
        }
      });

      const daysPassed = Math.ceil((currentDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
      const idealBurndown = Math.max(0, totalTasks - (totalTasks * daysPassed / totalDays));

      burndownData.push({
        date: new Date(currentDate),
        totalTasks,
        completedTasks,
        remainingTasks: totalTasks - completedTasks,
        idealBurndown
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return burndownData;
  }

  private parseStatusTransitions(activities: any[]): { status: string; timestamp: Date }[] {
    const transitions: { status: string; timestamp: Date }[] = [];
    
    for (const activity of activities) {
      if (activity.action === 'task_created') {
        transitions.push({ status: 'TODO', timestamp: activity.createdAt });
      } else if (activity.action === 'task_updated' && activity.metadata?.changes?.includes('status')) {
        // This would require storing the new status in metadata
        // For now, we'll infer from task moves between columns
      }
    }

    return transitions;
  }

  private calculateTimeInStatuses(
    transitions: { status: string; timestamp: Date }[],
    createdAt: Date,
    completedAt?: Date
  ): Record<string, number> {
    const timeInStatuses: Record<string, number> = {};
    
    for (let i = 0; i < transitions.length; i++) {
      const current = transitions[i];
      const next = transitions[i + 1];
      
      const startTime = current.timestamp;
      const endTime = next ? next.timestamp : (completedAt || new Date());
      
      timeInStatuses[current.status] = this.calculateHoursDifference(startTime, endTime);
    }

    return timeInStatuses;
  }

  private async calculateWipViolations(columnId: string, dateFrom?: Date, dateTo?: Date): Promise<number> {
    const column = await prisma.column.findUnique({
      where: { id: columnId },
      select: { wipLimit: true }
    });

    if (!column?.wipLimit) return 0;

    // This is simplified - in a real implementation, you'd track historical WIP violations
    const currentTaskCount = await prisma.task.count({
      where: { columnId, completedAt: null }
    });

    return currentTaskCount > column.wipLimit ? 1 : 0;
  }

  private calculateHoursDifference(start: Date, end: Date): number {
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  }

  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
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
}

export const metricsService = new MetricsService();