export const mcpConfig = {
  serverUrl: process.env.MCP_SERVER_URL || 'http://localhost:8000',
  apiKey: process.env.MCP_API_KEY || '',
  timeout: parseInt(process.env.MCP_TIMEOUT || '30000', 10),
  retryAttempts: parseInt(process.env.MCP_RETRY_ATTEMPTS || '3', 10),
  retryDelay: parseInt(process.env.MCP_RETRY_DELAY || '1000', 10),
  github: {
    token: process.env.GITHUB_TOKEN || '',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com'
  },
  llm: {
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000', 10),
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://api.openai.com/v1',
  },
  
};