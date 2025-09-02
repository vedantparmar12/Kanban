import OpenAI from 'openai';
import { mcpConfig } from '../../config/mcp.config';
import { logger } from '../../utils/logger';
import { cache } from '../../utils/cache';

export class LLMService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: mcpConfig.openai.apiKey
    });
  }

  async generate(prompt: string, options?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }): Promise<string> {
    const cacheKey = `llm:${this.hashPrompt(prompt)}`;
    const cached = await cache.get<string>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: options?.model || mcpConfig.openai.model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant for a Kanban board application.' },
          { role: 'user', content: prompt }
        ],
        temperature: options?.temperature || mcpConfig.openai.temperature,
        max_tokens: options?.maxTokens || mcpConfig.openai.maxTokens
      });

      const result = completion.choices[0]?.message?.content || '';
      
      await cache.set(cacheKey, result, 3600);
      
      return result;
    } catch (error) {
      logger.error('LLM generation failed:', error);
      throw error;
    }
  }

  async generateWithTemplate(template: string, context: any): Promise<string> {
    const prompt = this.fillTemplate(template, context);
    return this.generate(prompt);
  }

  async analyzeCode(code: string): Promise<{
    summary: string;
    complexity: string;
    suggestions: string[];
  }> {
    const prompt = `Analyze the following code and provide:
1. A brief summary
2. Complexity assessment (low/medium/high)
3. Improvement suggestions

Code:
${code}`;

    const response = await this.generate(prompt);
    
    return this.parseCodeAnalysis(response);
  }

  async generateCommitMessage(diff: string): Promise<string> {
    const prompt = `Generate a concise, conventional commit message for the following changes:

${diff}

Follow the format: type(scope): description
Types: feat, fix, docs, style, refactor, test, chore`;

    return this.generate(prompt, { temperature: 0.3, maxTokens: 100 });
  }

  async summarizeDiscussion(messages: string[]): Promise<string> {
    const prompt = `Summarize the following discussion into key points:

${messages.join('\n---\n')}

Provide a brief, bullet-point summary.`;

    return this.generate(prompt, { temperature: 0.5, maxTokens: 500 });
  }

  private fillTemplate(template: string, context: any): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return context[key] || match;
    });
  }

  private parseCodeAnalysis(response: string): any {
    const lines = response.split('\n');
    const result = {
      summary: '',
      complexity: 'medium',
      suggestions: []
    };

    let currentSection = '';
    for (const line of lines) {
      if (line.toLowerCase().includes('summary')) {
        currentSection = 'summary';
      } else if (line.toLowerCase().includes('complexity')) {
        currentSection = 'complexity';
      } else if (line.toLowerCase().includes('suggestion')) {
        currentSection = 'suggestions';
      } else if (line.trim()) {
        if (currentSection === 'summary') {
          result.summary += line + ' ';
        } else if (currentSection === 'complexity') {
          const complexity = line.toLowerCase();
          if (complexity.includes('low') || complexity.includes('simple')) {
            result.complexity = 'low';
          } else if (complexity.includes('high') || complexity.includes('complex')) {
            result.complexity = 'high';
          }
        } else if (currentSection === 'suggestions') {
          result.suggestions.push(line.replace(/^[-*]\s*/, '').trim());
        }
      }
    }

    return result;
  }

  private hashPrompt(prompt: string): string {
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}

export const llmService = new LLMService();