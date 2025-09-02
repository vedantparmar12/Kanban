import { prisma } from '../../database/connection';
import { AppError } from '../../api/middlewares/error.middleware';
import { logger } from '../../utils/logger';

export class SwimlaneService {
  async getSwimlanes(boardId: string, userId: string) {
    await this.checkBoardAccess(boardId, userId);

    const swimlanes = await prisma.swimlane.findMany({
      where: { boardId },
      include: {
        _count: {
          select: { tasks: true }
        }
      },
      orderBy: { position: 'asc' }
    });

    return swimlanes;
  }

  async createSwimlane(userId: string, data: any) {
    await this.checkBoardAccess(data.boardId, userId);

    const maxPosition = await prisma.swimlane.findFirst({
      where: { boardId: data.boardId },
      orderBy: { position: 'desc' },
      select: { position: true }
    });

    const swimlane = await prisma.swimlane.create({
      data: {
        name: data.name,
        description: data.description,
        boardId: data.boardId,
        position: (maxPosition?.position ?? -1) + 1,
        color: data.color
      },
      include: {
        _count: {
          select: { tasks: true }
        }
      }
    });

    await this.createActivity(data.boardId, null, userId, 'swimlane_created', {
      swimlaneName: swimlane.name
    });

    logger.info(`Swimlane created: ${swimlane.id} by user: ${userId}`);
    return swimlane;
  }

  async getSwimlane(swimlaneId: string, userId: string) {
    const swimlane = await prisma.swimlane.findUnique({
      where: { id: swimlaneId },
      include: {
        board: {
          select: { id: true, name: true }
        },
        tasks: {
          include: {
            assignee: {
              select: { id: true, username: true, avatar: true }
            },
            labels: {
              include: { label: true }
            }
          },
          orderBy: { position: 'asc' }
        },
        _count: {
          select: { tasks: true }
        }
      }
    });

    if (!swimlane) {
      throw new AppError(404, 'Swimlane not found');
    }

    await this.checkBoardAccess(swimlane.boardId, userId);

    return swimlane;
  }

  async updateSwimlane(swimlaneId: string, userId: string, data: any) {
    const existingSwimlane = await prisma.swimlane.findUnique({
      where: { id: swimlaneId }
    });

    if (!existingSwimlane) {
      throw new AppError(404, 'Swimlane not found');
    }

    await this.checkBoardAccess(existingSwimlane.boardId, userId);

    const swimlane = await prisma.swimlane.update({
      where: { id: swimlaneId },
      data,
      include: {
        _count: {
          select: { tasks: true }
        }
      }
    });

    await this.createActivity(existingSwimlane.boardId, null, userId, 'swimlane_updated', {
      swimlaneName: swimlane.name,
      changes: Object.keys(data)
    });

    logger.info(`Swimlane updated: ${swimlaneId} by user: ${userId}`);
    return swimlane;
  }

  async deleteSwimlane(swimlaneId: string, userId: string) {
    const swimlane = await prisma.swimlane.findUnique({
      where: { id: swimlaneId },
      include: { _count: { select: { tasks: true } } }
    });

    if (!swimlane) {
      throw new AppError(404, 'Swimlane not found');
    }

    await this.checkBoardAccess(swimlane.boardId, userId);

    if (swimlane._count.tasks > 0) {
      throw new AppError(400, 'Cannot delete swimlane with tasks. Move tasks first.');
    }

    await prisma.$transaction(async (tx) => {
      // Adjust positions of remaining swimlanes
      await tx.swimlane.updateMany({
        where: {
          boardId: swimlane.boardId,
          position: { gt: swimlane.position }
        },
        data: {
          position: { decrement: 1 }
        }
      });

      await tx.swimlane.delete({
        where: { id: swimlaneId }
      });
    });

    await this.createActivity(swimlane.boardId, null, userId, 'swimlane_deleted', {
      swimlaneName: swimlane.name
    });

    logger.info(`Swimlane deleted: ${swimlaneId} by user: ${userId}`);
  }

  async reorderSwimlanes(boardId: string, userId: string, swimlaneIds: string[]) {
    await this.checkBoardAccess(boardId, userId);

    const existingSwimlanes = await prisma.swimlane.findMany({
      where: { boardId },
      select: { id: true }
    });

    const existingIds = new Set(existingSwimlanes.map(s => s.id));
    const providedIds = new Set(swimlaneIds);

    if (existingIds.size !== providedIds.size || 
        ![...existingIds].every(id => providedIds.has(id))) {
      throw new AppError(400, 'Invalid swimlane IDs provided');
    }

    await prisma.$transaction(
      swimlaneIds.map((swimlaneId, index) =>
        prisma.swimlane.update({
          where: { id: swimlaneId },
          data: { position: index }
        })
      )
    );

    await this.createActivity(boardId, null, userId, 'swimlanes_reordered', {
      swimlaneCount: swimlaneIds.length
    });

    logger.info(`Swimlanes reordered for board: ${boardId} by user: ${userId}`);

    return this.getSwimlanes(boardId, userId);
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
        entityType: 'swimlane',
        entityId: '',
        boardId,
        taskId,
        userId,
        metadata
      }
    });
  }
}

export const swimlaneService = new SwimlaneService();