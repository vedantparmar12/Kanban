import { ToolHandler } from '../../types/mcp.js';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';
import { GitHubClient } from '../../clients/github-client.js';
import fs from 'fs/promises';
import path from 'path';

const logger = createLogger('UpdateChangelogTool');

const UpdateChangelogSchema = z.object({
  source: z.string().min(1, 'Source is required'),
  sourceType: z.enum(['repository', 'directory', 'manual']).default('repository'),
  version: z.string().optional(),
  changes: z.array(z.object({
    type: z.enum(['added', 'changed', 'deprecated', 'removed', 'fixed', 'security']),
    description: z.string(),
    pr: z.string().optional(),
    issue: z.string().optional()
  })).optional(),
  sinceTag: z.string().optional(),
  includeCommits: z.boolean().default(true),
  includePRs: z.boolean().default(true),
  format: z.enum(['keepachangelog', 'simple', 'custom']).default('keepachangelog'),
  outputPath: z.string().optional()
});

export const updateChangelogTool: ToolHandler = {
  name: 'update-changelog',
  description: 'Maintain automated changelogs from commits, PRs, and manual entries',
  inputSchema: {
    type: 'object' as const,
    properties: {
      source: {
        type: 'string',
        description: 'Source repository or directory path'
      },
      sourceType: {
        type: 'string',
        enum: ['repository', 'directory', 'manual'],
        description: 'Type of source to analyze',
        default: 'repository'
      },
      version: {
        type: 'string',
        description: 'Version number for this changelog entry'
      },
      changes: {
        type: 'array',
        items: {
          type: 'object' as const,
          properties: {
            type: {
              type: 'string',
              enum: ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security']
            },
            description: { type: 'string' },
            pr: { type: 'string' },
            issue: { type: 'string' }
          },
          required: ['type', 'description']
        },
        description: 'Manual changes to add to changelog'
      },
      sinceTag: {
        type: 'string',
        description: 'Generate changelog since this git tag'
      },
      includeCommits: {
        type: 'boolean',
        description: 'Include commit messages in analysis',
        default: true
      },
      includePRs: {
        type: 'boolean',
        description: 'Include pull requests in analysis',
        default: true
      },
      format: {
        type: 'string',
        enum: ['keepachangelog', 'simple', 'custom'],
        description: 'Changelog format to use',
        default: 'keepachangelog'
      },
      outputPath: {
        type: 'string',
        description: 'Path to save/update changelog file'
      }
    },
    required: ['source']
  },

  async execute(params) {
    try {
      const { source, sourceType, version, changes, sinceTag, includeCommits, includePRs, format, outputPath } =
        UpdateChangelogSchema.parse(params);

      logger.info({ source, sourceType, version, format }, 'Updating changelog');

      let changelogData: any = {
        version: version || await getNextVersion(source, sourceType),
        date: new Date().toISOString().split('T')[0],
        changes: {
          added: [],
          changed: [],
          deprecated: [],
          removed: [],
          fixed: [],
          security: []
        }
      };

      // Add manual changes
      if (changes) {
        for (const change of changes) {
          changelogData.changes[change.type].push({
            description: change.description,
            pr: change.pr,
            issue: change.issue
          });
        }
      }

      // Extract changes from source
      if (sourceType === 'repository') {
        await extractChangesFromRepository(source, changelogData, sinceTag, includeCommits, includePRs);
      } else if (sourceType === 'directory') {
        await extractChangesFromDirectory(source, changelogData, sinceTag, includeCommits);
      }

      // Load existing changelog if it exists
      const changelogPath = outputPath || path.join(
        sourceType === 'directory' ? source : '.',
        'CHANGELOG.md'
      );

      let existingChangelog = '';
      try {
        existingChangelog = await fs.readFile(changelogPath, 'utf-8');
      } catch (error) {
        // File doesn't exist, will create new one
      }

      // Generate new changelog content
      const newChangelog = await generateChangelog(changelogData, existingChangelog, format);

      // Save changelog
      if (outputPath || sourceType === 'directory') {
        await fs.writeFile(changelogPath, newChangelog, 'utf-8');
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            version: changelogData.version,
            changesAdded: Object.values(changelogData.changes).flat().length,
            outputPath: outputPath ? outputPath : (sourceType === 'directory' ? changelogPath : null),
            preview: newChangelog.split('\n').slice(0, 20).join('\n') + '\n...'
          }, null, 2)
        }]
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to update changelog');

      return {
        content: [{
          type: 'text',
          text: `Error updating changelog: ${error.message}`
        }]
      };
    }
  }
};

