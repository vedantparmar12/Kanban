import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { KanbanClient } from '../../clients/kanban-client.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';

const logger = createLogger('LinkTaskToPRTool');

export class LinkTaskToPRTool implements Tool {
  name = 'link_task_to_pr';
  description = 'Link a Kanban task to a GitHub pull request for tracking and automation';

  inputSchema = {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'Kanban task ID to link'
      },
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
      autoSync: {
        type: 'boolean',
        description: 'Whether to automatically sync PR status to task status',
        default: true
      }
    },
    required: ['taskId', 'owner', 'repo', 'pullNumber']
  };

  constructor(
    private kanbanClient: KanbanClient,
    private githubClient: GitHubClient
  ) {}

  async execute(args: any) {
    try {
      const { taskId, owner, repo, pullNumber, autoSync = true } = args;

      logger.info({ taskId, owner, repo, pullNumber }, 'Linking task to PR');

      // Get PR details from GitHub
      const pr = await this.githubClient.getPullRequest(owner, repo, pullNumber);
      
      // Get task details from Kanban
      const task = await this.kanbanClient.getTask(taskId);

      // Create the PR link in Kanban
      await this.kanbanClient.linkTaskToPR(taskId, {
        owner,
        repo,
        pullNumber,
        url: `https://github.com/${owner}/${repo}/pull/${pullNumber}`
      });

      // If auto-sync is enabled, sync the status
      if (autoSync) {
        let newStatus;
        switch (pr.state) {
          case 'open':
            newStatus = pr.mergeable ? 'IN_REVIEW' : 'BLOCKED';
            break;
          case 'closed':
            newStatus = pr.merged ? 'DONE' : 'TODO';
            break;
          default:
            newStatus = null;
        }

        if (newStatus && newStatus !== task.status) {
          await this.kanbanClient.updateTask(taskId, { status: newStatus });
          logger.info({ taskId, oldStatus: task.status, newStatus }, 'Task status synced with PR');
        }
      }

      // Add comment to PR mentioning the task
      const taskUrl = `${this.kanbanClient['baseURL']}/tasks/${taskId}`;
      const commentBody = `🔗 **Linked to Kanban Task**: [${task.title}](${taskUrl})

**Task Details:**
- **Status:** ${task.status}
- **Priority:** ${task.priority}
- **Assignee:** ${task.assignee?.name || 'Unassigned'}
${task.estimatedHours ? `- **Estimated Hours:** ${task.estimatedHours}` : ''}

This PR is now linked to the Kanban board for tracking and automation.`;

      // Note: Adding comment to PR is optional and might not be wanted in all cases
      // You can uncomment this if you want automatic PR comments
      // await this.githubClient.createIssueComment({
      //   owner,
      //   repo,
      //   issue_number: pullNumber,
      //   body: commentBody
      // });

      return {
        content: [
          {
            type: 'text',
            text: `# Task Successfully Linked to PR! 🔗

**Task:** ${task.title} (${taskId})
**PR:** #${pr.number} - ${pr.title}
**Repository:** ${owner}/${repo}
**Auto-Sync:** ${autoSync ? 'Enabled' : 'Disabled'}

## Link Details
- **Task Status:** ${task.status}
- **PR Status:** ${pr.state.toUpperCase()}${pr.merged ? ' (MERGED)' : ''}
- **PR URL:** https://github.com/${owner}/${repo}/pull/${pullNumber}
- **Task URL:** ${taskUrl}

${autoSync ? '✅ Task status will automatically sync with PR state changes.' : '⚠️ Manual status updates required.'}
            `
          }
        ],
        _meta: {
          link: {
            taskId,
            pullRequest: {
              owner,
              repo,
              number: pullNumber,
              url: `https://github.com/${owner}/${repo}/pull/${pullNumber}`
            },
            autoSync
          }
        }
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to link task to PR');
      return createMCPErrorResponse(error);
    }
  }
}