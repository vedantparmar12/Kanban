import { ToolHandler } from '../../types/mcp.js';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';
import { Neo4jClient } from '../../clients/neo4j-client.js';

const logger = createLogger('AnalyzeCodeDependenciesTool');

const AnalyzeCodeDependenciesSchema = z.object({
  codeEntity: z.string().min(1, 'Code entity is required'),
  entityType: z.enum(['file', 'function', 'class', 'module']).default('file'),
  analysisType: z.enum(['dependencies', 'dependents', 'both']).default('both'),
  depth: z.number().min(1).max(10).default(3),
  includeTransitive: z.boolean().default(true),
  includeWeights: z.boolean().default(false)
});

export const analyzeCodeDependenciesTool: ToolHandler = {
  name: 'analyze-code-dependencies',
  description: 'Trace code dependency paths and analyze relationships between code entities',
  inputSchema: {
    type: 'object',
    properties: {
      codeEntity: {
        type: 'string',
        description: 'Name or path of the code entity to analyze'
      },
      entityType: {
        type: 'string',
        enum: ['file', 'function', 'class', 'module'],
        description: 'Type of code entity',
        default: 'file'
      },
      analysisType: {
        type: 'string',
        enum: ['dependencies', 'dependents', 'both'],
        description: 'Type of analysis to perform',
        default: 'both'
      },
      depth: {
        type: 'number',
        description: 'Maximum dependency traversal depth (1-10)',
        minimum: 1,
        maximum: 10,
        default: 3
      },
      includeTransitive: {
        type: 'boolean',
        description: 'Include transitive dependencies',
        default: true
      },
      includeWeights: {
        type: 'boolean',
        description: 'Include dependency weights/counts',
        default: false
      }
    },
    required: ['codeEntity']
  },

  async execute(params) {
    try {
      const { codeEntity, entityType, analysisType, depth, includeTransitive, includeWeights } =
        AnalyzeCodeDependenciesSchema.parse(params);

      logger.info({ codeEntity, entityType, analysisType, depth }, 'Analyzing code dependencies');

      const neo4jClient = Neo4jClient.getInstance();
      const results: any = {};

      // Analyze dependencies (what this entity depends on)
      if (analysisType === 'dependencies' || analysisType === 'both') {
        const dependenciesQuery = buildDependencyQuery(codeEntity, entityType, 'dependencies', depth, includeTransitive);
        const dependenciesResult = await neo4jClient.executeQuery(dependenciesQuery.query, dependenciesQuery.parameters);

        results.dependencies = processDependencyResults(dependenciesResult, includeWeights);
      }

      // Analyze dependents (what depends on this entity)
      if (analysisType === 'dependents' || analysisType === 'both') {
        const dependentsQuery = buildDependencyQuery(codeEntity, entityType, 'dependents', depth, includeTransitive);
        const dependentsResult = await neo4jClient.executeQuery(dependentsQuery.query, dependentsQuery.parameters);

        results.dependents = processDependencyResults(dependentsResult, includeWeights);
      }

      // Calculate impact analysis
      if (analysisType === 'both') {
        results.impactAnalysis = calculateImpactAnalysis(results.dependencies, results.dependents);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            entity: codeEntity,
            entityType,
            analysisType,
            ...results
          }, null, 2)
        }]
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to analyze code dependencies');

      return {
        content: [{
          type: 'text',
          text: `Error analyzing dependencies: ${error.message}`
        }]
      };
    }
  }
};

function buildDependencyQuery(entity: string, entityType: string, direction: string, depth: number, includeTransitive: boolean) {
  const entityLabel = getEntityLabel(entityType);
  const relationshipPattern = direction === 'dependencies' ? 'DEPENDS_ON' : 'DEPENDS_ON';
  const pathDirection = direction === 'dependencies' ? '-[:DEPENDS_ON*1..' : '<-[:DEPENDS_ON*1..';

  let query: string;
  let parameters: Record<string, any> = { entityName: entity };

  if (includeTransitive) {
    query = `
      MATCH (start:${entityLabel} {name: $entityName})
      MATCH path = (start)${pathDirection}${depth}]-(related:${entityLabel})
      WITH path, start, related, length(path) as pathLength
      RETURN
        start.name as source,
        related.name as target,
        pathLength,
        [node in nodes(path) | {name: node.name, type: labels(node)[0]}] as path,
        [rel in relationships(path) | {type: type(rel), properties: rel}] as relationships
      ORDER BY pathLength, target
    `;
  } else {
    const directDirection = direction === 'dependencies' ? '-[:DEPENDS_ON]->' : '<-[:DEPENDS_ON]-';
    query = `
      MATCH (start:${entityLabel} {name: $entityName})${directDirection}(related:${entityLabel})
      RETURN
        start.name as source,
        related.name as target,
        1 as pathLength,
        [{name: start.name, type: labels(start)[0]}, {name: related.name, type: labels(related)[0]}] as path
    `;
  }

  return { query, parameters };
}