async function extractChangesFromRepository(repoUrl: string, changelogData: any, sinceTag?: string, includeCommits = true, includePRs = true) {
  const githubClient = GitHubClient.getInstance();

  // Parse repository URL
  const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!urlMatch) {
    throw new Error('Invalid GitHub repository URL');
  }

  const [, owner, repo] = urlMatch;

  // Get commits since tag or last release
  if (includeCommits) {
    const commits = await getCommitsSince(githubClient, owner, repo, sinceTag);
    analyzeCommits(commits, changelogData);
  }

  // Get merged PRs
  if (includePRs) {
    const prs = await getPRsSince(githubClient, owner, repo, sinceTag);
    analyzePRs(prs, changelogData);
  }

  // Get closed issues with labels
  const issues = await getIssuesSince(githubClient, owner, repo, sinceTag);
  analyzeIssues(issues, changelogData);
}

async function extractChangesFromDirectory(dirPath: string, changelogData: any, sinceTag?: string, includeCommits = true) {
  // This would use git commands to analyze local repository
  // For now, just add a placeholder implementation
  if (includeCommits) {
    // Use git log to get commits
    // This would require executing git commands
  }
}

async function getCommitsSince(githubClient: any, owner: string, repo: string, sinceTag?: string) {
  let since: string | undefined;

  if (sinceTag) {
    // Get date of the tag
    try {
      const tag = await githubClient.getTag(owner, repo, sinceTag);
      since = tag.commit.author.date;
    } catch (error) {
      logger.warn({ sinceTag }, 'Could not find tag, using all recent commits');
    }
  }

  return await githubClient.getCommits(owner, repo, { since, per_page: 100 });
}

async function getPRsSince(githubClient: any, owner: string, repo: string, sinceTag?: string) {
  // Get recently merged PRs
  return await githubClient.getPullRequests(owner, repo, {
    state: 'closed',
    sort: 'updated',
    direction: 'desc',
    per_page: 50
  });
}

async function getIssuesSince(githubClient: any, owner: string, repo: string, sinceTag?: string) {
  return await githubClient.getIssues(owner, repo, {
    state: 'closed',
    sort: 'updated',
    direction: 'desc',
    per_page: 50
  });
}

function analyzeCommits(commits: any[], changelogData: any) {
  for (const commit of commits) {
    const message = commit.commit.message;
    const change = categorizeChange(message);

    if (change) {
      changelogData.changes[change.type].push({
        description: change.description,
        commit: commit.sha.substring(0, 7),
        author: commit.commit.author.name
      });
    }
  }
}

function analyzePRs(prs: any[], changelogData: any) {
  for (const pr of prs) {
    if (pr.merged_at) {
      const change = categorizeChange(pr.title, pr.body);

      if (change) {
        changelogData.changes[change.type].push({
          description: change.description,
          pr: `#${pr.number}`,
          author: pr.user.login
        });
      }
    }
  }
}

function analyzeIssues(issues: any[], changelogData: any) {
  for (const issue of issues) {
    // Only include issues marked as bugs or enhancements
    const labels = issue.labels.map((l: any) => l.name.toLowerCase());

    if (labels.includes('bug') || labels.includes('fix')) {
      changelogData.changes.fixed.push({
        description: issue.title,
        issue: `#${issue.number}`
      });
    } else if (labels.includes('enhancement') || labels.includes('feature')) {
      changelogData.changes.added.push({
        description: issue.title,
        issue: `#${issue.number}`
      });
    }
  }
}

function categorizeChange(message: string, body?: string): { type: string; description: string } | null {
  const text = (message + ' ' + (body || '')).toLowerCase();

  // Common conventional commit patterns
  if (message.match(/^feat(\(.+\))?:/)) {
    return { type: 'added', description: message.replace(/^feat(\(.+\))?:\s*/, '') };
  }
  if (message.match(/^fix(\(.+\))?:/)) {
    return { type: 'fixed', description: message.replace(/^fix(\(.+\))?:\s*/, '') };
  }
  if (message.match(/^refactor(\(.+\))?:/)) {
    return { type: 'changed', description: message.replace(/^refactor(\(.+\))?:\s*/, '') };
  }
  if (message.match(/^break(\(.+\))?:|BREAKING CHANGE/)) {
    return { type: 'changed', description: message };
  }

  // Keyword-based categorization
  if (text.includes('add') || text.includes('new') || text.includes('implement')) {
    return { type: 'added', description: message };
  }
  if (text.includes('fix') || text.includes('bug') || text.includes('resolve')) {
    return { type: 'fixed', description: message };
  }
  if (text.includes('update') || text.includes('change') || text.includes('improve')) {
    return { type: 'changed', description: message };
  }
  if (text.includes('remove') || text.includes('delete')) {
    return { type: 'removed', description: message };
  }
  if (text.includes('deprecate')) {
    return { type: 'deprecated', description: message };
  }
  if (text.includes('security') || text.includes('vulnerability')) {
    return { type: 'security', description: message };
  }

  // Skip merge commits and other non-relevant commits
  if (message.startsWith('Merge') || message.startsWith('chore') || message.length < 10) {
    return null;
  }

  // Default to 'changed' for unclassified commits
  return { type: 'changed', description: message };
}

