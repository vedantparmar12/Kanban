import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { swimlaneSchemas, idSchema } from '../validators/schemas';
import { swimlaneService } from '../../services/kanban/swimlane.service';
import { z } from 'zod';

const router = Router();

const boardIdSchema = z.object({
  boardId: z.string()
});

router.get('/',
  authenticate,
  validateQuery(boardIdSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const swimlanes = await swimlaneService.getSwimlanes(
        req.query.boardId as string,
        req.user!.id
      );
      res.json(swimlanes);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/',
  authenticate,
  validateBody(swimlaneSchemas.create),
  async (req: AuthRequest, res, next) => {
    try {
      const swimlane = await swimlaneService.createSwimlane(req.user!.id, req.body);
      res.status(201).json(swimlane);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:id',
  authenticate,
  validateParams(idSchema()),
  async (req: AuthRequest, res, next) => {
    try {
      const swimlane = await swimlaneService.getSwimlane(req.params.id, req.user!.id);
      res.json(swimlane);
    } catch (error) {
      next(error);
    }
  }
);

router.put('/:id',
  authenticate,
  validateParams(idSchema()),
  validateBody(swimlaneSchemas.update),
  async (req: AuthRequest, res, next) => {
    try {
      const swimlane = await swimlaneService.updateSwimlane(
        req.params.id,
        req.user!.id,
        req.body
      );
      res.json(swimlane);
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/:id',
  authenticate,
  validateParams(idSchema()),
  async (req: AuthRequest, res, next) => {
    try {
      await swimlaneService.deleteSwimlane(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

router.put('/reorder/:boardId',
  authenticate,
  validateParams(idSchema('boardId')),
  validateBody(swimlaneSchemas.reorder),
  async (req: AuthRequest, res, next) => {
    try {
      const swimlanes = await swimlaneService.reorderSwimlanes(
        req.params.boardId,
        req.user!.id,
        req.body.swimlaneIds
      );
      res.json(swimlanes);
    } catch (error) {
      next(error);
    }
  }
);

export { router as swimlaneRouter };