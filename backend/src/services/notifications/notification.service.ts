import { prisma } from '../../database/connection';
import { AppError } from '../../api/middlewares/error.middleware';
import { logger } from '../../utils/logger';
import { Server as SocketIOServer } from 'socket.io';

export interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  recipients?: string[]; // User IDs
  boardId?: string;
  taskId?: string;
}

export class NotificationService {
  private io?: SocketIOServer;

  setSocketIO(io: SocketIOServer) {
    this.io = io;
  }

  async createNotification(payload: NotificationPayload) {
    const notifications = [];

    if (payload.recipients && payload.recipients.length > 0) {
      // Send to specific users
      for (const userId of payload.recipients) {
        const notification = await prisma.notification.create({
          data: {
            type: payload.type,
            title: payload.title,
            message: payload.message,
            userId,
            metadata: payload.metadata
          },
          include: {
            user: {
              select: { id: true, username: true, email: true }
            }
          }
        });
        notifications.push(notification);
      }
    } else if (payload.boardId) {
      // Send to all board members
      const boardMembers = await prisma.boardMember.findMany({
        where: { boardId: payload.boardId },
        include: { user: true }
      });

      for (const member of boardMembers) {
        const notification = await prisma.notification.create({
          data: {
            type: payload.type,
            title: payload.title,
            message: payload.message,
            userId: member.userId,
            metadata: payload.metadata
          },
          include: {
            user: {
              select: { id: true, username: true, email: true }
            }
          }
        });
        notifications.push(notification);
      }
    } else {
      throw new AppError(400, 'No recipients specified for notification');
    }

    // Send real-time notifications via WebSocket
    if (this.io) {
      for (const notification of notifications) {
        this.io.to(`user:${notification.userId}`).emit('notification', {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          metadata: notification.metadata,
          createdAt: notification.createdAt,
          isRead: notification.isRead
        });
      }
    }

    logger.info(`Created ${notifications.length} notifications for type: ${payload.type}`);
    return notifications;
  }

  async getUserNotifications(userId: string, options: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: any = { userId };
    if (options.unreadOnly) {
      where.isRead = false;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit || 50,
      skip: options.offset || 0
    });