async function generateChangelog(changelogData: any, existingChangelog: string, format: string) {
  switch (format) {
    case 'keepachangelog':
      return generateKeepAChangelogFormat(changelogData, existingChangelog);
    case 'simple':
      return generateSimpleFormat(changelogData, existingChangelog);
    case 'custom':
      return generateCustomFormat(changelogData, existingChangelog);
    default:
      return generateKeepAChangelogFormat(changelogData, existingChangelog);
  }
}

function generateKeepAChangelogFormat(changelogData: any, existingChangelog: string) {
  let newEntry = `## [${changelogData.version}] - ${changelogData.date}\n\n`;

  // Add sections with changes
  const sections = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

  for (const section of sections) {
    const sectionKey = section.toLowerCase();
    const changes = changelogData.changes[sectionKey];

    if (changes && changes.length > 0) {
      newEntry += `### ${section}\n\n`;

      for (const change of changes) {
        let line = `- ${change.description}`;

        if (change.pr) {
          line += ` (${change.pr})`;
        }
        if (change.issue) {
          line += ` (${change.issue})`;
        }
        if (change.commit) {
          line += ` (${change.commit})`;
        }

        newEntry += line + '\n';
      }
      newEntry += '\n';
    }
  }

  // Combine with existing changelog
  if (existingChangelog) {
    const lines = existingChangelog.split('\n');
    const titleIndex = lines.findIndex(line => line.startsWith('# '));
    const firstVersionIndex = lines.findIndex((line, index) =>
      index > titleIndex && line.startsWith('## ')
    );

    if (titleIndex >= 0 && firstVersionIndex > titleIndex) {
      // Insert new entry after title and before first version
      const beforeVersion = lines.slice(0, firstVersionIndex);
      const afterVersion = lines.slice(firstVersionIndex);

      return [
        ...beforeVersion,
        newEntry,
        ...afterVersion
      ].join('\n');
    } else if (titleIndex >= 0) {
      // Insert after title
      const beforeVersion = lines.slice(0, titleIndex + 1);
      const afterVersion = lines.slice(titleIndex + 1);

      return [
        ...beforeVersion,
        '',
        newEntry,
        ...afterVersion
      ].join('\n');
    } else {
      // Prepend to existing content
      return newEntry + '\n' + existingChangelog;
    }
  } else {
    // Create new changelog
    return `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n${newEntry}`;
  }
}

function generateSimpleFormat(changelogData: any, existingChangelog: string) {
  let newEntry = `# Version ${changelogData.version} (${changelogData.date})\n\n`;

  const allChanges = Object.values(changelogData.changes).flat() as any[];

  for (const change of allChanges) {
    let line = `* ${change.description}`;

    if (change.pr) {
      line += ` (${change.pr})`;
    }
    if (change.issue) {
      line += ` (${change.issue})`;
    }

    newEntry += line + '\n';
  }
  newEntry += '\n';

  return newEntry + (existingChangelog || '');
}

function generateCustomFormat(changelogData: any, existingChangelog: string) {
  // This would allow for custom templates
  // For now, default to keep-a-changelog format
  return generateKeepAChangelogFormat(changelogData, existingChangelog);
}

async function getNextVersion(source: string, sourceType: string): Promise<string> {
  // Try to get version from package.json
  if (sourceType === 'directory') {
    try {
      const packageJsonPath = path.join(source, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      if (packageJson.version) {
        const version = packageJson.version;
        const parts = version.split('.');
        const patch = parseInt(parts[2] || '0') + 1;
        return `${parts[0]}.${parts[1]}.${patch}`;
      }
    } catch (error) {
      // package.json not found or invalid
    }
  }

  // Default version
  return '1.0.0';
}