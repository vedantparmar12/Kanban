import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { graphRepository } from '../../repositories/graph.repository';
import { graphRAGService } from '../../services/rag/graph-rag.service';
import { graphVisualizationService } from '../../services/graph/visualization.service';
import { neo4jConnection } from '../../database/neo4j.connection';

const router = Router();

router.get('/visualization/board/:boardId',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const visualization = await graphRepository.getGraphVisualization(req.params.boardId);
      const formatted = await graphVisualizationService.formatForD3(visualization);
      res.json(formatted);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/visualization/codebase/:codebaseId',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const codeGraph = await graphRepository.getCodebaseGraph(req.params.codebaseId);
      const formatted = await graphVisualizationService.formatCodeGraph(codeGraph);
      res.json(formatted);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/path/:fromId/:toId',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const path = await graphRepository.findShortestPath(
        req.params.fromId,
        req.params.toId
      );
      res.json(path);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/impact/:nodeId',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const depth = parseInt(req.query.depth as string) || 3;
      const impact = await graphRepository.getImpactAnalysis(req.params.nodeId, depth);
      res.json(impact);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/timeline/:entityId',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const timeline = await graphRepository.getActivityTimeline(req.params.entityId, limit);
      res.json(timeline);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/search/semantic',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const { query, limit, threshold, filter } = req.body;
      const results = await graphRAGService.semanticSearch(query, {
        limit,
        threshold,
        filter
      });
      res.json(results);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/similar/:nodeId',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const similar = await graphRepository.findSimilarNodes(req.params.nodeId, limit);
      res.json(similar);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/context/:nodeId',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const context = await graphRAGService.getContextualInformation(req.params.nodeId);
      res.json(context);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/rag/question',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const { question, contextNodeId } = req.body;
      
      const searchResults = await graphRAGService.semanticSearch(question, {
        limit: 5,
        threshold: 0.7
      });
      
      const answer = await graphRAGService.generateAnswer(question, searchResults);
      
      res.json({
        answer,
        sources: searchResults.map(r => ({
          id: r.source.id,
          title: r.source.title || r.source.name,
          similarity: r.similarity
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/index',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const { content, metadata } = req.body;
      await graphRAGService.indexContent(content, metadata);
      res.json({ message: 'Content indexed successfully' });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/patterns/code',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const patterns = await graphRAGService.findCodePatterns(req.query as any);
      res.json(patterns);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/dependencies/:nodeId',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const dependencies = await graphRAGService.analyzeDependencies(req.params.nodeId);
      res.json(dependencies);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/suggestions/:nodeId',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const suggestions = await graphRAGService.suggestRelatedContent(req.params.nodeId);
      res.json(suggestions);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/stats',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const query = `
        MATCH (n)
        WITH labels(n) as label, count(n) as count
        RETURN label, count
        ORDER BY count DESC
      `;
      
      const result = await neo4jConnection.runQuery(query);
      const stats = result.records.map(record => ({
        label: record.get('label')[0],
        count: record.get('count').toNumber()
      }));
      
      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

export { router as graphRouter };