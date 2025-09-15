import { ToolHandler, ErrorCode } from '../../types/mcp.js';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';
import { Neo4jClient } from '../../clients/neo4j-client.js';

const logger = createLogger('QueryGraphTool');

const QueryGraphSchema = z.object({
  query: z.string().min(1, 'Cypher query is required'),
  parameters: z.record(z.any()).optional().default({}),
  limit: z.number().min(1).max(1000).optional().default(100),
  includeStats: z.boolean().optional().default(false)
});

export const queryGraphTool: ToolHandler = {
  name: 'query-graph',
  description: 'Execute Cypher queries on the Neo4j knowledge graph',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Cypher query to execute'
      },
      parameters: {
        type: 'object' as const,
        description: 'Parameters for the Cypher query',
        additionalProperties: true
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1-1000)',
        minimum: 1,
        maximum: 1000,
        default: 100
      },
      includeStats: {
        type: 'boolean',
        description: 'Include query execution statistics',
        default: false
      }
    },
    required: ['query']
  },

  async execute(params) {
    try {
      const { query, parameters, limit, includeStats } = QueryGraphSchema.parse(params);

      logger.info({ query, parameters, limit }, 'Executing Cypher query');

      // Validate query safety (prevent destructive operations)
      const queryUpper = query.toUpperCase().trim();
      const destructiveKeywords = ['DELETE', 'REMOVE', 'DETACH', 'DROP', 'CREATE CONSTRAINT', 'DROP CONSTRAINT'];

      if (destructiveKeywords.some(keyword => queryUpper.includes(keyword))) {
        return {
          content: [{
            type: 'text',
            text: 'Error: Destructive operations are not allowed through this tool. Use appropriate management interfaces for schema changes.'
          }]
        };
      }

      // Add LIMIT if not present in query
      let finalQuery = query;
      if (!queryUpper.includes('LIMIT') && !queryUpper.includes('COUNT(')) {
        finalQuery = `${query} LIMIT ${limit}`;
      }

      const neo4jClient = Neo4jClient.getInstance();
      const result = await neo4jClient.executeQuery(finalQuery, parameters);

      // Format results
      const formattedResults = {
        records: result.records.map(record => {
          const recordData: Record<string, any> = {};
          record.keys.forEach((key, index) => {
            recordData[key] = record.get(index);
          });
          return recordData;
        }),
        summary: includeStats ? {
          queryType: result.summary.queryType,
          counters: result.summary.counters,
          resultAvailableAfter: result.summary.resultAvailableAfter?.toString(),
          resultConsumedAfter: result.summary.resultConsumedAfter?.toString(),
          notifications: result.summary.notifications
        } : undefined
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(formattedResults, null, 2)
        }]
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to execute Cypher query');

      return {
        content: [{
          type: 'text',
          text: `Error executing query: ${error.message}`
        }]
      };
    }
  }
};