function getEntityLabel(entityType: string): string {
  switch (entityType) {
    case 'file': return 'File';
    case 'function': return 'Function';
    case 'class': return 'Class';
    case 'module': return 'Module';
    default: return 'CodeEntity';
  }
}

function processDependencyResults(result: any, includeWeights: boolean) {
  if (result.records.length === 0) {
    return { count: 0, items: [] };
  }

  const items = result.records.map((record: any) => ({
    source: record.get('source'),
    target: record.get('target'),
    distance: record.get('pathLength'),
    path: record.get('path'),
    ...(record.get('relationships') && { relationships: record.get('relationships') })
  }));

  const analysis = {
    count: items.length,
    items,
    byDistance: groupByDistance(items)
  };

  if (includeWeights) {
    analysis.weights = calculateDependencyWeights(items);
  }

  return analysis;
}

function groupByDistance(items: any[]) {
  return items.reduce((acc, item) => {
    const distance = item.distance;
    if (!acc[distance]) {
      acc[distance] = [];
    }
    acc[distance].push(item);
    return acc;
  }, {});
}

function calculateDependencyWeights(items: any[]) {
  const weights = {};
  items.forEach(item => {
    const target = item.target;
    weights[target] = (weights[target] || 0) + (1 / item.distance); // Closer dependencies have higher weight
  });
  return weights;
}

function calculateImpactAnalysis(dependencies: any, dependents: any) {
  return {
    riskScore: calculateRiskScore(dependencies, dependents),
    criticalityLevel: determineCriticalityLevel(dependencies, dependents),
    changeImpact: {
      directlyAffected: dependents?.count || 0,
      potentiallyAffected: countTransitiveDependents(dependents),
      dependencyDepth: getMaxDependencyDepth(dependencies)
    },
    recommendations: generateRecommendations(dependencies, dependents)
  };
}

function calculateRiskScore(dependencies: any, dependents: any) {
  const depCount = dependencies?.count || 0;
  const dependentCount = dependents?.count || 0;
  const maxDepth = getMaxDependencyDepth(dependencies);

  // Higher risk for entities with many dependencies or many dependents
  return Math.min(100, (depCount * 2) + (dependentCount * 3) + (maxDepth * 5));
}

function determineCriticalityLevel(dependencies: any, dependents: any) {
  const riskScore = calculateRiskScore(dependencies, dependents);

  if (riskScore > 70) return 'HIGH';
  if (riskScore > 40) return 'MEDIUM';
  if (riskScore > 15) return 'LOW';
  return 'MINIMAL';
}

function countTransitiveDependents(dependents: any) {
  if (!dependents?.byDistance) return 0;

  return Object.entries(dependents.byDistance)
    .filter(([distance]) => parseInt(distance) > 1)
    .reduce((sum, [, items]) => sum + (items as any[]).length, 0);
}

function getMaxDependencyDepth(dependencies: any) {
  if (!dependencies?.byDistance) return 0;

  return Math.max(...Object.keys(dependencies.byDistance).map(d => parseInt(d)));
}

function generateRecommendations(dependencies: any, dependents: any) {
  const recommendations = [];
  const riskScore = calculateRiskScore(dependencies, dependents);

  if (riskScore > 70) {
    recommendations.push('Consider refactoring to reduce complexity');
    recommendations.push('Implement comprehensive testing before changes');
  }

  if ((dependencies?.count || 0) > 10) {
    recommendations.push('Consider breaking down into smaller modules');
  }

  if ((dependents?.count || 0) > 15) {
    recommendations.push('Changes to this entity will have wide impact - proceed with caution');
    recommendations.push('Consider deprecation strategy if major changes needed');
  }

  return recommendations;
}