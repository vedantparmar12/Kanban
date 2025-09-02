import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { docGeneratorService } from '../../services/mcp/doc-generator.service';

const router = Router();

router.get('/readme',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const readme = await docGeneratorService.getReadme();
      res.json({ content: readme });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/generate',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const docs = await docGeneratorService.generateDocs(req.body);
      res.json(docs);
    } catch (error) {
      next(error);
    }
  }
);

router.put('/readme',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      await docGeneratorService.updateReadme(req.body.content);
      res.json({ message: 'README updated successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export { router as docsRouter };