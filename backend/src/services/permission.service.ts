
import { prisma } from '../database/connection';
import { Role } from '@prisma/client';

const roleHierarchy: { [key in Role]: number } = {
  VIEWER: 1,
  MEMBER: 2,
  MANAGER: 3,
  ADMIN: 4,
};

class PermissionService {
  public async getUserBoardRole(userId: string, boardId: string): Promise<Role | null> {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { teamId: true, ownerId: true },
    });

    if (!board) {
      return null; // Board not found
    }

    if (board.ownerId === userId) {
      return Role.ADMIN; // Board owner is always an admin
    }

    const boardMember = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
      select: { role: true },
    });

    let teamRole: Role | null = null;
    if (board.teamId) {
      const teamMember = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: board.teamId, userId } },
        select: { role: true },
      });
      if (teamMember) {
        teamRole = teamMember.role;
      }
    }

    const directRole = boardMember?.role ?? null;

    // Determine the highest role
    if (!directRole && !teamRole) {
      return null;
    }
    if (!directRole) {
      return teamRole;
    }
    if (!teamRole) {
      return directRole;
    }

    return roleHierarchy[directRole] > roleHierarchy[teamRole] ? directRole : teamRole;
  }

  public async canUserManageTeam(userId: string, teamId: string): Promise<boolean> {
    const teamMember = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { role: true },
    });

    if (!teamMember) {
      return false;
    }

    return teamMember.role === Role.ADMIN || teamMember.role === Role.MANAGER;
  }
}

export const permissionService = new PermissionService();
