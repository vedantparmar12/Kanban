import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';
import type { CreateReviewParams } from '../../types/github.js';

const logger = createLogger('SubmitReviewTool');

export class SubmitReviewTool implements Tool {
  name = 'submit_review';
  description = 'Submit a complete review for a GitHub pull request';

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
      event: {
        type: 'string',
        enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'],
        description: 'Review action to take'
      },
      body: {
        type: 'string',
        description: 'Overall review comment/summary'
      },
      comments: {
        type: 'array',
        description: 'Array of line-specific comments to include in the review',
        items: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file'
            },
            line: {
              type: 'number',
              description: 'Line number'
            },
            body: {
              type: 'string',
              description: 'Comment text'
            },
            start_line: {
              type: 'number',
              description: 'Start line for multi-line comments'
            },
            side: {
              type: 'string',
              enum: ['LEFT', 'RIGHT'],
              description: 'Side of diff'
            },
            start_side: {
              type: 'string',
              enum: ['LEFT', 'RIGHT'],
              description: 'Side of diff for start line'
            }
          },
          required: ['path', 'line', 'body']
        },
        default: []
      }
    },
    required: ['owner', 'repo', 'pullNumber', 'event', 'body']
  };

  constructor(private githubClient: GitHubClient) {}

  async execute(args: any) {
    try {
      const { owner, repo, pullNumber, event, body, comments = [] } = args;

      logger.info({ 
        owner, 
        repo, 
        pullNumber, 
        event, 
        commentCount: comments.length 
      }, 'Submitting PR review');

      const reviewParams: CreateReviewParams = {
        owner,
        repo,
        pull_number: pullNumber,
        event: event as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
        body,
        comments: comments.map((comment: any) => ({
          path: comment.path,
          line: comment.line,
          body: comment.body,
          start_line: comment.start_line,
          side: comment.side,
          start_side: comment.start_side
        }))
      };

      const review = await this.githubClient.createReview(reviewParams);

      const statusEmoji = this.getStatusEmoji(event);
      const actionText = this.getActionText(event);

      return {
        content: [
          {
            type: 'text',
            text: `# Review Submitted Successfully! ${statusEmoji}

**PR #${pullNumber}** - **${actionText}**
**Reviewer:** ${review.user.login}
**Submitted:** ${review.submitted_at ? new Date(review.submitted_at).toLocaleString() : 'Pending'}
**Comments:** ${comments.length} line-specific comments

## Review Summary
${review.body}

**Review ID:** ${review.id}
            `
          }
        ],
        _meta: {
          review: {
            id: review.id,
            state: review.state,
            submitted_at: review.submitted_at
          }
        }
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to submit review');
      return createMCPErrorResponse(error);
    }
  }

  private getStatusEmoji(event: string): string {
    switch (event) {
      case 'APPROVE': return '✅';
      case 'REQUEST_CHANGES': return '❌';
      case 'COMMENT': return '💬';
      default: return '📝';
    }
  }

  private getActionText(event: string): string {
    switch (event) {
      case 'APPROVE': return 'Approved';
      case 'REQUEST_CHANGES': return 'Changes Requested';
      case 'COMMENT': return 'Comment Added';
      default: return 'Review Submitted';
    }
  }
}