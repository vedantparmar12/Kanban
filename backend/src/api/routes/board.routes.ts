import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { boardSchemas, idSchema, querySchemas } from '../validators/schemas';
import { boardService } from '../../services/kanban/board.service';
import { Role } from '@prisma/client';

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

router.get('/:id',
  authenticate,
  validateParams(idSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const board = await boardService.getBoard(
        req.params.id,
        req.user!.id
      );
      res.json(board);
    } catch (error) {
      next(error);
    }
  }
);

router.put('/:id',
  authenticate,
  validateParams(idSchema),
  validateBody(boardSchemas.update),
  async (req: AuthRequest, res, next) => {
    try {
      const board = await boardService.updateBoard(
        req.params.id,
        req.user!.id,
        req.body
      );
      res.json(board);
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/:id',
  authenticate,
  validateParams(idSchema),
  async (req: AuthRequest, res, next) => {
    try {
      await boardService.deleteBoard(
        req.params.id,
        req.user!.id
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

router.post('/:id/members',
  authenticate,
  validateParams(idSchema),
  validateBody(boardSchemas.addMember),
  async (req: AuthRequest, res, next) => {
    try {
      const member = await boardService.addMember(
        req.params.id,
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

router.delete('/:id/members/:userId',
  authenticate,
  validateParams(idSchema),
  async (req: AuthRequest, res, next) => {
    try {
      await boardService.removeMember(
        req.params.id,
        req.user!.id,
        req.params.userId
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:id/analytics',
  authenticate,
  validateParams(idSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const analytics = await boardService.getBoardAnalytics(
        req.params.id,
        req.user!.id
      );
      res.json(analytics);
    } catch (error) {
      next(error);
    }
  }
);

export { router as boardRouter };