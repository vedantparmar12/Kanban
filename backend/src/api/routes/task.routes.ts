import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { taskSchemas, idSchema, querySchemas } from '../validators/schemas';
import { taskService } from '../../services/kanban/task.service';

const router = Router();

router.get('/',
  authenticate,
  validateQuery(querySchemas.taskFilter),
  async (req: AuthRequest, res, next) => {
    try {
      const tasks = await taskService.getTasks(req.user!.id, req.query as any);
      res.json(tasks);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/',
  authenticate,
  validateBody(taskSchemas.create),
  async (req: AuthRequest, res, next) => {
    try {
      const task = await taskService.createTask(req.user!.id, req.body);
      res.status(201).json(task);
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
      const task = await taskService.getTask(req.params.id, req.user!.id);
      res.json(task);
    } catch (error) {
      next(error);
    }
  }
);

router.put('/:id',
  authenticate,
  validateParams(idSchema()),
  validateBody(taskSchemas.update),
  async (req: AuthRequest, res, next) => {
    try {
      const task = await taskService.updateTask(
        req.params.id,
        req.user!.id,
        req.body
      );
      res.json(task);
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
      await taskService.deleteTask(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

router.put('/:id/move',
  authenticate,
  validateParams(idSchema()),
  validateBody(taskSchemas.move),
  async (req: AuthRequest, res, next) => {
    try {
      const task = await taskService.moveTask(
        req.params.id,
        req.user!.id,
        req.body.columnId,
        req.body.position,
        req.body.swimlaneId
      );
      res.json(task);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/:id/comments',
  authenticate,
  validateParams(idSchema()),
  validateBody(taskSchemas.comment),
  async (req: AuthRequest, res, next) => {
    try {
      const comment = await taskService.addComment(
        req.params.id,
        req.user!.id,
        req.body.content
      );
      res.status(201).json(comment);
    } catch (error) {
      next(error);
    }
  }
);

export { router as taskRouter };