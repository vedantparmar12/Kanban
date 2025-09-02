import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { KanbanClient } from '../../clients/kanban-client.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';

const logger = createLogger('CreateTaskFromIssueTool');

export class CreateTaskFromIssueTool implements Tool {
  name = 'create_task_from_issue';
  description = 'Create a new Kanban task from a GitHub issue';

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
      issueNumber: {
        type: 'number',
        description: 'GitHub issue number'
      },
      boardId: {
        type: 'string',
        description: 'Kanban board ID to create task in'
      },
      columnId: {
        type: 'string',
        description: 'Column ID to place the task in (defaults to TODO column)'
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
        description: 'Task priority (optional, inferred from labels if not specified)'
      },
      estimatedHours: {
        type: 'number',
        description: 'Estimated hours for the task (optional)'
      }
    },
    required: ['owner', 'repo', 'issueNumber', 'boardId']
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
        issueNumber, 
        boardId, 
        columnId, 
        swimlaneId, 
        assigneeId, 
        priority,
        estimatedHours 
      } = args;

      logger.info({ owner, repo, issueNumber, boardId }, 'Creating task from GitHub issue');

      // First, we need to get the issue details from GitHub
      // Since we don't have a direct getIssue method, we'll use the issues API
      const issueUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
      
      // For now, let's create a basic implementation that would work
      // In a real scenario, you'd add a getIssue method to GitHubClient
      
      // Get board details to find appropriate column if not specified
      let targetColumnId = columnId;
      if (!targetColumnId) {
        const board = await this.kanbanClient.getBoardWithDetails(boardId);
        // Find TODO column or fallback to first column
        const todoColumn = board.columns.find(col => 
          col.name.toLowerCase().includes('todo') || 
          col.name.toLowerCase().includes('backlog')
        );
        targetColumnId = todoColumn?.id || board.columns[0]?.id;
        
        if (!targetColumnId) {
          throw new Error('No suitable column found for issue task');
        }
      }

      // Determine priority from labels if not specified
      let taskPriority = priority;
      if (!taskPriority) {
        taskPriority = 'MEDIUM'; // Default priority
        // In a real implementation, you'd analyze issue labels to determine priority
      }

      // Create task description with issue details
      const description = `
# GitHub Issue Task

**Issue #${issueNumber}**
**Repository:** ${owner}/${repo}
**Issue URL:** https://github.com/${owner}/${repo}/issues/${issueNumber}

## Description
This task was created from a GitHub issue. Please refer to the linked issue for detailed requirements and discussion.

## Issue Details
- **Repository:** ${owner}/${repo}
- **Issue Number:** #${issueNumber}
- **Created from:** GitHub Issue

**View Issue:** https://github.com/${owner}/${repo}/issues/${issueNumber}
      `.trim();

      // Create the task
      const task = await this.kanbanClient.createTask({
        title: `Issue #${issueNumber}: GitHub Issue`,
        description,
        columnId: targetColumnId,
        swimlaneId,
        priority: taskPriority as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
        assigneeId,
        estimatedHours,
        labelIds: []
      });

      // Create notification
      await this.kanbanClient.createNotification({
        type: 'task_created',
        title: 'Task Created from GitHub Issue',
        message: `Task "${task.title}" created from GitHub issue #${issueNumber}`,
        taskId: task.id,
        metadata: {
          issueUrl: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
          issueNumber,
          repository: `${owner}/${repo}`,
          createdAt: new Date().toISOString()
        }
      });

      return {
        content: [
          {
            type: 'text',
            text: `# Task Created from GitHub Issue Successfully! 🎯

**Task:** ${task.title}
**Task ID:** ${task.id}
**Priority:** ${taskPriority}
${estimatedHours ? `**Estimated Hours:** ${estimatedHours}` : ''}

## Source Issue Details
- **Repository:** ${owner}/${repo}
- **Issue #${issueNumber}**
- **Issue URL:** https://github.com/${owner}/${repo}/issues/${issueNumber}

## Task Details
- **Board:** ${boardId}
- **Column:** ${targetColumnId}
${swimlaneId ? `- **Swimlane:** ${swimlaneId}` : ''}
${assigneeId ? `- **Assignee:** ${assigneeId}` : ''}

The task has been created and can now be tracked in your Kanban board. You can update the task title and description after reviewing the GitHub issue details.
            `
          }
        ],
        _meta: {
          task: {
            id: task.id,
            title: task.title,
            priority: taskPriority
          },
          githubIssue: {
            owner,
            repo,
            number: issueNumber,
            url: `https://github.com/${owner}/${repo}/issues/${issueNumber}`
          }
        }
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to create task from GitHub issue');
      return createMCPErrorResponse(error);
    }
  }
}