    const totalCount = await prisma.notification.count({ where });
    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false }
    });

    return {
      notifications,
      totalCount,
      unreadCount
    };
  }

  async markAsRead(userId: string, notificationIds: string[]) {
    const result = await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId // Ensure user can only mark their own notifications
      },
      data: {
        isRead: true
      }
    });

    logger.info(`Marked ${result.count} notifications as read for user: ${userId}`);
    return result;
  }

  async markAllAsRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });

    logger.info(`Marked all ${result.count} notifications as read for user: ${userId}`);
    return result;
  }

  async deleteNotification(userId: string, notificationId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId }
    });

    if (!notification) {
      throw new AppError(404, 'Notification not found');
    }

    await prisma.notification.delete({
      where: { id: notificationId }
    });

    logger.info(`Notification deleted: ${notificationId} by user: ${userId}`);
  }

  async deleteAllNotifications(userId: string) {
    const result = await prisma.notification.deleteMany({
      where: { userId }
    });

    logger.info(`Deleted ${result.count} notifications for user: ${userId}`);
    return result;
  }

  // Predefined notification types for common events

  async notifyTaskAssigned(taskId: string, assigneeId: string, assignedBy: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: {
          include: { board: true }
        },
        assignee: {
          select: { username: true }
        }
      }
    });

    if (!task) return;

    const assignedByUser = await prisma.user.findUnique({
      where: { id: assignedBy },
      select: { username: true }
    });

    await this.createNotification({
      type: 'task_assigned',
      title: 'Task Assigned',
      message: `You have been assigned to task "${task.title}" by ${assignedByUser?.username || 'Unknown User'}`,
      recipients: [assigneeId],
      metadata: {
        taskId,
        boardId: task.column.board.id,
        assignedBy
      }
    });
  }

  async notifyTaskDueSoon(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: {
          include: { board: true }
        },
        assignee: true
      }
    });

    if (!task || !task.assignee) return;

    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    const dueDateStr = dueDate ? dueDate.toLocaleDateString() : 'soon';

    await this.createNotification({
      type: 'task_due_soon',
      title: 'Task Due Soon',
      message: `Task "${task.title}" is due ${dueDateStr}`,
      recipients: [task.assignee.id],
      metadata: {
        taskId,
        boardId: task.column.board.id,
        dueDate: task.dueDate
      }
    });
  }

  async notifyTaskOverdue(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: {
          include: { board: true }
        },
        assignee: true
      }
    });

    if (!task || !task.assignee) return;

    await this.createNotification({
      type: 'task_overdue',
      title: 'Task Overdue',
      message: `Task "${task.title}" is overdue!`,
      recipients: [task.assignee.id],
      metadata: {
        taskId,
        boardId: task.column.board.id,
        dueDate: task.dueDate
      }
    });
  }

  async notifyTaskCompleted(taskId: string, completedBy: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: {
          include: { board: true }
        },
        creator: true
      }
    });

    if (!task || task.creator.id === completedBy) return; // Don't notify creator if they completed it themselves

    const completedByUser = await prisma.user.findUnique({
      where: { id: completedBy },
      select: { username: true }
    });

    await this.createNotification({
      type: 'task_completed',
      title: 'Task Completed',
      message: `Task "${task.title}" has been completed by ${completedByUser?.username || 'Unknown User'}`,
      recipients: [task.creator.id],
      metadata: {
        taskId,
        boardId: task.column.board.id,
        completedBy
      }
    });
  }

  async notifyCommentAdded(taskId: string, commentId: string, authorId: string, content: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: {
          include: { board: true }
        },
        assignee: true,
        creator: true
      }
    });

    if (!task) return;

    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: { username: true }
    });

    const recipients = [];
    if (task.assignee && task.assignee.id !== authorId) {
      recipients.push(task.assignee.id);
    }
    if (task.creator.id !== authorId && task.creator.id !== task.assignee?.id) {
      recipients.push(task.creator.id);
    }

    if (recipients.length === 0) return;

    await this.createNotification({
      type: 'comment_added',
      title: 'New Comment',
      message: `${author?.username || 'Someone'} commented on task "${task.title}": ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
      recipients,
      metadata: {
        taskId,
        commentId,
        boardId: task.column.board.id,
        authorId
      }
    });
  }

  async notifyWipLimitExceeded(columnId: string, boardId: string) {
    const column = await prisma.column.findUnique({
      where: { id: columnId },
      include: {
        tasks: {
          where: { completedAt: null },
          select: { id: true }
        }
      }
    });

    if (!column || !column.wipLimit) return;

    const boardMembers = await prisma.boardMember.findMany({
      where: { boardId },
      select: { userId: true }
    });

    await this.createNotification({
      type: 'wip_limit_exceeded',
      title: 'WIP Limit Exceeded',
      message: `Column "${column.name}" has exceeded its WIP limit of ${column.wipLimit}. Current tasks: ${column.tasks.length}`,
      recipients: boardMembers.map(m => m.userId),
      metadata: {
        columnId,
        boardId,
        wipLimit: column.wipLimit,
        currentCount: column.tasks.length
      }
    });
  }

  async notifyBoardInvitation(boardId: string, inviteeId: string, invitedBy: string) {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { name: true }
    });

    const inviter = await prisma.user.findUnique({
      where: { id: invitedBy },
      select: { username: true }
    });

    if (!board) return;

    await this.createNotification({
      type: 'board_invitation',
      title: 'Board Invitation',
      message: `${inviter?.username || 'Someone'} invited you to join board "${board.name}"`,
      recipients: [inviteeId],
      metadata: {
        boardId,
        invitedBy
      }
    });
  }
}

export const notificationService = new NotificationService();