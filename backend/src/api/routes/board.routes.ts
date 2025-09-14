import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { boardSchemas, idSchema, querySchemas } from '../validators/schemas';
import { boardService } from '../../services/kanban/board.service';
import { Role } from '@prisma/client';
import { canAccessBoard } from '../middlewares/permission.middleware';

const router = Router();

router.get('/',
  authenticate,
  validateQuery(querySchemas.pagination),
  async (req: AuthRequest, res, next) => {
    try {
      const boards = await boardService.getUserBoards(
        req.user!.id,
        req.query as any
      );
      res.json(boards);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/',
  authenticate,
  validateBody(boardSchemas.create),
  async (req: AuthRequest, res, next) => {
    try {
      const board = await boardService.createBoard(
        req.user!.id,
        req.body
      );
      res.status(201).json(board);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:boardId',
  authenticate,
  validateParams(idSchema('boardId')),
  canAccessBoard(Role.VIEWER),
  async (req: AuthRequest, res, next) => {
    try {
      const board = await boardService.getBoard(
        req.params.boardId,
        req.user!.id
      );
      res.json(board);
    } catch (error) {
      next(error);
    }
  }
);

router.put('/:boardId',
  authenticate,
  validateParams(idSchema('boardId')),
  validateBody(boardSchemas.update),
  canAccessBoard(Role.MANAGER),
  async (req: AuthRequest, res, next) => {
    try {
      const board = await boardService.updateBoard(
        req.params.boardId,
        req.user!.id,
        req.body
      );
      res.json(board);
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/:boardId',
  authenticate,
  validateParams(idSchema('boardId')),
  canAccessBoard(Role.ADMIN),
  async (req: AuthRequest, res, next) => {
    try {
      await boardService.deleteBoard(
        req.params.boardId,
        req.user!.id
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

router.post('/:boardId/members',
  authenticate,
  validateParams(idSchema('boardId')),
  validateBody(boardSchemas.addMember),
  canAccessBoard(Role.MANAGER),
  async (req: AuthRequest, res, next) => {
    try {
      const member = await boardService.addMember(
        req.params.boardId,
        req.user!.id,
        req.body.userId,
        req.body.role
      );
      res.status(201).json(member);
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/:boardId/members/:userId',
  authenticate,
  validateParams(idSchema('boardId').merge(idSchema('userId'))),
  canAccessBoard(Role.MANAGER),
  async (req: AuthRequest, res, next) => {
    try {
      await boardService.removeMember(
        req.params.boardId,
        req.user!.id,
        req.params.userId
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:boardId/analytics',
  authenticate,
  validateParams(idSchema('boardId')),
  canAccessBoard(Role.VIEWER),
  async (req: AuthRequest, res, next) => {
    try {
      const analytics = await boardService.getBoardAnalytics(
        req.params.boardId,
        req.user!.id
      );
      res.json(analytics);
    } catch (error) {
      next(error);
    }
  }
);

export { router as boardRouter };