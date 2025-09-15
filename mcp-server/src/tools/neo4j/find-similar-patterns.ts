import { ToolHandler } from '../../types/mcp.js';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';
import { Neo4jClient } from '../../clients/neo4j-client.js';

const logger = createLogger('FindSimilarPatternsTool');

const FindSimilarPatternsSchema = z.object({
  pattern: z.string().min(1, 'Pattern description is required'),
  patternType: z.enum(['code', 'task', 'workflow', 'architecture']).default('code'),
  similarityThreshold: z.number().min(0).max(1).default(0.7),
  maxResults: z.number().min(1).max(100).default(20),
  includeMetrics: z.boolean().default(true),
  searchScope: z.array(z.string()).optional()
});

export const findSimilarPatternsTool: ToolHandler = {
  name: 'find-similar-patterns',
  description: 'Discover similar code implementations and patterns using graph analysis',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'Description of the pattern to find (e.g., function name, code structure, task pattern)'
      },
      patternType: {
        type: 'string',
        enum: ['code', 'task', 'workflow', 'architecture'],
        description: 'Type of pattern to search for',
        default: 'code'
      },
      similarityThreshold: {
        type: 'number',
        description: 'Minimum similarity score (0-1)',
        minimum: 0,
        maximum: 1,
        default: 0.7
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (1-100)',
        minimum: 1,
        maximum: 100,
        default: 20
      },
      includeMetrics: {
        type: 'boolean',
        description: 'Include similarity metrics and analysis',
        default: true
      },
      searchScope: {
        type: 'array',
        items: { type: 'string' },
        description: 'Limit search to specific projects, modules, or files'
      }
    },
    required: ['pattern']
  },

  async execute(params) {
    try {
      const { pattern, patternType, similarityThreshold, maxResults, includeMetrics, searchScope } =
        FindSimilarPatternsSchema.parse(params);

      logger.info({ pattern, patternType, similarityThreshold, maxResults }, 'Finding similar patterns');

      const neo4jClient = Neo4jClient.getInstance();

      // Build search query based on pattern type
      const searchQuery = buildPatternSearchQuery(pattern, patternType, similarityThreshold, maxResults, searchScope);
      const result = await neo4jClient.executeQuery(searchQuery.query, searchQuery.parameters);

      if (result.records.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No similar patterns found matching the specified criteria.'
          }]
        };
      }

      // Process and rank results
      const patterns = processPatternResults(result, includeMetrics);

      // Group patterns by similarity clusters
      const clusteredPatterns = clusterSimilarPatterns(patterns);

      const response = {
        searchPattern: pattern,
        patternType,
        totalFound: patterns.length,
        similarityThreshold,
        patterns: patterns.slice(0, maxResults),
        ...(includeMetrics && {
          clusters: clusteredPatterns,
          metrics: calculatePatternMetrics(patterns)
        })
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to find similar patterns');

      return {
        content: [{
          type: 'text',
          text: `Error finding patterns: ${error.message}`
        }]
      };
    }
  }
};

