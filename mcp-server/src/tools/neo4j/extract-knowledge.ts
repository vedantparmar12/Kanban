import { ToolHandler } from '../../types/mcp.js';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';
import { Neo4jClient } from '../../clients/neo4j-client.js';
import { GitHubClient } from '../../clients/github-client.js';
import fs from 'fs/promises';
import path from 'path';

const logger = createLogger('ExtractKnowledgeTool');

const ExtractKnowledgeSchema = z.object({
  source: z.string().min(1, 'Source is required'),
  sourceType: z.enum(['repository', 'directory', 'file', 'pr', 'issue']).default('repository'),
  extractionTypes: z.array(z.enum(['code', 'documentation', 'tasks', 'relationships', 'metadata'])).default(['code', 'relationships']),
  depth: z.number().min(1).max(10).default(3),
  includeTests: z.boolean().default(false),
  batchSize: z.number().min(1).max(1000).default(50)
});

export const extractKnowledgeTool: ToolHandler = {
  name: 'extract-knowledge',
  description: 'Build knowledge graph from codebases, extracting entities and relationships',
  inputSchema: {
    type: 'object' as const,
    properties: {
      source: {
        type: 'string',
        description: 'Source to extract knowledge from (GitHub URL, local path, etc.)'
      },
      sourceType: {
        type: 'string',
        enum: ['repository', 'directory', 'file', 'pr', 'issue'],
        description: 'Type of source to process',
        default: 'repository'
      },
      extractionTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['code', 'documentation', 'tasks', 'relationships', 'metadata']
        },
        description: 'Types of knowledge to extract',
        default: ['code', 'relationships']
      },
      depth: {
        type: 'number',
        description: 'Directory traversal depth for file-based sources',
        minimum: 1,
        maximum: 10,
        default: 3
      },
      includeTests: {
        type: 'boolean',
        description: 'Include test files in extraction',
        default: false
      },
      batchSize: {
        type: 'number',
        description: 'Number of entities to process in each batch',
        minimum: 1,
        maximum: 1000,
        default: 50
      }
    },
    required: ['source']
  },

  async execute(params) {
    try {
      const { source, sourceType, extractionTypes, depth, includeTests, batchSize } =
        ExtractKnowledgeSchema.parse(params);

      logger.info({ source, sourceType, extractionTypes, depth }, 'Starting knowledge extraction');

      const neo4jClient = Neo4jClient.getInstance();
      const extractionResults: any = {
        source,
        sourceType,
        extractedEntities: {},
        relationships: [],
        statistics: {},
        errors: []
      };

      // Process based on source type
      switch (sourceType) {
        case 'repository':
          await extractFromRepository(source, extractionTypes, extractionResults, depth, includeTests, batchSize);
          break;
        case 'directory':
          await extractFromDirectory(source, extractionTypes, extractionResults, depth, includeTests, batchSize);
          break;
        case 'file':
          await extractFromFile(source, extractionTypes, extractionResults);
          break;
        case 'pr':
          await extractFromPR(source, extractionTypes, extractionResults);
          break;
        case 'issue':
          await extractFromIssue(source, extractionTypes, extractionResults);
          break;
      }

      // Store extracted knowledge in Neo4j
      if (extractionResults.extractedEntities.length > 0 || extractionResults.relationships.length > 0) {
        await storeKnowledgeInGraph(neo4jClient, extractionResults, batchSize);
      }

      // Calculate statistics
      extractionResults.statistics = calculateExtractionStats(extractionResults);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            ...extractionResults,
            // Remove large data from response, just show summary
            extractedEntities: Object.keys(extractionResults.extractedEntities).reduce((acc, key) => {
              acc[key] = extractionResults.extractedEntities[key]?.length || 0;
              return acc;
            }, {}),
            relationshipsCount: extractionResults.relationships.length
          }, null, 2)
        }]
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to extract knowledge');

      return {
        content: [{
          type: 'text',
          text: `Error extracting knowledge: ${error.message}`
        }]
      };
    }
  }
};

async function extractFromRepository(repoUrl: string, extractionTypes: string[], results: any, depth: number, includeTests: boolean, batchSize: number) {
  const githubClient = GitHubClient.getInstance();

  // Parse GitHub URL to get owner/repo
  const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!urlMatch) {
    throw new Error('Invalid GitHub repository URL');
  }

  const [, owner, repo] = urlMatch;

  // Get repository information
  const repoInfo = await githubClient.getRepository(owner, repo);

  // Extract repository metadata if requested
  if (extractionTypes.includes('metadata')) {
    results.extractedEntities.repositories = [{
      name: repoInfo.name,
      fullName: repoInfo.full_name,
      description: repoInfo.description,
      language: repoInfo.language,
      stars: repoInfo.stargazers_count,
      forks: repoInfo.forks_count,
      topics: repoInfo.topics,
      createdAt: repoInfo.created_at,
      updatedAt: repoInfo.updated_at
    }];
  }

  // Get repository contents
  const contents = await githubClient.getRepositoryContents(owner, repo);

  // Process files
  const contentsArray = Array.isArray(contents) ? contents : [contents];
  await processRepositoryContents(githubClient, owner, repo, contentsArray, extractionTypes, results, depth, includeTests, '', batchSize);

  // Extract issues and PRs if requested
  if (extractionTypes.includes('tasks')) {
    await extractIssuesAndPRs(githubClient, owner, repo, results);
  }
}

