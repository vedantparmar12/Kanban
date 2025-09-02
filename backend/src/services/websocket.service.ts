import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config/app.config';
import { prisma } from '../database/connection';
import { logger } from '../utils/logger';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  boardRooms?: Set<string>;
}

export function initializeWebSocket(io: Server) {
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, appConfig.jwtSecret) as { id: string };
      const user = await prisma.user.findUnique({
        where: { id: decoded.id, isActive: true }
      });

      if (!user) {
        return next(new Error('Invalid authentication'));
      }

      socket.userId = user.id;
      socket.boardRooms = new Set();
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`User ${socket.userId} connected via WebSocket`);

    socket.on('join-board', async (boardId: string) => {
      try {
        const hasAccess = await checkBoardAccess(boardId, socket.userId!);
        if (!hasAccess) {
          socket.emit('error', { message: 'Access denied to board' });
          return;
        }

        socket.join(`board:${boardId}`);
        socket.boardRooms?.add(boardId);
        socket.emit('joined-board', { boardId });
        
        logger.info(`User ${socket.userId} joined board ${boardId}`);
      } catch (error) {
        socket.emit('error', { message: 'Failed to join board' });
      }
    });

    socket.on('leave-board', (boardId: string) => {
      socket.leave(`board:${boardId}`);
      socket.boardRooms?.delete(boardId);
      socket.emit('left-board', { boardId });
      
      logger.info(`User ${socket.userId} left board ${boardId}`);
    });

    socket.on('move-task', async (data: {
      taskId: string;
      columnId: string;
      position: number;
      boardId: string;
    }) => {
      try {
        const hasAccess = await checkBoardAccess(data.boardId, socket.userId!);
        if (!hasAccess) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        socket.to(`board:${data.boardId}`).emit('task-moved', {
          taskId: data.taskId,
          columnId: data.columnId,
          position: data.position,
          userId: socket.userId
        });
      } catch (error) {
        socket.emit('error', { message: 'Failed to move task' });
      }
    });

    socket.on('update-task', async (data: {
      taskId: string;
      updates: any;
      boardId: string;
    }) => {
      try {
        const hasAccess = await checkBoardAccess(data.boardId, socket.userId!);
        if (!hasAccess) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        socket.to(`board:${data.boardId}`).emit('task-updated', {
          taskId: data.taskId,
          updates: data.updates,
          userId: socket.userId
        });
      } catch (error) {
        socket.emit('error', { message: 'Failed to update task' });
      }
    });

    socket.on('create-task', async (data: {
      task: any;
      boardId: string;
    }) => {
      try {
        const hasAccess = await checkBoardAccess(data.boardId, socket.userId!);
        if (!hasAccess) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        io.to(`board:${data.boardId}`).emit('task-created', {
          task: data.task,
          userId: socket.userId
        });
      } catch (error) {
        socket.emit('error', { message: 'Failed to create task' });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`User ${socket.userId} disconnected from WebSocket`);
    });
  });

  async function checkBoardAccess(boardId: string, userId: string): Promise<boolean> {
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        OR: [
          { isPublic: true },
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      }
    });
    return !!board;
  }
}

export function broadcastToBoard(io: Server, boardId: string, event: string, data: any) {
  io.to(`board:${boardId}`).emit(event, data);
}

export function broadcastToUser(io: Server, userId: string, event: string, data: any) {
  const sockets = io.sockets.sockets;
  for (const [, socket] of sockets) {
    if ((socket as AuthenticatedSocket).userId === userId) {
      socket.emit(event, data);
    }
  }
}