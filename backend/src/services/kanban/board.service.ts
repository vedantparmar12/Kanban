import { prisma } from '../../database/connection';
import { AppError } from '../../api/middlewares/error.middleware';
import { Role } from '@prisma/client';
import { logger } from '../../utils/logger';

export class BoardService {
  async getUserBoards(userId: string, pagination: { page: number; limit: number }) {
    const skip = (pagination.page - 1) * pagination.limit;
    
    const [boards, total] = await Promise.all([
      prisma.board.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } }
          ],
          isArchived: false
        },
        include: {
          owner: {
            select: { id: true, username: true, avatar: true }
          },
          _count: {
            select: { members: true, columns: true }
          }
        },
        skip,
        take: pagination.limit,
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.board.count({
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } }
          ],
          isArchived: false
        }
      })
    ]);

    return {
      boards,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit)
      }
    };
  }

  async createBoard(userId: string, data: any) {
    const slug = this.generateSlug(data.name);
    
    const board = await prisma.board.create({
      data: {
        ...data,
        slug,
        ownerId: userId,
        columns: {
          create: [
            { name: 'To Do', position: 0, color: '#94a3b8' },
            { name: 'In Progress', position: 1, color: '#60a5fa' },
            { name: 'Review', position: 2, color: '#fbbf24' },
            { name: 'Done', position: 3, color: '#34d399' }
          ]
        },
        members: {
          create: {
            userId,
            role: Role.ADMIN
          }
        }
      },
      include: {
        columns: { orderBy: { position: 'asc' } },
        owner: { select: { id: true, username: true, avatar: true } }
      }
    });

    logger.info(`Board created: ${board.id} by user: ${userId}`);
    return board;
  }

  async getBoard(boardId: string, userId: string) {
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        OR: [
          { isPublic: true },
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      },
      include: {
        columns: {
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              include: {
                assignee: {
                  select: { id: true, username: true, avatar: true }
                },
                labels: {
                  include: { label: true }
                },
                _count: {
                  select: { comments: true, attachments: true }
                }
              },
              orderBy: { position: 'asc' }
            }
          }
        },
        members: {
          include: {
            user: {
              select: { id: true, username: true, avatar: true, email: true }
            }
          }
        },
        labels: true,
        owner: {
          select: { id: true, username: true, avatar: true }
        }
      }
    });

    if (!board) {
      throw new AppError(404, 'Board not found');
    }

    return board;
  }

  async updateBoard(boardId: string, userId: string, data: any) {
    await this.checkBoardAccess(boardId, userId, Role.MANAGER);

    const board = await prisma.board.update({
      where: { id: boardId },
      data,
      include: {
        columns: { orderBy: { position: 'asc' } },
        owner: { select: { id: true, username: true, avatar: true } }
      }
    });

    logger.info(`Board updated: ${boardId} by user: ${userId}`);
    return board;
  }

  async deleteBoard(boardId: string, userId: string) {
    await this.checkBoardAccess(boardId, userId, Role.ADMIN);

    await prisma.board.delete({
      where: { id: boardId }
    });

    logger.info(`Board deleted: ${boardId} by user: ${userId}`);
  }

  async addMember(boardId: string, requesterId: string, userId: string, role: Role) {
    await this.checkBoardAccess(boardId, requesterId, Role.MANAGER);

    const existingMember = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: { boardId, userId }
      }
    });

    if (existingMember) {
      throw new AppError(409, 'User is already a member');
    }

    const member = await prisma.boardMember.create({
      data: { boardId, userId, role },
      include: {
        user: {
          select: { id: true, username: true, avatar: true, email: true }
        }
      }
    });

    logger.info(`Member added to board: ${boardId}, user: ${userId}`);
    return member;
  }

  async removeMember(boardId: string, requesterId: string, userId: string) {
    await this.checkBoardAccess(boardId, requesterId, Role.MANAGER);

    const board = await prisma.board.findUnique({
      where: { id: boardId }
    });

    if (board?.ownerId === userId) {
      throw new AppError(400, 'Cannot remove board owner');
    }

    await prisma.boardMember.delete({
      where: {
        boardId_userId: { boardId, userId }
      }
    });

    logger.info(`Member removed from board: ${boardId}, user: ${userId}`);
  }

  async getBoardAnalytics(boardId: string, userId: string) {
    await this.checkBoardAccess(boardId, userId, Role.MEMBER);

    const [tasks, completedTasks, overdueTasks, activities] = await Promise.all([
      prisma.task.count({ where: { column: { boardId } } }),
      prisma.task.count({
        where: {
          column: { boardId },
          status: 'DONE'
        }
      }),
      prisma.task.count({
        where: {
          column: { boardId },
          dueDate: { lt: new Date() },
          status: { not: 'DONE' }
        }
      }),
      prisma.activity.findMany({
        where: { boardId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: {
            select: { id: true, username: true, avatar: true }
          }
        }
      })
    ]);

    const tasksByStatus = await prisma.task.groupBy({
      by: ['status'],
      where: { column: { boardId } },
      _count: true
    });

    const tasksByPriority = await prisma.task.groupBy({
      by: ['priority'],
      where: { column: { boardId } },
      _count: true
    });

    return {
      totalTasks: tasks,
      completedTasks,
      overdueTasks,
      completionRate: tasks > 0 ? (completedTasks / tasks) * 100 : 0,
      tasksByStatus,
      tasksByPriority,
      recentActivities: activities
    };
  }

  private async checkBoardAccess(boardId: string, userId: string, requiredRole: Role) {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        members: {
          where: { userId }
        }
      }
    });

    if (!board) {
      throw new AppError(404, 'Board not found');
    }

    if (board.ownerId === userId) {
      return true;
    }

    const member = board.members[0];
    if (!member) {
      throw new AppError(403, 'Access denied');
    }

    const roleHierarchy = { VIEWER: 0, MEMBER: 1, MANAGER: 2, ADMIN: 3 };
    if (roleHierarchy[member.role] < roleHierarchy[requiredRole]) {
      throw new AppError(403, 'Insufficient permissions');
    }

    return true;
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${base}-${Date.now()}`;
  }
}

export const boardService = new BoardService();