async function processRepositoryContents(githubClient: any, owner: string, repo: string, contents: any[], extractionTypes: string[], results: any, maxDepth: number, includeTests: boolean, currentPath: string, batchSize: number, currentDepth = 0) {
  if (currentDepth >= maxDepth) return;

  for (const item of contents) {
    if (item.type === 'file') {
      // Skip test files if not requested
      if (!includeTests && isTestFile(item.name)) continue;

      // Extract from file based on type
      if (extractionTypes.includes('code') && isCodeFile(item.name)) {
        await extractCodeFromGitHubFile(githubClient, owner, repo, item, results);
      } else if (extractionTypes.includes('documentation') && isDocumentationFile(item.name)) {
        await extractDocumentationFromGitHubFile(githubClient, owner, repo, item, results);
      }
    } else if (item.type === 'dir' && currentDepth < maxDepth - 1) {
      // Recursively process subdirectories
      const subContents = await githubClient.getRepositoryContents(owner, repo, item.path);
      await processRepositoryContents(githubClient, owner, repo, subContents, extractionTypes, results, maxDepth, includeTests, item.path, batchSize, currentDepth + 1);
    }
  }
}

async function extractFromDirectory(dirPath: string, extractionTypes: string[], results: any, depth: number, includeTests: boolean, batchSize: number) {
  await processDirectoryRecursively(dirPath, extractionTypes, results, depth, includeTests, 0);
}

async function processDirectoryRecursively(dirPath: string, extractionTypes: string[], results: any, maxDepth: number, includeTests: boolean, currentDepth: number) {
  if (currentDepth >= maxDepth) return;

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);

      if (item.isFile()) {
        // Skip test files if not requested
        if (!includeTests && isTestFile(item.name)) continue;

        if (extractionTypes.includes('code') && isCodeFile(item.name)) {
          await extractCodeFromLocalFile(fullPath, results);
        } else if (extractionTypes.includes('documentation') && isDocumentationFile(item.name)) {
          await extractDocumentationFromLocalFile(fullPath, results);
        }
      } else if (item.isDirectory() && currentDepth < maxDepth - 1) {
        await processDirectoryRecursively(fullPath, extractionTypes, results, maxDepth, includeTests, currentDepth + 1);
      }
    }
  } catch (error) {
    results.errors.push(`Error processing directory ${dirPath}: ${error.message}`);
  }
}

async function extractFromFile(filePath: string, extractionTypes: string[], results: any) {
  if (extractionTypes.includes('code') && isCodeFile(filePath)) {
    await extractCodeFromLocalFile(filePath, results);
  } else if (extractionTypes.includes('documentation') && isDocumentationFile(filePath)) {
    await extractDocumentationFromLocalFile(filePath, results);
  }
}

async function extractCodeFromLocalFile(filePath: string, results: any) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const codeEntities = parseCodeEntities(content, filePath);

    if (!results.extractedEntities.code) {
      results.extractedEntities.code = [];
    }
    results.extractedEntities.code.push(...codeEntities);

    // Extract relationships
    const relationships = extractCodeRelationships(codeEntities, filePath);
    results.relationships.push(...relationships);

  } catch (error) {
    results.errors.push(`Error extracting from ${filePath}: ${error.message}`);
  }
}

async function extractCodeFromGitHubFile(githubClient: any, owner: string, repo: string, item: any, results: any) {
  try {
    const content = await githubClient.getFileContent(owner, repo, item.path);
    const codeEntities = parseCodeEntities(content, item.path);

    if (!results.extractedEntities.code) {
      results.extractedEntities.code = [];
    }
    results.extractedEntities.code.push(...codeEntities);

    // Extract relationships
    const relationships = extractCodeRelationships(codeEntities, item.path);
    results.relationships.push(...relationships);

  } catch (error) {
    results.errors.push(`Error extracting from ${item.path}: ${error.message}`);
  }
}

