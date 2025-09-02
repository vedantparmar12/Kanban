import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';

const logger = createLogger('CreateIssueTool');

export class CreateIssueTool implements Tool {
  name = 'create_issue';
  description = 'Create a new GitHub issue';

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
      title: {
        type: 'string',
        description: 'Issue title'
      },
      body: {
        type: 'string',
        description: 'Issue description/body',
        default: ''
      },
      assignees: {
        type: 'array',
        items: { type: 'string' },
        description: 'GitHub usernames to assign to the issue',
        default: []
      },
      milestone: {
        type: 'number',
        description: 'Milestone number to associate with the issue'
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Labels to apply to the issue',
        default: []
      }
    },
    required: ['owner', 'repo', 'title']
  };

  constructor(private githubClient: GitHubClient) {}

  async execute(args: any) {
    try {
      const { owner, repo, title, body = '', assignees = [], milestone, labels = [] } = args;

      logger.info({ owner, repo, title, assignees, labels }, 'Creating GitHub issue');

      const issue = await this.githubClient.createIssue({
        owner,
        repo,
        title,
        body,
        assignees,
        milestone,
        labels
      });

      return {
        content: [
          {
            type: 'text',
            text: `# Issue Created Successfully! 🐛

**Issue #${issue.number}: ${issue.title}**

- **Repository:** ${owner}/${repo}
- **Status:** ${issue.state.toUpperCase()}
- **Author:** ${issue.user.login}
- **Created:** ${new Date(issue.created_at).toLocaleString()}
${issue.assignees.length > 0 ? `- **Assignees:** ${issue.assignees.map(a => a.login).join(', ')}` : ''}
${issue.labels.length > 0 ? `- **Labels:** ${issue.labels.map(l => l.name).join(', ')}` : ''}
${issue.milestone ? `- **Milestone:** ${issue.milestone.title}` : ''}

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
            url: `https://github.com/${owner}/${repo}/issues/${issue.number}`
          }
        }
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to create issue');
      return createMCPErrorResponse(error);
    }
  }
}