function buildPatternSearchQuery(pattern: string, patternType: string, threshold: number, maxResults: number, searchScope?: string[]) {
  let query: string;
  let parameters: Record<string, any> = {
    pattern,
    threshold,
    maxResults
  };

  switch (patternType) {
    case 'code':
      query = `
        // Find similar code patterns using text similarity and structural analysis
        MATCH (entity:Function|Class|Module)
        WHERE entity.name CONTAINS $pattern
           OR entity.description CONTAINS $pattern
           OR entity.code CONTAINS $pattern
        ${searchScope ? 'AND entity.project IN $searchScope' : ''}

        // Calculate similarity based on multiple factors
        WITH entity,
             // Name similarity
             gds.similarity.cosine(
               apoc.text.split(toLower(entity.name), '[^a-zA-Z0-9]'),
               apoc.text.split(toLower($pattern), '[^a-zA-Z0-9]')
             ) as nameSimilarity,
             // Structure similarity (dependencies, complexity)
             size((entity)-[:DEPENDS_ON]->()) as dependencies,
             coalesce(entity.complexity, 0) as complexity,
             coalesce(entity.linesOfCode, 0) as loc

        // Combined similarity score
        WITH entity,
             (nameSimilarity * 0.4 +
              apoc.text.sorensenDiceSimilarity(entity.description, $pattern) * 0.3 +
              apoc.text.jaroWinkler(entity.name, $pattern) * 0.3) as similarityScore,
             dependencies, complexity, loc

        WHERE similarityScore >= $threshold

        // Get related context
        OPTIONAL MATCH (entity)-[r]-(related)
        WITH entity, similarityScore, dependencies, complexity, loc,
             collect(DISTINCT {type: type(r), node: related.name, label: labels(related)[0]}) as context

        RETURN entity, similarityScore, dependencies, complexity, loc, context
        ORDER BY similarityScore DESC
        LIMIT $maxResults
      `;
      break;

    case 'task':
      query = `
        // Find similar task patterns
        MATCH (task:Task)
        WHERE task.title CONTAINS $pattern
           OR task.description CONTAINS $pattern
           OR any(label in task.labels WHERE label CONTAINS $pattern)
        ${searchScope ? 'AND task.project IN $searchScope' : ''}

        WITH task,
             apoc.text.sorensenDiceSimilarity(task.description, $pattern) as descSimilarity,
             apoc.text.jaroWinkler(task.title, $pattern) as titleSimilarity,
             size((task)-[:ASSIGNED_TO]->()) as assigneeCount,
             size((task)-[:DEPENDS_ON]->()) as dependencyCount

        WITH task,
             (titleSimilarity * 0.5 + descSimilarity * 0.5) as similarityScore,
             assigneeCount, dependencyCount

        WHERE similarityScore >= $threshold

        OPTIONAL MATCH (task)-[r]-(related)
        WITH task, similarityScore, assigneeCount, dependencyCount,
             collect(DISTINCT {type: type(r), node: related.name, label: labels(related)[0]}) as context

        RETURN task as entity, similarityScore, assigneeCount, dependencyCount, context
        ORDER BY similarityScore DESC
        LIMIT $maxResults
      `;
      break;

    case 'workflow':
      query = `
        // Find similar workflow patterns
        MATCH (workflow:Workflow)-[:CONTAINS]->(step:WorkflowStep)
        WHERE workflow.name CONTAINS $pattern
           OR workflow.description CONTAINS $pattern
           OR step.action CONTAINS $pattern
        ${searchScope ? 'AND workflow.project IN $searchScope' : ''}

        WITH workflow, count(step) as stepCount,
             apoc.text.sorensenDiceSimilarity(workflow.description, $pattern) as similarity

        WHERE similarity >= $threshold

        MATCH (workflow)-[:CONTAINS]->(allSteps:WorkflowStep)
        WITH workflow, similarity, stepCount,
             collect(allSteps.action) as actions,
             collect(allSteps.type) as stepTypes

        RETURN workflow as entity, similarity as similarityScore, stepCount, actions, stepTypes
        ORDER BY similarity DESC
        LIMIT $maxResults
      `;
      break;

    case 'architecture':
      query = `
        // Find similar architectural patterns
        MATCH (component:Component)
        WHERE component.name CONTAINS $pattern
           OR component.type CONTAINS $pattern
           OR component.description CONTAINS $pattern
        ${searchScope ? 'AND component.system IN $searchScope' : ''}

        WITH component,
             apoc.text.sorensenDiceSimilarity(component.description, $pattern) as similarity,
             size((component)-[:CONNECTS_TO]->()) as outConnections,
             size((component)<-[:CONNECTS_TO]-()) as inConnections

        WHERE similarity >= $threshold

        OPTIONAL MATCH (component)-[:CONNECTS_TO]->(connected:Component)
        WITH component, similarity, outConnections, inConnections,
             collect(DISTINCT connected.type) as connectedTypes

        RETURN component as entity, similarity as similarityScore,
               outConnections, inConnections, connectedTypes
        ORDER BY similarity DESC
        LIMIT $maxResults
      `;
      break;

    default:
      throw new Error(`Unsupported pattern type: ${patternType}`);
  }

  if (searchScope) {
    parameters.searchScope = searchScope;
  }

  return { query, parameters };
}

function processPatternResults(result: any, includeMetrics: boolean) {
  return result.records.map((record: any) => {
    const entity = record.get('entity');
    const similarityScore = record.get('similarityScore');

    const pattern: {
      id: any;
      name: any;
      type: any;
      similarityScore: number;
      properties: any;
      metrics?: any;
      relatedEntities?: any;
    } = {
      id: entity.elementId || entity.identity?.toString(),
      name: entity.name || entity.title,
      type: entity.labels?.[0] || 'Unknown',
      similarityScore: Math.round(similarityScore * 1000) / 1000,
      properties: {
        ...entity.properties,
        // Remove large text fields from summary
        description: entity.properties?.description?.substring(0, 200) + '...' || null,
        code: entity.properties?.code ? '[Code content hidden]' : null
      }
    };

    if (includeMetrics) {
      pattern.metrics = extractMetricsFromRecord(record);
    }

    // Add context information if available
    const context = record.get('context');
    if (context && context.length > 0) {
      pattern.relatedEntities = context.slice(0, 10); // Limit context size
    }

    return pattern;
  });
}

function extractMetricsFromRecord(record: any) {
  const metrics: any = {};

  // Extract different metrics based on available fields
  ['dependencies', 'complexity', 'loc', 'assigneeCount', 'dependencyCount',
   'stepCount', 'outConnections', 'inConnections'].forEach(field => {
    try {
      const value = record.get(field);
      if (value !== null && value !== undefined) {
        metrics[field] = value;
      }
    } catch (e) {
      // Field doesn't exist in this record
    }
  });

  return metrics;
}

function clusterSimilarPatterns(patterns: any[]) {
  // Simple clustering based on similarity scores and types
  const clusters = {
    highSimilarity: patterns.filter(p => p.similarityScore >= 0.9),
    mediumSimilarity: patterns.filter(p => p.similarityScore >= 0.7 && p.similarityScore < 0.9),
    lowSimilarity: patterns.filter(p => p.similarityScore < 0.7)
  };

  // Group by entity type as well
  const byType = patterns.reduce((acc, pattern) => {
    const type = pattern.type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(pattern);
    return acc;
  }, {});

  return {
    bySimilarity: clusters,
    byType
  };
}

function calculatePatternMetrics(patterns: any[]) {
  const scores = patterns.map(p => p.similarityScore);

  return {
    averageSimilarity: scores.reduce((a, b) => a + b, 0) / scores.length,
    maxSimilarity: Math.max(...scores),
    minSimilarity: Math.min(...scores),
    distribution: {
      high: patterns.filter(p => p.similarityScore >= 0.9).length,
      medium: patterns.filter(p => p.similarityScore >= 0.7 && p.similarityScore < 0.9).length,
      low: patterns.filter(p => p.similarityScore < 0.7).length
    },
    typeDistribution: patterns.reduce((acc, pattern) => {
      acc[pattern.type] = (acc[pattern.type] || 0) + 1;
      return acc;
    }, {})
  };
}