import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';

const logger = createLogger('UpdateIssueTool');

export class UpdateIssueTool implements Tool {
  name = 'update_issue';
  description = 'Update an existing GitHub issue';

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
        description: 'Issue number to update'
      },
      title: {
        type: 'string',
        description: 'New issue title'
      },
      body: {
        type: 'string',
        description: 'New issue description/body'
      },
      state: {
        type: 'string',
        enum: ['open', 'closed'],
        description: 'Issue state'
      },
      stateReason: {
        type: 'string',
        enum: ['completed', 'not_planned', 'reopened'],
        description: 'Reason for state change'
      },
      assignees: {
        type: 'array',
        items: { type: 'string' },
        description: 'GitHub usernames to assign to the issue'
      },
      milestone: {
        type: 'number',
        description: 'Milestone number to associate with the issue (use null to remove)'
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Labels to apply to the issue'
      }
    },
    required: ['owner', 'repo', 'issueNumber']
  };

  constructor(private githubClient: GitHubClient) {}

  async execute(args: any) {
    try {
      const { 
        owner, 
        repo, 
        issueNumber, 
        title, 
        body, 
        state, 
        stateReason, 
        assignees, 
        milestone, 
        labels 
      } = args;

      logger.info({ owner, repo, issueNumber }, 'Updating GitHub issue');

      const updateParams: any = {
        owner,
        repo,
        issue_number: issueNumber
      };

      // Only include fields that are provided
      if (title !== undefined) updateParams.title = title;
      if (body !== undefined) updateParams.body = body;
      if (state !== undefined) updateParams.state = state;
      if (stateReason !== undefined) updateParams.state_reason = stateReason;
      if (assignees !== undefined) updateParams.assignees = assignees;
      if (milestone !== undefined) updateParams.milestone = milestone;
      if (labels !== undefined) updateParams.labels = labels;

      const issue = await this.githubClient.updateIssue(updateParams);

      const changedFields = Object.keys(args).filter(key => 
        !['owner', 'repo', 'issueNumber'].includes(key) && args[key] !== undefined
      );

      return {
        content: [
          {
            type: 'text',
            text: `# Issue Updated Successfully! ✏️

**Issue #${issue.number}: ${issue.title}**

- **Repository:** ${owner}/${repo}
- **Status:** ${issue.state.toUpperCase()}
- **Updated:** ${new Date(issue.updated_at).toLocaleString()}
${issue.assignees.length > 0 ? `- **Assignees:** ${issue.assignees.map(a => a.login).join(', ')}` : ''}
${issue.labels.length > 0 ? `- **Labels:** ${issue.labels.map(l => l.name).join(', ')}` : ''}
${issue.milestone ? `- **Milestone:** ${issue.milestone.title}` : ''}

## Fields Updated
${changedFields.map(field => `- **${field}**: Updated`).join('\n')}

## Description
${issue.body || 'No description provided.'}

**View Issue:** https://github.com/${owner}/${repo}/issues/${issue.number}
            `
          }
        ],
        _meta: {
          issue: {
            id: issue.id,
            number: issue.number,
            url: `https://github.com/${owner}/${repo}/issues/${issue.number}`,
            updatedFields: changedFields
          }
        }
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to update issue');
      return createMCPErrorResponse(error);
    }
  }
}