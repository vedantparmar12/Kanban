import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';
import type { PullRequest } from '../../types/github.js';

const logger = createLogger('ReadPRTool');

export class ReadPRTool implements Tool {
  [key: string]: unknown;
  name = 'read_pr';
  description = 'Read detailed information about a GitHub pull request';

  inputSchema = {
    type: 'object' as const,
    properties: {
      owner: {
        type: 'string',
        description: 'GitHub repository owner'
      },
      repo: {
        type: 'string', 
        description: 'GitHub repository name'
      },
      pullNumber: {
        type: 'number',
        description: 'Pull request number'
      }
    },
    required: ['owner', 'repo', 'pullNumber']
  };

  constructor(private githubClient: GitHubClient) {}

  async execute(args: any) {
    try {
      const { owner, repo, pullNumber } = args;

      logger.info({ owner, repo, pullNumber }, 'Reading PR details');

      const pr = await this.githubClient.getPullRequest(owner, repo, pullNumber);

      return {
        content: [
          {
            type: 'text',
            text: this.formatPRDetails(pr)
          }
        ]
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to read PR');
      return createMCPErrorResponse(error);
    }
  }

  private formatPRDetails(pr: PullRequest): string {
    return `
# Pull Request #${pr.number}: ${pr.title}

**Status:** ${pr.state.toUpperCase()}
**Author:** ${pr.user.login}
**Created:** ${new Date(pr.created_at).toLocaleDateString()}
**Updated:** ${new Date(pr.updated_at).toLocaleDateString()}
${pr.merged ? `**Merged:** ${new Date(pr.merged_at!).toLocaleDateString()}` : ''}

## Description
${pr.body || 'No description provided.'}

## Statistics
- **Files Changed:** ${pr.changed_files}
- **Additions:** +${pr.additions}
- **Deletions:** -${pr.deletions}
- **Comments:** ${pr.comments}
- **Review Comments:** ${pr.review_comments}
- **Commits:** ${pr.commits}

## Branch Information
- **Base:** ${pr.base.ref} (${pr.base.sha.substring(0, 7)})
- **Head:** ${pr.head.ref} (${pr.head.sha.substring(0, 7)})

## Merge Status
**Mergeable:** ${pr.mergeable ? 'Yes' : 'No'}
    `.trim();
  }
}