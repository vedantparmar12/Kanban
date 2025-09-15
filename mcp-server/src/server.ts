import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';

import { GitHubClient } from './clients/github-client.js';
import { KanbanClient } from './clients/kanban-client.js';
import { Neo4jClient } from './clients/neo4j-client.js';
import { createLogger } from './utils/logger.js';
import { MCPTool } from './types/mcp.js';
import { wrapTool } from './utils/tool-wrapper.js';
// Tool type definition for MCP tools

// GitHub Tools
import { ReadPRTool } from './tools/github/read-pr.js';
import { ListPRFilesTool } from './tools/github/list-pr-files.js';
import { ReadFileDiffTool } from './tools/github/read-file-diff.js';
import { ReadFileChunkedTool } from './tools/github/read-file-chunked.js';
import { CreatePRTool } from './tools/github/create-pr.js';
import { AddCommentTool } from './tools/github/add-comment.js';
import { SubmitReviewTool } from './tools/github/submit-review.js';
import { CreateIssueTool } from './tools/github/create-issue.js';
import { UpdateIssueTool } from './tools/github/update-issue.js';
import { AnalyzePRTool } from './tools/github/analyze-pr.js';

// Kanban Integration Tools
import { LinkTaskToPRTool } from './tools/kanban/link-task-to-pr.js';
import { SyncPRStatusTool } from './tools/kanban/sync-pr-status.js';
import { CreateTaskFromPRTool } from './tools/kanban/create-task-from-pr.js';
import { CreateTaskFromIssueTool } from './tools/kanban/create-task-from-issue.js';

// Neo4j/Graph Database Tools
import { queryGraphTool } from './tools/neo4j/query-graph.js';
import { visualizeRelationshipsTool } from './tools/neo4j/visualize-relationships.js';
import { analyzeCodeDependenciesTool } from './tools/neo4j/analyze-code-dependencies.js';
import { findSimilarPatternsTool } from './tools/neo4j/find-similar-patterns.js';
import { extractKnowledgeTool } from './tools/neo4j/extract-knowledge.js';

// Documentation & Knowledge Management Tools
import { generateApiDocsTool } from './tools/documentation/generate-api-docs.js';
import { updateChangelogTool } from './tools/documentation/update-changelog.js';
import { searchDocumentationTool } from './tools/documentation/search-documentation.js';

// Code Analysis & Quality Tools
import { analyzeCodeQualityTool } from './tools/code-analysis/analyze-code-quality.js';
import { calculateMetricsTool } from './tools/code-analysis/calculate-metrics.js';

// Team & Project Management Tools
import { analyzeTeamVelocityTool } from './tools/project-management/analyze-team-velocity.js';
import { generateReportsTool } from './tools/project-management/generate-reports.js';

const logger = createLogger('KanbanMCPServer');

export class KanbanMCPServer {
  private server: Server;
  private githubClient: GitHubClient;
  private kanbanClient: KanbanClient;
  private neo4jClient: Neo4jClient;
  private tools: Map<string, any>;

  constructor() {
    this.server = new Server(
      {
        name: 'kanban-mcp-server',
        version: '2.0.0'
      },
      {
        capabilities: {
          tools: {},
          logging: {}
        }
      }
    );

    // Initialize clients
    this.githubClient = new GitHubClient(process.env.GITHUB_TOKEN);
    this.kanbanClient = new KanbanClient(
      process.env.KANBAN_API_URL || 'http://localhost:3000/api',
      process.env.KANBAN_API_TOKEN
    );
    this.neo4jClient = Neo4jClient.getInstance();

    this.tools = new Map();
    this.registerTools();
    this.setupHandlers();
  }

