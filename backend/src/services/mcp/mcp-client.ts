import axios, { AxiosInstance } from 'axios';
import { mcpConfig } from '../../config/mcp.config';
import { logger } from '../../utils/logger';

class MCPClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: mcpConfig.serverUrl,
      timeout: mcpConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': mcpConfig.apiKey
      }
    });

    this.client.interceptors.response.use(
      response => response,
      async error => {
        if (error.response?.status === 503 && mcpConfig.retryAttempts > 0) {
          return this.retryRequest(error.config, mcpConfig.retryAttempts);
        }
        throw error;
      }
    );
  }

  async call(method: string, params: any): Promise<any> {
    try {
      const response = await this.client.post('/rpc', {
        method,
        params,
        id: Date.now()
      });

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      return response.data.result;
    } catch (error: any) {
      logger.error(`MCP call failed: ${method}`, error);
      throw error;
    }
  }

  async analyzeCodeChanges(changes: any): Promise<any> {
    return this.call('analyze_code_changes', { changes });
  }

  async generatePRDescription(context: any): Promise<string> {
    return this.call('generate_pr_description', context);
  }

  async selectReviewers(changes: any): Promise<string[]> {
    return this.call('select_reviewers', { changes });
  }

  async generateDocumentation(code: string, type: string): Promise<string> {
    return this.call('generate_documentation', { code, type });
  }

  async updateReadme(content: string): Promise<void> {
    return this.call('update_readme', { content });
  }

  private async retryRequest(config: any, retriesLeft: number): Promise<any> {
    if (retriesLeft === 0) {
      throw new Error('Max retries reached');
    }

    await this.delay(mcpConfig.retryDelay);
    
    try {
      return await this.client.request(config);
    } catch (error) {
      return this.retryRequest(config, retriesLeft - 1);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const mcpClient = new MCPClient();