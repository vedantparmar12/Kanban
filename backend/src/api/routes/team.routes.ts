
import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { teamService } from '../../services/team.service';
import { validateBody, validateParams } from '../middlewares/validation.middleware';
import { idSchema } from '../validators/schemas';
import { z } from 'zod';
import { Role } from '@prisma/client';

const router = Router();

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

const addMemberSchema = z.object({
  userId: z.string(),
  role: z.nativeEnum(Role),
});

const updateMemberSchema = z.object({
  role: z.nativeEnum(Role),
});

router.use(authenticate);

router.post('/', validateBody(createTeamSchema), async (req: AuthRequest, res, next) => {
  try {
    const team = await teamService.createTeam(req.user!.id, req.body);
    res.status(201).json(team);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const teams = await teamService.getUserTeams(req.user!.id);
    res.json(teams);
  } catch (error) {
    next(error);
  }
});

router.get('/:teamId', validateParams(idSchema('teamId')), async (req: AuthRequest, res, next) => {
  try {
    const team = await teamService.getTeam(req.user!.id, req.params.teamId);
    res.json(team);
  } catch (error) {
    next(error);
  }
});

router.post('/:teamId/members', validateParams(idSchema('teamId')), validateBody(addMemberSchema), async (req: AuthRequest, res, next) => {
  try {
    await teamService.addUserToTeam(req.user!.id, req.params.teamId, req.body.userId, req.body.role);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.delete('/:teamId/members/:userId', validateParams(idSchema('teamId').merge(idSchema('userId'))), async (req: AuthRequest, res, next) => {
  try {
    await teamService.removeUserFromTeam(req.user!.id, req.params.teamId, req.params.userId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.put('/:teamId/members/:userId', validateParams(idSchema('teamId').merge(idSchema('userId'))), validateBody(updateMemberSchema), async (req: AuthRequest, res, next) => {
  try {
    await teamService.updateUserRoleInTeam(req.user!.id, req.params.teamId, req.params.userId, req.body.role);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export const teamRoutes = router;