function parseCodeEntities(content: string, filePath: string) {
  const entities = [];
  const extension = path.extname(filePath);

  // Basic parsing based on file type
  switch (extension) {
    case '.js':
    case '.ts':
      entities.push(...parseJavaScriptEntities(content, filePath));
      break;
    case '.py':
      entities.push(...parsePythonEntities(content, filePath));
      break;
    case '.java':
      entities.push(...parseJavaEntities(content, filePath));
      break;
    default:
      // Generic parsing
      entities.push(...parseGenericEntities(content, filePath));
  }

  return entities;
}

function parseJavaScriptEntities(content: string, filePath: string) {
  const entities = [];

  // Extract functions
  const functionRegex = /(function|const|let|var)\s+(\w+)\s*[=:]?\s*(?:async\s+)?(?:function)?\s*\([^)]*\)/g;
  let match;
  while ((match = functionRegex.exec(content)) !== null) {
    entities.push({
      type: 'Function',
      name: match[2],
      file: filePath,
      line: content.substring(0, match.index).split('\n').length,
      kind: match[1] === 'function' ? 'declaration' : 'expression'
    });
  }

  // Extract classes
  const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?\s*{/g;
  while ((match = classRegex.exec(content)) !== null) {
    entities.push({
      type: 'Class',
      name: match[1],
      file: filePath,
      line: content.substring(0, match.index).split('\n').length,
      extends: match[2] || null
    });
  }

  // Extract imports
  const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = importRegex.exec(content)) !== null) {
    entities.push({
      type: 'Import',
      name: match[1],
      file: filePath,
      line: content.substring(0, match.index).split('\n').length
    });
  }

  return entities;
}

function parsePythonEntities(content: string, filePath: string) {
  const entities = [];

  // Extract functions
  const functionRegex = /def\s+(\w+)\s*\([^)]*\):/g;
  let match;
  while ((match = functionRegex.exec(content)) !== null) {
    entities.push({
      type: 'Function',
      name: match[1],
      file: filePath,
      line: content.substring(0, match.index).split('\n').length
    });
  }

  // Extract classes
  const classRegex = /class\s+(\w+)(?:\([^)]*\))?:/g;
  while ((match = classRegex.exec(content)) !== null) {
    entities.push({
      type: 'Class',
      name: match[1],
      file: filePath,
      line: content.substring(0, match.index).split('\n').length
    });
  }

  // Extract imports
  const importRegex = /(?:from\s+(\w+)\s+)?import\s+([^#\n]+)/g;
  while ((match = importRegex.exec(content)) !== null) {
    entities.push({
      type: 'Import',
      name: match[1] ? `${match[1]}.${match[2].trim()}` : match[2].trim(),
      file: filePath,
      line: content.substring(0, match.index).split('\n').length
    });
  }

  return entities;
}

function parseJavaEntities(content: string, filePath: string) {
  const entities = [];

  // Extract classes
  const classRegex = /(?:public|private|protected)?\s*class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*{/g;
  let match;
  while ((match = classRegex.exec(content)) !== null) {
    entities.push({
      type: 'Class',
      name: match[1],
      file: filePath,
      line: content.substring(0, match.index).split('\n').length,
      extends: match[2] || null,
      implements: match[3] ? match[3].split(',').map(s => s.trim()) : null
    });
  }

  // Extract methods
  const methodRegex = /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?\w+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[^{]+)?\s*{/g;
  while ((match = methodRegex.exec(content)) !== null) {
    entities.push({
      type: 'Method',
      name: match[1],
      file: filePath,
      line: content.substring(0, match.index).split('\n').length
    });
  }

  return entities;
}

function parseGenericEntities(content: string, filePath: string) {
  // Basic entity extraction for unknown file types
  return [{
    type: 'File',
    name: path.basename(filePath),
    file: filePath,
    size: content.length,
    lines: content.split('\n').length
  }];
}

function extractCodeRelationships(entities: any[], filePath: string) {
  const relationships = [];

  // Create relationships between entities in the same file
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const entity1 = entities[i];
      const entity2 = entities[j];

      // Classes contain methods/functions
      if (entity1.type === 'Class' && (entity2.type === 'Function' || entity2.type === 'Method')) {
        relationships.push({
          from: entity1.name,
          to: entity2.name,
          type: 'CONTAINS',
          file: filePath
        });
      }

      // Files contain all entities
      if (entity1.type === 'File') {
        relationships.push({
          from: entity1.name,
          to: entity2.name,
          type: 'CONTAINS',
          file: filePath
        });
      }
    }
  }

  return relationships;
}

async function extractDocumentationFromLocalFile(filePath: string, results: any) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    if (!results.extractedEntities.documentation) {
      results.extractedEntities.documentation = [];
    }

    results.extractedEntities.documentation.push({
      type: 'Documentation',
      name: path.basename(filePath),
      file: filePath,
      content: content.substring(0, 1000), // Truncate for storage
      size: content.length
    });

  } catch (error) {
    results.errors.push(`Error extracting documentation from ${filePath}: ${error.message}`);
  }
}

