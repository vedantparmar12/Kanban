import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from '../types/mcp.js';
import { createLogger } from './logger.js';

const logger = createLogger('ToolWrapper');

export class ToolWrapper implements Tool {
  public name: string;
  public description: string;
  public inputSchema: any;
  [key: string]: unknown;

  constructor(private toolHandler: ToolHandler) {
    this.name = toolHandler.name.replace(/-/g, '_'); // MCP uses underscores
    this.description = toolHandler.description;
    this.inputSchema = toolHandler.inputSchema;
  }

  async execute(args: any) {
    try {
      logger.info({ tool: this.name, args }, 'Executing wrapped tool');

      const result = await this.toolHandler.execute(args);

      logger.info({ tool: this.name }, 'Tool executed successfully');

      return result;
    } catch (error: any) {
      logger.error({ tool: this.name, error: error.message }, 'Tool execution failed');

      return {
        content: [{
          type: 'text',
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  }
}

export function wrapTool(toolHandler: ToolHandler): ToolWrapper {
  return new ToolWrapper(toolHandler);
}