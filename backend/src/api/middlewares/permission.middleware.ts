
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { permissionService } from '../../services/permission.service';
import { Role } from '@prisma/client';

const roleHierarchy: { [key in Role]: number } = {
  VIEWER: 1,
  MEMBER: 2,
  MANAGER: 3,
  ADMIN: 4,
};

export const canAccessBoard = (requiredRole: Role) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const boardId = req.params.boardId;
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!boardId) {
      return res.status(400).json({ error: 'Board ID is required' });
    }

    const userRole = await permissionService.getUserBoardRole(req.user.id, boardId);

    if (!userRole) {
      return res.status(403).json({ error: 'You do not have access to this board' });
    }

    if (roleHierarchy[userRole] >= roleHierarchy[requiredRole]) {
      return next();
    } else {
      return res.status(403).json({ error: 'You do not have sufficient permissions for this action' });
    }
  };
};