  private registerTools(): void {
    const classBasedTools: any[] = [
      // GitHub tools
      new ReadPRTool(this.githubClient),
      new ListPRFilesTool(this.githubClient),
      new ReadFileDiffTool(this.githubClient),
      new ReadFileChunkedTool(this.githubClient),
      new CreatePRTool(this.githubClient),
      new AddCommentTool(this.githubClient),
      new SubmitReviewTool(this.githubClient),
      new CreateIssueTool(this.githubClient),
      new UpdateIssueTool(this.githubClient),
      new AnalyzePRTool(this.githubClient),

      // Kanban Integration tools
      new LinkTaskToPRTool(this.kanbanClient, this.githubClient),
      new SyncPRStatusTool(this.kanbanClient, this.githubClient),
      new CreateTaskFromPRTool(this.kanbanClient, this.githubClient),
      new CreateTaskFromIssueTool(this.kanbanClient, this.githubClient)
    ];

    const functionalTools = [
      // Neo4j/Graph Database Tools
      queryGraphTool,
      visualizeRelationshipsTool,
      analyzeCodeDependenciesTool,
      findSimilarPatternsTool,
      extractKnowledgeTool,

      // Documentation & Knowledge Management Tools
      generateApiDocsTool,
      updateChangelogTool,
      searchDocumentationTool,

      // Code Analysis & Quality Tools
      analyzeCodeQualityTool,
      calculateMetricsTool,

      // Team & Project Management Tools
      analyzeTeamVelocityTool,
      generateReportsTool
    ];

    // Register class-based tools
    for (const tool of classBasedTools) {
      this.tools.set(tool.name, tool);
      logger.info({ tool: tool.name }, 'Class-based tool registered');
    }

    // Register functional tools using wrapper
    for (const tool of functionalTools) {
      const wrappedTool = wrapTool(tool);
      this.tools.set(wrappedTool.name, wrappedTool);
      logger.info({ tool: wrappedTool.name }, 'Functional tool registered');
    }

    logger.info({ count: this.tools.size }, 'All tools registered successfully');
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Listing available tools');

      const tools = Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      logger.info({ tool: name, args }, 'Tool called');

      const tool = this.tools.get(name);
      if (!tool) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Tool "${name}" not found`
        );
      }

      try {
        const response = await tool.execute(args);

        if (response.isError) {
          logger.error({ tool: name, response }, 'Tool returned error');
        } else {
          logger.info({ tool: name }, 'Tool executed successfully');
        }

        return {
          content: response.content || [],
          _meta: response._meta
        };
      } catch (error) {
        logger.error({ tool: name, error }, 'Tool execution failed');
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${(error as any).message}`
        );
      }
    });

    this.server.onerror = (error) => {
      logger.error({ error }, 'Server error');
    };
  }

  private zodToJsonSchema(schema: any): any {
    // Simple Zod to JSON Schema converter
    // This is a simplified version - in production, consider using zod-to-json-schema
    if (schema._def) {
      const def = schema._def;
      
      if (def.typeName === 'ZodObject') {
        const properties: any = {};
        const required: string[] = [];
        
        for (const [key, value] of Object.entries(def.shape())) {
          const fieldSchema = value as any;
          properties[key] = this.zodFieldToJsonSchema(fieldSchema);
          
          if (!fieldSchema.isOptional?.()) {
            required.push(key);
          }
        }
        
        return {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined
        };
      }
    }
    
    return { type: 'object' };
  }

  private zodFieldToJsonSchema(schema: any): any {
    if (schema._def) {
      const def = schema._def;
      
      switch (def.typeName) {
        case 'ZodString':
          return { 
            type: 'string',
            description: def.description
          };
        case 'ZodNumber':
          return { 
            type: 'number',
            description: def.description
          };
        case 'ZodBoolean':
          return { 
            type: 'boolean',
            description: def.description
          };
        case 'ZodEnum':
          return {
            type: 'string',
            enum: def.values,
            description: def.description
          };
        case 'ZodArray':
          return {
            type: 'array',
            items: this.zodFieldToJsonSchema(def.type),
            description: def.description
          };
        case 'ZodOptional':
          return { 
            ...this.zodFieldToJsonSchema(def.innerType),
            required: false
          };
        case 'ZodDefault':
          return { 
            ...this.zodFieldToJsonSchema(def.innerType),
            default: def.defaultValue(),
            required: false
          };
        default:
          return { type: 'any' };
      }
    }
    
    return { type: 'any' };
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();

    logger.info('Starting Kanban MCP server...');

    try {
      // Test connections in background (non-blocking)
      Promise.all([
        this.githubClient.testConnection(),
        this.kanbanClient.testConnection(),
        this.connectNeo4j()
      ]).then(([githubOk, kanbanOk, neo4jOk]) => {
        if (githubOk) {
          logger.info('GitHub API connection verified');
        } else {
          logger.warn('GitHub API connection failed - check GITHUB_TOKEN');
        }

        if (kanbanOk) {
          logger.info('Kanban API connection verified');
        } else {
          logger.warn('Kanban API connection failed - check KANBAN_API_URL and KANBAN_API_TOKEN');
        }

        if (neo4jOk) {
          logger.info('Neo4j connection verified');
        } else {
          logger.warn('Neo4j connection failed - check NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD');
        }
      }).catch(err => {
        logger.warn({ error: err }, 'Connection tests failed');
      });

      await this.server.connect(transport);
      logger.info('Kanban MCP server started successfully');

    } catch (error) {
      logger.error({ error }, 'Failed to start Kanban MCP server');
      throw error;
    }
  }

  private async connectNeo4j(): Promise<boolean> {
    try {
      await this.neo4jClient.connect();
      return await this.neo4jClient.verifyConnection();
    } catch (error) {
      return false;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping Kanban MCP server...');

    try {
      await this.neo4jClient.disconnect();
    } catch (error) {
      logger.warn({ error }, 'Error disconnecting from Neo4j');
    }

    await this.server.close();
    logger.info('Kanban MCP server stopped');
  }
}