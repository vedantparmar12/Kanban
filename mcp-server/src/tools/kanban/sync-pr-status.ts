import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { KanbanClient } from '../../clients/kanban-client.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';

const logger = createLogger('SyncPRStatusTool');

export class SyncPRStatusTool implements Tool {
  [key: string]: unknown;
  name = 'sync_pr_status';
  description = 'Sync GitHub pull request status changes to linked Kanban tasks';

  inputSchema = {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'Kanban task ID to sync'
      },
      prStatus: {
        type: 'string',
        enum: ['open', 'closed', 'merged'],
        description: 'Current PR status'
      },
      owner: {
        type: 'string',
        description: 'GitHub repository owner (optional, for verification)'
      },
      repo: {
        type: 'string',
        description: 'GitHub repository name (optional, for verification)'
      },
      pullNumber: {
        type: 'number',
        description: 'Pull request number (optional, for verification)'
      }
    },
    required: ['taskId', 'prStatus']
  };

  constructor(
    private kanbanClient: KanbanClient,
    private githubClient: GitHubClient
  ) {}

  async execute(args: any) {
    try {
      const { taskId, prStatus, owner, repo, pullNumber } = args;

      logger.info({ taskId, prStatus, owner, repo, pullNumber }, 'Syncing PR status to task');

      // Get current task
      const task = await this.kanbanClient.getTask(taskId);
      const currentStatus = task.status;

      // Determine new task status based on PR status
      const newStatus = this.mapPRStatusToTaskStatus(prStatus);

      if (newStatus === currentStatus) {
        return {
          content: [
            {
              type: 'text',
              text: `# No Status Change Required

**Task:** ${task.title} (${taskId})
**Current Status:** ${currentStatus}
**PR Status:** ${prStatus.toUpperCase()}

The task status already matches the PR status. No changes made.
              `
            }
          ]
        };
      }

      // Update task status
      const updatedTask = await this.kanbanClient.syncPRStatus(taskId, prStatus as 'open' | 'closed' | 'merged');

      // If PR details are provided, verify the link
      let prDetails = '';
      if (owner && repo && pullNumber) {
        try {
          const pr = await this.githubClient.getPullRequest(owner, repo, pullNumber);
          prDetails = `\n**PR:** #${pr.number} - ${pr.title}\n**Repository:** ${owner}/${repo}`;
        } catch (error) {
          logger.warn({ error }, 'Could not fetch PR details for verification');
        }
      }

      // Create activity log entry
      await this.kanbanClient.createNotification({
        type: 'pr_sync',
        title: 'PR Status Synced',
        message: `Task status updated from ${currentStatus} to ${updatedTask.status} due to PR status change to ${prStatus}`,
        taskId,
        metadata: {
          oldStatus: currentStatus,
          newStatus: updatedTask.status,
          prStatus,
          syncedAt: new Date().toISOString()
        }
      });

      const statusEmoji = this.getStatusEmoji(updatedTask.status);

      return {
        content: [
          {
            type: 'text',
            text: `# Task Status Synced Successfully! ${statusEmoji}

**Task:** ${task.title} (${taskId})${prDetails}
**Status Change:** ${currentStatus} → ${updatedTask.status}
**PR Status:** ${prStatus.toUpperCase()}
**Synced At:** ${new Date().toLocaleString()}

## Status Mapping
- **open** → IN_REVIEW
- **closed** (not merged) → TODO  
- **merged** → DONE

The task has been automatically updated to reflect the PR status change.
            `
          }
        ],
        _meta: {
          sync: {
            taskId,
            oldStatus: currentStatus,
            newStatus: updatedTask.status,
            prStatus,
            timestamp: new Date().toISOString()
          }
        }
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to sync PR status');
      return createMCPErrorResponse(error);
    }
  }

  private mapPRStatusToTaskStatus(prStatus: string): string {
    switch (prStatus) {
      case 'open':
        return 'IN_REVIEW';
      case 'closed':
        return 'TODO'; // Closed but not merged
      case 'merged':
        return 'DONE';
      default:
        return 'TODO';
    }
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'TODO': return '📋';
      case 'IN_PROGRESS': return '🔄';
      case 'IN_REVIEW': return '👀';
      case 'DONE': return '✅';
      case 'BLOCKED': return '🚫';
      default: return '📝';
    }
  }
}