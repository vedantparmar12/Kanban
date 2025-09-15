import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';

const logger = createLogger('AddCommentTool');

export class AddCommentTool implements Tool {
  name = 'add_pr_comment';
  description = 'Add a review comment to a specific line in a GitHub pull request';
  [key: string]: unknown;

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
      path: {
        type: 'string',
        description: 'Path to the file to comment on'
      },
      line: {
        type: 'number',
        description: 'Line number to comment on (for single line comments)'
      },
      startLine: {
        type: 'number',
        description: 'Start line for multi-line comments (optional)'
      },
      side: {
        type: 'string',
        enum: ['LEFT', 'RIGHT'],
        description: 'Which side of the diff to comment on (LEFT for old, RIGHT for new)',
        default: 'RIGHT'
      },
      startSide: {
        type: 'string',
        enum: ['LEFT', 'RIGHT'],
        description: 'Which side of the diff the start line is on (for multi-line comments)',
        default: 'RIGHT'
      },
      body: {
        type: 'string',
        description: 'Comment body/content'
      }
    },
    required: ['owner', 'repo', 'pullNumber', 'path', 'line', 'body']
  };

  constructor(private githubClient: GitHubClient) {}

  async execute(args: any) {
    try {
      const { 
        owner, 
        repo, 
        pullNumber, 
        path, 
        line, 
        startLine, 
        side = 'RIGHT', 
        startSide = 'RIGHT', 
        body 
      } = args;

      logger.info({ 
        owner, 
        repo, 
        pullNumber, 
        path, 
        line, 
        startLine 
      }, 'Adding PR comment');

      const comment = await this.githubClient.createReviewComment(
        owner,
        repo,
        pullNumber,
        {
          path,
          line,
          startLine,
          side: side as 'LEFT' | 'RIGHT',
          startSide: startSide as 'LEFT' | 'RIGHT',
          body
        }
      );

      const isMultiLine = startLine && startLine !== line;

      return {
        content: [
          {
            type: 'text',
            text: `# Comment Added Successfully! 💬

**File:** ${comment.path}
**Line${isMultiLine ? 's' : ''}:** ${isMultiLine ? `${startLine}-${line}` : line}
**Side:** ${comment.side}
**Author:** ${comment.user.login}
**Created:** ${new Date(comment.created_at).toLocaleString()}

## Comment
${comment.body}

**Comment ID:** ${comment.id}
            `
          }
        ],
        _meta: {
          comment: {
            id: comment.id,
            path: comment.path,
            line: comment.line,
            startLine: comment.start_line
          }
        }
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to add PR comment');
      return createMCPErrorResponse(error);
    }
  }
}