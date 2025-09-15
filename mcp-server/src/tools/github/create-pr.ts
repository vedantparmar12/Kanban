import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';

const logger = createLogger('CreatePRTool');

export class CreatePRTool implements Tool {
  name = 'create_pr';
  description = 'Create a new GitHub pull request';

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
      title: {
        type: 'string',
        description: 'Pull request title'
      },
      head: {
        type: 'string',
        description: 'The name of the branch where your changes are implemented'
      },
      base: {
        type: 'string',
        description: 'The name of the branch you want the changes pulled into'
      },
      body: {
        type: 'string',
        description: 'Pull request description/body',
        default: ''
      },
      draft: {
        type: 'boolean',
        description: 'Whether to create as a draft PR',
        default: false
      }
    },
    required: ['owner', 'repo', 'title', 'head', 'base']
  };

  constructor(private githubClient: GitHubClient) {}

  async execute(args: any) {
    try {
      const { owner, repo, title, head, base, body = '', draft = false } = args;

      logger.info({ owner, repo, title, head, base, draft }, 'Creating pull request');

      const pr = await this.githubClient.createPullRequest({
        owner,
        repo,
        title,
        head,
        base,
        body,
        draft
      });

      return {
        content: [
          {
            type: 'text',
            text: `# Pull Request Created Successfully! 🎉

**PR #${pr.number}: ${pr.title}**

- **Repository:** ${owner}/${repo}
- **Branch:** ${pr.head.ref} → ${pr.base.ref}
- **Status:** ${pr.state.toUpperCase()}${draft ? ' (DRAFT)' : ''}
- **Author:** ${pr.user.login}
- **Created:** ${new Date(pr.created_at).toLocaleString()}

## Description
${pr.body || 'No description provided.'}

**View PR:** https://github.com/${owner}/${repo}/pull/${pr.number}
            `
          }
        ],
        _meta: {
          pr: {
            id: pr.id,
            number: pr.number,
            url: `https://github.com/${owner}/${repo}/pull/${pr.number}`
          }
        }
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to create PR');
      return createMCPErrorResponse(error);
    }
  }
}