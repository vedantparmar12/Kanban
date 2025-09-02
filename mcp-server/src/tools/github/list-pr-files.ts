import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';
import type { FileDiff } from '../../types/github.js';

const logger = createLogger('ListPRFilesTool');

export class ListPRFilesTool implements Tool {
  name = 'list_pr_files';
  description = 'List all files changed in a GitHub pull request with their statistics';

  inputSchema = {
    type: 'object',
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
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default: 1)',
        default: 1
      },
      perPage: {
        type: 'number',
        description: 'Number of files per page (default: 30)',
        default: 30
      }
    },
    required: ['owner', 'repo', 'pullNumber']
  };

  constructor(private githubClient: GitHubClient) {}

  async execute(args: any) {
    try {
      const { owner, repo, pullNumber, page = 1, perPage = 30 } = args;

      logger.info({ owner, repo, pullNumber, page, perPage }, 'Listing PR files');

      const result = await this.githubClient.listPullRequestFiles(
        owner, 
        repo, 
        pullNumber, 
        page, 
        perPage
      );

      return {
        content: [
          {
            type: 'text',
            text: this.formatFileList(result.files, page, result.hasMore)
          }
        ],
        _meta: {
          pagination: {
            page,
            hasMore: result.hasMore,
            totalFiles: result.files.length
          }
        }
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to list PR files');
      return createMCPErrorResponse(error);
    }
  }

  private formatFileList(files: FileDiff[], page: number, hasMore: boolean): string {
    const fileList = files.map((file, index) => {
      const statusIcon = this.getStatusIcon(file.status);
      return `${statusIcon} **${file.filename}** (+${file.additions}/-${file.deletions})`;
    }).join('\n');

    const summary = files.reduce((acc, file) => ({
      additions: acc.additions + file.additions,
      deletions: acc.deletions + file.deletions
    }), { additions: 0, deletions: 0 });

    return `
# Changed Files (Page ${page})

## Summary
- **Total Files:** ${files.length}
- **Total Additions:** +${summary.additions}
- **Total Deletions:** -${summary.deletions}
${hasMore ? '- **More Files Available:** Use next page to see more' : ''}

## Files
${fileList}

## Legend
- 📝 Modified
- ➕ Added
- ❌ Removed
- 🔄 Renamed
    `.trim();
  }

  private getStatusIcon(status: FileDiff['status']): string {
    switch (status) {
      case 'added': return '➕';
      case 'removed': return '❌';
      case 'modified': return '📝';
      case 'renamed': return '🔄';
      default: return '📄';
    }
  }
}