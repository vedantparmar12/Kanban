import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { KanbanClient } from '../../clients/kanban-client.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';

const logger = createLogger('CreateTaskFromPRTool');

export class CreateTaskFromPRTool implements Tool {
  name = 'create_task_from_pr';
  description = 'Create a new Kanban task from a GitHub pull request';

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
      boardId: {
        type: 'string',
        description: 'Kanban board ID to create task in'
      },
      columnId: {
        type: 'string',
        description: 'Column ID to place the task in (defaults to IN_REVIEW column)'
      },
      swimlaneId: {
        type: 'string',
        description: 'Swimlane ID for the task (optional)'
      },
      assigneeId: {
        type: 'string',
        description: 'User ID to assign the task to (optional)'
      },
      priority: {
        type: 'string',
        enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
        description: 'Task priority (optional, defaults to MEDIUM)',
        default: 'MEDIUM'
      },
      estimateFromChanges: {
        type: 'boolean',
        description: 'Whether to estimate hours based on PR changes',
        default: true
      }
    },
    required: ['owner', 'repo', 'pullNumber', 'boardId']
  };

  constructor(
    private kanbanClient: KanbanClient,
    private githubClient: GitHubClient
  ) {}

  async execute(args: any) {
    try {
      const { 
        owner, 
        repo, 
        pullNumber, 
        boardId, 
        columnId, 
        swimlaneId, 
        assigneeId, 
        priority = 'MEDIUM',
        estimateFromChanges = true 
      } = args;

      logger.info({ owner, repo, pullNumber, boardId }, 'Creating task from PR');

      // Get PR details
      const pr = await this.githubClient.getPullRequest(owner, repo, pullNumber);

      // Get board details to find appropriate column if not specified
      let targetColumnId = columnId;
      if (!targetColumnId) {
        const board = await this.kanbanClient.getBoardWithDetails(boardId);
        // Find IN_REVIEW column or fallback to first column
        const reviewColumn = board.columns.find(col => 
          col.name.toLowerCase().includes('review') || 
          col.name.toLowerCase().includes('in progress')
        );
        targetColumnId = reviewColumn?.id || board.columns[0]?.id;
        
        if (!targetColumnId) {
          throw new Error('No suitable column found for PR task');
        }
      }

      // Estimate hours based on PR changes
      let estimatedHours;
      if (estimateFromChanges) {
        estimatedHours = this.estimateHoursFromChanges(pr.additions, pr.deletions, pr.changed_files);
      }

      // Create task description with PR details
      const description = this.createTaskDescription(pr, owner, repo);

      // Create the task
      const task = await this.kanbanClient.createTask({
        title: `PR: ${pr.title}`,
        description,
        columnId: targetColumnId,
        swimlaneId,
        priority: priority as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
        assigneeId,
        estimatedHours,
        labelIds: []
      });

      // Link the task to the PR
      await this.kanbanClient.linkTaskToPR(task.id, {
        owner,
        repo,
        pullNumber,
        url: `https://github.com/${owner}/${repo}/pull/${pullNumber}`
      });

      // Set initial status based on PR state
      let taskStatus = 'IN_REVIEW';
      if (pr.state === 'closed') {
        taskStatus = pr.merged ? 'DONE' : 'TODO';
      } else if (!pr.mergeable) {
        taskStatus = 'BLOCKED';
      }

      if (taskStatus !== 'TODO') {
        await this.kanbanClient.updateTask(task.id, { status: taskStatus });
      }

      // Create notification
      await this.kanbanClient.createNotification({
        type: 'task_created',
        title: 'Task Created from PR',
        message: `Task "${task.title}" created from PR #${pullNumber}`,
        taskId: task.id,
        metadata: {
          prUrl: `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
          createdAt: new Date().toISOString()
        }
      });

      return {
        content: [
          {
            type: 'text',
            text: `# Task Created from PR Successfully! 🎯

**Task:** ${task.title}
**Task ID:** ${task.id}
**Status:** ${taskStatus}
**Priority:** ${priority}
${estimatedHours ? `**Estimated Hours:** ${estimatedHours}` : ''}

## Source PR Details
- **Repository:** ${owner}/${repo}
- **PR #${pr.number}:** ${pr.title}
- **Author:** ${pr.user.login}
- **Changes:** +${pr.additions}/-${pr.deletions} in ${pr.changed_files} files
- **PR URL:** https://github.com/${owner}/${repo}/pull/${pullNumber}

## Task Details
- **Board:** ${boardId}
- **Column:** ${targetColumnId}
${swimlaneId ? `- **Swimlane:** ${swimlaneId}` : ''}
${assigneeId ? `- **Assignee:** ${assigneeId}` : ''}

The task is now linked to the PR and will automatically sync status changes.
            `
          }
        ],
        _meta: {
          task: {
            id: task.id,
            title: task.title,
            status: taskStatus,
            priority
          },
          pullRequest: {
            owner,
            repo,
            number: pullNumber,
            url: `https://github.com/${owner}/${repo}/pull/${pullNumber}`
          }
        }
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to create task from PR');
      return createMCPErrorResponse(error);
    }
  }

  private createTaskDescription(pr: any, owner: string, repo: string): string {
    return `
# Pull Request Task

**PR #${pr.number}:** ${pr.title}
**Repository:** ${owner}/${repo}
**Author:** ${pr.user.login}
**Created:** ${new Date(pr.created_at).toLocaleDateString()}

## Description
${pr.body || 'No description provided.'}

## Changes Summary
- **Files Changed:** ${pr.changed_files}
- **Additions:** +${pr.additions}
- **Deletions:** -${pr.deletions}

## Branch Information
- **Base:** ${pr.base.ref}
- **Head:** ${pr.head.ref}

**View PR:** https://github.com/${owner}/${repo}/pull/${pr.number}
    `.trim();
  }

  private estimateHoursFromChanges(additions: number, deletions: number, filesChanged: number): number {
    // Simple estimation algorithm:
    // - 1 hour per 100 lines changed
    // - Additional time for more files (complexity)
    // - Minimum 0.5 hours, maximum 40 hours
    
    const totalChanges = additions + deletions;
    const baseHours = totalChanges / 100;
    const complexityBonus = filesChanged * 0.25; // Extra time for multi-file changes
    
    const estimatedHours = Math.max(0.5, Math.min(40, baseHours + complexityBonus));
    
    // Round to nearest 0.5 hours
    return Math.round(estimatedHours * 2) / 2;
  }
}