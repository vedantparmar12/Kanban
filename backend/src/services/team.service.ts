
import { prisma } from '../database/connection';
import { Role, Team, User } from '@prisma/client';
import { permissionService } from './permission.service';
import { AppError } from '../api/middlewares/error.middleware';

interface TeamCreationData {
  name: string;
  description?: string;
  logo?: string;
}

class TeamService {
  public async createTeam(userId: string, data: TeamCreationData): Promise<Team> {
    const slug = data.name.toLowerCase().replace(/\s+/g, '-');
    const existingTeam = await prisma.team.findUnique({ where: { slug } });
    if (existingTeam) {
      throw new AppError(409, 'A team with this name already exists');
    }

    const team = await prisma.team.create({
      data: {
        ...data,
        slug,
      },
    });

    await prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: userId,
        role: Role.ADMIN,
      },
    });

    return team;
  }

  public async addUserToTeam(requesterId: string, teamId: string, userId: string, role: Role): Promise<void> {
    const canManage = await permissionService.canUserManageTeam(requesterId, teamId);
    if (!canManage) {
      throw new AppError(403, 'You do not have permission to add users to this team');
    }

    await prisma.teamMember.create({
      data: {
        teamId,
        userId,
        role,
      },
    });
  }

  public async removeUserFromTeam(requesterId: string, teamId: string, userId: string): Promise<void> {
    const canManage = await permissionService.canUserManageTeam(requesterId, teamId);
    if (!canManage) {
      throw new AppError(403, 'You do not have permission to remove users from this team');
    }

    // Prevent admin from removing themselves if they are the last admin
    const memberToRemove = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
    if (memberToRemove?.role === Role.ADMIN) {
      const adminCount = await prisma.teamMember.count({ where: { teamId, role: Role.ADMIN } });
      if (adminCount <= 1) {
        throw new AppError(400, 'Cannot remove the last admin from the team');
      }
    }

    await prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });
  }

  public async updateUserRoleInTeam(requesterId: string, teamId: string, userId: string, role: Role): Promise<void> {
    const canManage = await permissionService.canUserManageTeam(requesterId, teamId);
    if (!canManage) {
      throw new AppError(403, 'You do not have permission to change roles in this team');
    }

    await prisma.teamMember.update({
      where: { teamId_userId: { teamId, userId } },
      data: { role },
    });
  }

  public async getTeam(userId: string, teamId: string): Promise<Team | null> {
    const member = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
    if (!member) {
      throw new AppError(403, 'You are not a member of this team');
    }

    return prisma.team.findUnique({
      where: { id: teamId },
      include: { members: { include: { user: { select: { id: true, username: true, avatar: true } } } } },
    });
  }

  public async getUserTeams(userId: string): Promise<Team[]> {
    return prisma.team.findMany({
      where: { members: { some: { userId } } },
    });
  }
}

export const teamService = new TeamService();
