import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { validateBody, validateParams } from '../middlewares/validation.middleware';
import { prSchemas, idSchema } from '../validators/schemas';
import { prAgentService } from '../../services/mcp/pr-agent.service';

const router = Router();

router.post('/create',
  authenticate,
  validateBody(prSchemas.create),
  async (req: AuthRequest, res, next) => {
    try {
      const pr = await prAgentService.createPR(req.user!.id, req.body);
      res.status(201).json(pr);
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
      const pr = await prAgentService.getPR(req.params.id, req.user!.id);
      res.json(pr);
    } catch (error) {
      next(error);
    }
  }
);

router.put('/:id',
  authenticate,
  validateParams(idSchema),
  validateBody(prSchemas.update),
  async (req: AuthRequest, res, next) => {
    try {
      const pr = await prAgentService.updatePR(
        req.params.id,
        req.user!.id,
        req.body
      );
      res.json(pr);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/:id/review',
  authenticate,
  validateParams(idSchema),
  validateBody(prSchemas.review),
  async (req: AuthRequest, res, next) => {
    try {
      const review = await prAgentService.addReview(
        req.params.id,
        req.user!.id,
        req.body
      );
      res.status(201).json(review);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/:id/update-docs',
  authenticate,
  validateParams(idSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await prAgentService.updateDocumentation(
        req.params.id,
        req.user!.id
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export { router as prRouter };