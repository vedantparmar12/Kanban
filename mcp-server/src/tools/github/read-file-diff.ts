import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';
import type { FileDiff } from '../../types/github.js';

const logger = createLogger('ReadFileDiffTool');

export class ReadFileDiffTool implements Tool {
  name = 'read_file_diff';
  description = 'Read the diff for a specific file in a GitHub pull request';

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
      },
      filename: {
        type: 'string',
        description: 'Path to the file to read diff for'
      },
      maxLines: {
        type: 'number',
        description: 'Maximum number of lines to return (default: 500)',
        default: 500
      }
    },
    required: ['owner', 'repo', 'pullNumber', 'filename']
  };

  constructor(private githubClient: GitHubClient) {}

  async execute(args: any) {
    try {
      const { owner, repo, pullNumber, filename, maxLines = 500 } = args;

      logger.info({ owner, repo, pullNumber, filename }, 'Reading file diff');

      const fileDiff = await this.githubClient.getFileDiff(owner, repo, pullNumber, filename);

      if (!fileDiff) {
        return {
          content: [
            {
              type: 'text',
              text: `File "${filename}" not found in PR #${pullNumber}`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: this.formatFileDiff(fileDiff, maxLines)
          }
        ]
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to read file diff');
      return createMCPErrorResponse(error);
    }
  }

  private formatFileDiff(file: FileDiff, maxLines: number): string {
    const statusText = this.getStatusText(file.status);
    let diffContent = '';

    if (file.patch) {
      const lines = file.patch.split('\n');
      if (lines.length > maxLines) {
        const truncatedLines = lines.slice(0, maxLines);
        diffContent = truncatedLines.join('\n') + `\n\n... (truncated, showing ${maxLines} of ${lines.length} lines)`;
      } else {
        diffContent = file.patch;
      }
    } else {
      diffContent = 'No patch available (binary file or too large)';
    }

    return `
# File Diff: ${file.filename}

**Status:** ${statusText}
**Changes:** +${file.additions}/-${file.deletions}
${file.previous_filename ? `**Previous Name:** ${file.previous_filename}` : ''}

## Diff
\`\`\`diff
${diffContent}
\`\`\`

## File URLs
- [View File](${file.blob_url})
- [Raw Content](${file.raw_url})
    `.trim();
  }

  private getStatusText(status: FileDiff['status']): string {
    switch (status) {
      case 'added': return 'Added';
      case 'removed': return 'Removed';
      case 'modified': return 'Modified';
      case 'renamed': return 'Renamed';
      default: return 'Unknown';
    }
  }
}