async function extractDocumentationFromGitHubFile(githubClient: any, owner: string, repo: string, item: any, results: any) {
  try {
    const content = await githubClient.getFileContent(owner, repo, item.path);

    if (!results.extractedEntities.documentation) {
      results.extractedEntities.documentation = [];
    }

    results.extractedEntities.documentation.push({
      type: 'Documentation',
      name: item.name,
      file: item.path,
      content: content.substring(0, 1000), // Truncate for storage
      size: content.length
    });

  } catch (error) {
    results.errors.push(`Error extracting documentation from ${item.path}: ${error.message}`);
  }
}

async function extractIssuesAndPRs(githubClient: any, owner: string, repo: string, results: any) {
  try {
    // Extract issues
    const issues = await githubClient.getIssues(owner, repo, { state: 'all', per_page: 100 });

    if (!results.extractedEntities.issues) {
      results.extractedEntities.issues = [];
    }

    results.extractedEntities.issues = issues.map(issue => ({
      type: 'Issue',
      number: issue.number,
      title: issue.title,
      state: issue.state,
      author: issue.user.login,
      labels: issue.labels.map(l => l.name),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at
    }));

    // Extract pull requests
    const prs = await githubClient.getPullRequests(owner, repo, { state: 'all', per_page: 100 });

    if (!results.extractedEntities.pullRequests) {
      results.extractedEntities.pullRequests = [];
    }

    results.extractedEntities.pullRequests = prs.map(pr => ({
      type: 'PullRequest',
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user.login,
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at
    }));

  } catch (error) {
    results.errors.push(`Error extracting issues and PRs: ${error.message}`);
  }
}

async function extractFromPR(prUrl: string, extractionTypes: string[], results: any) {
  // Implementation for extracting knowledge from a specific PR
  // This would analyze the PR diff, comments, reviews, etc.
  throw new Error('PR extraction not yet implemented');
}

async function extractFromIssue(issueUrl: string, extractionTypes: string[], results: any) {
  // Implementation for extracting knowledge from a specific issue
  // This would analyze the issue description, comments, labels, etc.
  throw new Error('Issue extraction not yet implemented');
}

async function storeKnowledgeInGraph(neo4jClient: any, results: any, batchSize: number) {
  // Store entities in batches
  for (const [entityType, entities] of Object.entries(results.extractedEntities)) {
    if (Array.isArray(entities) && entities.length > 0) {
      for (let i = 0; i < entities.length; i += batchSize) {
        const batch = entities.slice(i, i + batchSize);
        await storeBatchEntities(neo4jClient, entityType, batch);
      }
    }
  }

  // Store relationships
  if (results.relationships.length > 0) {
    for (let i = 0; i < results.relationships.length; i += batchSize) {
      const batch = results.relationships.slice(i, i + batchSize);
      await storeBatchRelationships(neo4jClient, batch);
    }
  }
}

async function storeBatchEntities(neo4jClient: any, entityType: string, entities: any[]) {
  const query = `
    UNWIND $entities as entity
    CREATE (n:${entityType.charAt(0).toUpperCase() + entityType.slice(1)})
    SET n += entity
  `;

  await neo4jClient.executeQuery(query, { entities });
}

async function storeBatchRelationships(neo4jClient: any, relationships: any[]) {
  const query = `
    UNWIND $relationships as rel
    MATCH (a {name: rel.from}), (b {name: rel.to})
    CREATE (a)-[r:RELATIONSHIP {type: rel.type}]->(b)
    SET r += rel
  `;

  await neo4jClient.executeQuery(query, { relationships });
}

function calculateExtractionStats(results: any) {
  const stats = {
    totalEntities: 0,
    totalRelationships: results.relationships.length,
    entityBreakdown: {},
    errors: results.errors.length,
    processingTime: Date.now() // This would be calculated properly in real implementation
  };

  for (const [type, entities] of Object.entries(results.extractedEntities)) {
    const count = Array.isArray(entities) ? entities.length : 0;
    stats.entityBreakdown[type] = count;
    stats.totalEntities += count;
  }

  return stats;
}

function isCodeFile(fileName: string): boolean {
  const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs', '.kt', '.scala', '.swift'];
  return codeExtensions.some(ext => fileName.endsWith(ext));
}

function isTestFile(fileName: string): boolean {
  return fileName.includes('test') || fileName.includes('spec') || fileName.includes('__tests__');
}

function isDocumentationFile(fileName: string): boolean {
  const docExtensions = ['.md', '.txt', '.rst', '.adoc'];
  return docExtensions.some(ext => fileName.endsWith(ext)) || fileName.toLowerCase().includes('readme');
}