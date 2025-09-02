import { prisma } from '../../database/connection';
import { logger } from '../../utils/logger';
import { llmService } from '../ai/llm.service';
import { mcpClient } from './mcp-client';

export class DocGeneratorService {
  async getReadme(): Promise<string> {
    try {
      const result = await mcpClient.call('get_readme', {});
      return result.content || '# Project README\n\nNo README found.';
    } catch (error) {
      logger.error('Failed to get README:', error);
      return '# Project README\n\nError loading README.';
    }
  }

  async generateDocs(params: {
    type: 'api' | 'component' | 'architecture';
    path?: string;
    includeExamples?: boolean;
  }) {
    try {
      const result = await mcpClient.call('generate_documentation', {
        type: params.type,
        path: params.path,
        includeExamples: params.includeExamples
      });

      const enhancedDocs = await this.enhanceDocumentation(result.documentation);
      
      return {
        documentation: enhancedDocs,
        metadata: result.metadata
      };
    } catch (error) {
      logger.error('Failed to generate documentation:', error);
      throw error;
    }
  }

  async updateReadme(content: string) {
    try {
      await mcpClient.call('update_readme', { content });
      logger.info('README updated successfully');
    } catch (error) {
      logger.error('Failed to update README:', error);
      throw error;
    }
  }

  async generateFromPR(prId: string) {
    const pr = await prisma.pullRequest.findUnique({
      where: { id: prId },
      include: {
        task: true
      }
    });

    if (!pr) {
      throw new Error('Pull request not found');
    }

    try {
      const changes = await mcpClient.call('analyze_pr_changes', {
        repositoryUrl: pr.repositoryUrl,
        branch: pr.branch,
        baseBranch: pr.baseBranch
      });

      const documentation = await this.generateChangeDocumentation(changes, pr);
      
      await mcpClient.call('update_project_docs', {
        documentation,
        prId: pr.id
      });

      logger.info(`Documentation generated for PR: ${prId}`);
      return documentation;
    } catch (error) {
      logger.error('Failed to generate PR documentation:', error);
      throw error;
    }
  }

  private async enhanceDocumentation(docs: string): Promise<string> {
    const prompt = `Enhance the following documentation with better formatting, examples, and clarity:
    
${docs}

Please ensure:
1. Clear headings and structure
2. Code examples where appropriate
3. Proper markdown formatting
4. Comprehensive but concise explanations`;

    return await llmService.generate(prompt);
  }

  private async generateChangeDocumentation(changes: any, pr: any): Promise<string> {
    const prompt = `Generate documentation for the following code changes:

PR Title: ${pr.title}
PR Description: ${pr.description || 'N/A'}
Files Changed: ${changes.filesChanged}
Additions: ${changes.additions}
Deletions: ${changes.deletions}

Changed Files:
${JSON.stringify(changes.files, null, 2)}

Please generate:
1. Summary of changes
2. API changes (if any)
3. Migration guide (if needed)
4. Updated examples`;

    return await llmService.generate(prompt);
  }
}

export const docGeneratorService = new DocGeneratorService();