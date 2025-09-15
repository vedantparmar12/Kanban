import { ToolHandler } from '../../types/mcp.js';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';
import { GitHubClient } from '../../clients/github-client.js';
import fs from 'fs/promises';
import path from 'path';

const logger = createLogger('GenerateApiDocsTool');

const GenerateApiDocsSchema = z.object({
  source: z.string().min(1, 'Source is required'),
  sourceType: z.enum(['repository', 'directory', 'openapi']).default('repository'),
  outputFormat: z.enum(['markdown', 'html', 'json', 'openapi']).default('markdown'),
  includeExamples: z.boolean().default(true),
  includeSchemas: z.boolean().default(true),
  outputPath: z.string().optional(),
  frameworks: z.array(z.enum(['express', 'fastify', 'nestjs', 'flask', 'django', 'springboot'])).optional()
});

export const generateApiDocsTool: ToolHandler = {
  name: 'generate-api-docs',
  description: 'Auto-generate API documentation from endpoints and code analysis',
  inputSchema: {
    type: 'object' as const,
    properties: {
      source: {
        type: 'string',
        description: 'Source to analyze (GitHub URL, local path, or OpenAPI spec)'
      },
      sourceType: {
        type: 'string',
        enum: ['repository', 'directory', 'openapi'],
        description: 'Type of source to analyze',
        default: 'repository'
      },
      outputFormat: {
        type: 'string',
        enum: ['markdown', 'html', 'json', 'openapi'],
        description: 'Output format for documentation',
        default: 'markdown'
      },
      includeExamples: {
        type: 'boolean',
        description: 'Include request/response examples',
        default: true
      },
      includeSchemas: {
        type: 'boolean',
        description: 'Include data schemas and models',
        default: true
      },
      outputPath: {
        type: 'string',
        description: 'Path to save generated documentation'
      },
      frameworks: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['express', 'fastify', 'nestjs', 'flask', 'django', 'springboot']
        },
        description: 'Web frameworks to look for (auto-detected if not specified)'
      }
    },
    required: ['source']
  },

  async execute(params) {
    try {
      const { source, sourceType, outputFormat, includeExamples, includeSchemas, outputPath, frameworks } =
        GenerateApiDocsSchema.parse(params);

      logger.info({ source, sourceType, outputFormat }, 'Generating API documentation');

      let apiSpec: any = {};

      // Extract API information based on source type
      switch (sourceType) {
        case 'repository':
          apiSpec = await extractApiFromRepository(source, frameworks);
          break;
        case 'directory':
          apiSpec = await extractApiFromDirectory(source, frameworks);
          break;
        case 'openapi':
          apiSpec = await loadOpenApiSpec(source);
          break;
      }

      // Enhance API spec with examples and schemas
      if (includeExamples) {
        apiSpec = await addExamplesToSpec(apiSpec);
      }

      if (includeSchemas) {
        apiSpec = await enhanceWithSchemas(apiSpec);
      }

      // Generate documentation in requested format
      const documentation = await formatDocumentation(apiSpec, outputFormat);

      // Save to file if output path specified
      if (outputPath) {
        await saveDocumentation(documentation, outputPath, outputFormat);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            apiSpec: {
              title: apiSpec.title || 'API Documentation',
              version: apiSpec.version || '1.0.0',
              endpointsCount: apiSpec.paths ? Object.keys(apiSpec.paths).length : 0,
              schemasCount: apiSpec.components?.schemas ? Object.keys(apiSpec.components.schemas).length : 0
            },
            outputFormat,
            outputPath: outputPath || null,
            documentation: outputFormat === 'json' ? documentation : `[${outputFormat.toUpperCase()} Documentation Generated]`
          }, null, 2)
        }]
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate API documentation');

      return {
        content: [{
          type: 'text',
          text: `Error generating API documentation: ${error.message}`
        }]
      };
    }
  }
};

async function extractApiFromRepository(repoUrl: string, frameworks?: string[]) {
  const githubClient = GitHubClient.getInstance();

  // Parse GitHub URL
  const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!urlMatch) {
    throw new Error('Invalid GitHub repository URL');
  }

  const [, owner, repo] = urlMatch;

  // Get repository info
  const repoInfo = await githubClient.getRepository(owner, repo);

  // Scan for API endpoints
  const apiSpec = {
    openapi: '3.0.0',
    info: {
      title: repoInfo.name,
      description: repoInfo.description,
      version: '1.0.0'
    },
    paths: {},
    components: {
      schemas: {}
    }
  };

  // Recursively scan repository for API definitions
  await scanRepositoryForApi(githubClient, owner, repo, '', apiSpec, frameworks);

  return apiSpec;
}

async function scanRepositoryForApi(githubClient: any, owner: string, repo: string, path: string, apiSpec: any, frameworks?: string[]) {
  const contents = await githubClient.getRepositoryContents(owner, repo, path);

  for (const item of contents) {
    if (item.type === 'file' && isApiFile(item.name)) {
      const content = await githubClient.getFileContent(owner, repo, item.path);
      const endpoints = extractEndpointsFromCode(content, item.name, frameworks);

      for (const endpoint of endpoints) {
        if (!apiSpec.paths[endpoint.path]) {
          apiSpec.paths[endpoint.path] = {};
        }
        apiSpec.paths[endpoint.path][endpoint.method.toLowerCase()] = endpoint.spec;
      }

      // Extract schemas/models
      const schemas = extractSchemasFromCode(content, item.name);
      Object.assign(apiSpec.components.schemas, schemas);

    } else if (item.type === 'dir' && !shouldSkipDirectory(item.name)) {
      await scanRepositoryForApi(githubClient, owner, repo, item.path, apiSpec, frameworks);
    }
  }
}

async function extractApiFromDirectory(dirPath: string, frameworks?: string[]) {
  const packageJsonPath = path.join(dirPath, 'package.json');

  let title = 'API Documentation';
  let description = '';

  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    title = packageJson.name || title;
    description = packageJson.description || description;
  } catch (error) {
    // package.json not found or invalid
  }

  const apiSpec = {
    openapi: '3.0.0',
    info: { title, description, version: '1.0.0' },
    paths: {},
    components: { schemas: {} }
  };

  await scanDirectoryForApi(dirPath, apiSpec, frameworks);

  return apiSpec;
}

async function scanDirectoryForApi(dirPath: string, apiSpec: any, frameworks?: string[], depth = 0) {
  if (depth > 10) return; // Prevent infinite recursion

  const items = await fs.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);

    if (item.isFile() && isApiFile(item.name)) {
      const content = await fs.readFile(fullPath, 'utf-8');
      const endpoints = extractEndpointsFromCode(content, item.name, frameworks);

      for (const endpoint of endpoints) {
        if (!apiSpec.paths[endpoint.path]) {
          apiSpec.paths[endpoint.path] = {};
        }
        apiSpec.paths[endpoint.path][endpoint.method.toLowerCase()] = endpoint.spec;
      }

      // Extract schemas
      const schemas = extractSchemasFromCode(content, item.name);
      Object.assign(apiSpec.components.schemas, schemas);

    } else if (item.isDirectory() && !shouldSkipDirectory(item.name)) {
      await scanDirectoryForApi(fullPath, apiSpec, frameworks, depth + 1);
    }
  }
}

function extractEndpointsFromCode(content: string, fileName: string, frameworks?: string[]) {
  const endpoints = [];
  const detectedFrameworks = detectFrameworks(content, frameworks);

  for (const framework of detectedFrameworks) {
    switch (framework) {
      case 'express':
        endpoints.push(...extractExpressEndpoints(content));
        break;
      case 'fastify':
        endpoints.push(...extractFastifyEndpoints(content));
        break;
      case 'nestjs':
        endpoints.push(...extractNestJSEndpoints(content));
        break;
      case 'flask':
        endpoints.push(...extractFlaskEndpoints(content));
        break;
      case 'django':
        endpoints.push(...extractDjangoEndpoints(content));
        break;
      case 'springboot':
        endpoints.push(...extractSpringBootEndpoints(content));
        break;
    }
  }

  return endpoints;
}

function detectFrameworks(content: string, requestedFrameworks?: string[]): string[] {
  const frameworks = [];

  if (requestedFrameworks) {
    return requestedFrameworks.filter(fw => {
      switch (fw) {
        case 'express': return /express/.test(content) || /(app|router)\.(get|post|put|delete|patch)/.test(content);
        case 'fastify': return /fastify/.test(content);
        case 'nestjs': return /@Controller|@Get|@Post|@Put|@Delete/.test(content);
        case 'flask': return /@app\.route|Flask/.test(content);
        case 'django': return /django|@api_view/.test(content);
        case 'springboot': return /@RestController|@RequestMapping|@GetMapping|@PostMapping/.test(content);
        default: return false;
      }
    });
  }

  // Auto-detect frameworks
  if (/express/.test(content) || /(app|router)\.(get|post|put|delete|patch)/.test(content)) {
    frameworks.push('express');
  }
  if (/fastify/.test(content)) {
    frameworks.push('fastify');
  }
  if (/@Controller|@Get|@Post|@Put|@Delete/.test(content)) {
    frameworks.push('nestjs');
  }
  if (/@app\.route|Flask/.test(content)) {
    frameworks.push('flask');
  }
  if (/django|@api_view/.test(content)) {
    frameworks.push('django');
  }
  if (/@RestController|@RequestMapping|@GetMapping|@PostMapping/.test(content)) {
    frameworks.push('springboot');
  }

  return frameworks;
}

function extractExpressEndpoints(content: string) {
  const endpoints = [];
  const routeRegex = /(app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,/g;

  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[2].toUpperCase();
    const path = match[3];

    endpoints.push({
      method,
      path,
      spec: {
        summary: `${method} ${path}`,
        description: `${method} endpoint for ${path}`,
        responses: {
          '200': {
            description: 'Success'
          }
        }
      }
    });
  }

  return endpoints;
}

function extractFastifyEndpoints(content: string) {
  const endpoints = [];
  const routeRegex = /fastify\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;

  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];

    endpoints.push({
      method,
      path,
      spec: {
        summary: `${method} ${path}`,
        responses: { '200': { description: 'Success' } }
      }
    });
  }

  return endpoints;
}

function extractNestJSEndpoints(content: string) {
  const endpoints = [];

  // Extract controller base path
  const controllerMatch = content.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
  const basePath = controllerMatch ? controllerMatch[1] : '';

  // Extract method decorators
  const methodRegex = /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]([^'"`]*)['"`]\s*\)[^{]*(\w+)\s*\(/g;

  let match;
  while ((match = methodRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    const functionName = match[3];
    const fullPath = `/${basePath}${routePath}`.replace(/\/+/g, '/');

    endpoints.push({
      method,
      path: fullPath,
      spec: {
        summary: `${functionName}`,
        operationId: functionName,
        responses: { '200': { description: 'Success' } }
      }
    });
  }

  return endpoints;
}

function extractFlaskEndpoints(content: string) {
  const endpoints = [];
  const routeRegex = /@app\.route\s*\(\s*['"`]([^'"`]+)['"`](?:.*?methods\s*=\s*\[([^\]]+)\])?\s*\)/g;

  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const path = match[1];
    const methods = match[2] ? match[2].replace(/['"`\s]/g, '').split(',') : ['GET'];

    for (const method of methods) {
      endpoints.push({
        method: method.toUpperCase(),
        path,
        spec: {
          summary: `${method.toUpperCase()} ${path}`,
          responses: { '200': { description: 'Success' } }
        }
      });
    }
  }

  return endpoints;
}

function extractDjangoEndpoints(content: string) {
  const endpoints = [];
  // Django URL patterns are typically in urls.py files
  const urlRegex = /path\s*\(\s*['"`]([^'"`]+)['"`]\s*,/g;

  let match;
  while ((match = urlRegex.exec(content)) !== null) {
    const path = match[1];

    endpoints.push({
      method: 'GET',
      path: `/${path}`,
      spec: {
        summary: `Endpoint for ${path}`,
        responses: { '200': { description: 'Success' } }
      }
    });
  }

  return endpoints;
}

function extractSpringBootEndpoints(content: string) {
  const endpoints = [];

  // Extract controller base path
  const controllerMatch = content.match(/@RequestMapping\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
  const basePath = controllerMatch ? controllerMatch[1] : '';

  // Extract mapping annotations
  const mappingRegex = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)\s*(?:\(\s*['"`]([^'"`]*)['"`]\s*\))?\s*[^{]*(\w+)\s*\(/g;

  let match;
  while ((match = mappingRegex.exec(content)) !== null) {
    let method = 'GET';
    if (match[1] === 'PostMapping') method = 'POST';
    else if (match[1] === 'PutMapping') method = 'PUT';
    else if (match[1] === 'DeleteMapping') method = 'DELETE';

    const routePath = match[2] || '';
    const functionName = match[3];
    const fullPath = `/${basePath}${routePath}`.replace(/\/+/g, '/');

    endpoints.push({
      method,
      path: fullPath,
      spec: {
        summary: functionName,
        operationId: functionName,
        responses: { '200': { description: 'Success' } }
      }
    });
  }

  return endpoints;
}

function extractSchemasFromCode(content: string, fileName: string) {
  const schemas = {};

  // Extract TypeScript interfaces
  if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) {
    const interfaceRegex = /interface\s+(\w+)\s*{([^}]+)}/g;
    let match;

    while ((match = interfaceRegex.exec(content)) !== null) {
      const interfaceName = match[1];
      const properties = {};

      // Parse interface properties (basic parsing)
      const propRegex = /(\w+)[\?]?\s*:\s*([^;,\n]+)/g;
      let propMatch;
      while ((propMatch = propRegex.exec(match[2])) !== null) {
        const propName = propMatch[1];
        const propType = propMatch[2].trim();

        properties[propName] = {
          type: mapTypeScriptTypeToOpenAPI(propType)
        };
      }

      schemas[interfaceName] = {
        type: 'object' as const,
        properties
      };
    }
  }

  return schemas;
}

function mapTypeScriptTypeToOpenAPI(tsType: string): string {
  switch (tsType) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'Date': return 'string';
    default: return 'string';
  }
}

async function addExamplesToSpec(apiSpec: any) {
  // Add example requests/responses to endpoints
  for (const path in apiSpec.paths) {
    for (const method in apiSpec.paths[path]) {
      const operation = apiSpec.paths[path][method];

      // Add example response
      if (operation.responses?.['200'] && !operation.responses['200'].content) {
        operation.responses['200'].content = {
          'application/json': {
            example: generateExampleResponse(operation)
          }
        };
      }

      // Add example request for POST/PUT/PATCH
      if (['post', 'put', 'patch'].includes(method) && !operation.requestBody) {
        operation.requestBody = {
          content: {
            'application/json': {
              example: generateExampleRequest(operation)
            }
          }
        };
      }
    }
  }

  return apiSpec;
}

async function enhanceWithSchemas(apiSpec: any) {
  // This would analyze the codebase more deeply to extract data models
  // For now, just ensure we have the basic structure
  if (!apiSpec.components) {
    apiSpec.components = {};
  }
  if (!apiSpec.components.schemas) {
    apiSpec.components.schemas = {};
  }

  return apiSpec;
}

async function formatDocumentation(apiSpec: any, format: string) {
  switch (format) {
    case 'markdown':
      return generateMarkdownDocs(apiSpec);
    case 'html':
      return generateHtmlDocs(apiSpec);
    case 'json':
      return apiSpec;
    case 'openapi':
      return JSON.stringify(apiSpec, null, 2);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

function generateMarkdownDocs(apiSpec: any): string {
  let md = `# ${apiSpec.info.title}\n\n`;

  if (apiSpec.info.description) {
    md += `${apiSpec.info.description}\n\n`;
  }

  md += `**Version:** ${apiSpec.info.version}\n\n`;

  md += '## Endpoints\n\n';

  for (const path in apiSpec.paths) {
    md += `### ${path}\n\n`;

    for (const method in apiSpec.paths[path]) {
      const operation = apiSpec.paths[path][method];
      md += `#### ${method.toUpperCase()}\n\n`;

      if (operation.summary) {
        md += `**Summary:** ${operation.summary}\n\n`;
      }

      if (operation.description) {
        md += `**Description:** ${operation.description}\n\n`;
      }

      // Add responses
      if (operation.responses) {
        md += '**Responses:**\n\n';
        for (const code in operation.responses) {
          md += `- **${code}:** ${operation.responses[code].description || 'No description'}\n`;
        }
        md += '\n';
      }
    }
  }

  return md;
}

function generateHtmlDocs(apiSpec: any): string {
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${apiSpec.info.title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #333; }
        h2 { color: #666; border-bottom: 1px solid #eee; }
        h3 { color: #888; }
        .method { display: inline-block; padding: 4px 8px; border-radius: 4px; color: white; font-weight: bold; }
        .get { background-color: #61affe; }
        .post { background-color: #49cc90; }
        .put { background-color: #fca130; }
        .delete { background-color: #f93e3e; }
      </style>
    </head>
    <body>
      <h1>${apiSpec.info.title}</h1>
  `;

  if (apiSpec.info.description) {
    html += `<p>${apiSpec.info.description}</p>`;
  }

  html += `<p><strong>Version:</strong> ${apiSpec.info.version}</p>`;
  html += '<h2>Endpoints</h2>';

  for (const path in apiSpec.paths) {
    html += `<h3>${path}</h3>`;

    for (const method in apiSpec.paths[path]) {
      const operation = apiSpec.paths[path][method];
      html += `
        <div>
          <span class="method ${method}">${method.toUpperCase()}</span>
          ${operation.summary || ''}
        </div>
      `;

      if (operation.description) {
        html += `<p>${operation.description}</p>`;
      }
    }
  }

  html += '</body></html>';
  return html;
}

async function saveDocumentation(documentation: any, outputPath: string, format: string) {
  const content = typeof documentation === 'string' ? documentation : JSON.stringify(documentation, null, 2);
  await fs.writeFile(outputPath, content, 'utf-8');
  logger.info({ outputPath, format }, 'Documentation saved');
}

async function loadOpenApiSpec(specPath: string) {
  // Load existing OpenAPI spec
  if (specPath.startsWith('http')) {
    // Fetch from URL
    const response = await fetch(specPath);
    return await response.json();
  } else {
    // Load from file
    const content = await fs.readFile(specPath, 'utf-8');
    return JSON.parse(content);
  }
}

function generateExampleResponse(operation: any) {
  return {
    success: true,
    data: {},
    message: 'Operation completed successfully'
  };
}

function generateExampleRequest(operation: any) {
  return {
    // This would be more sophisticated in a real implementation
    example: 'data'
  };
}

function isApiFile(fileName: string): boolean {
  const apiPatterns = [
    /route/i,
    /controller/i,
    /api/i,
    /handler/i,
    /endpoint/i,
    /views\.py$/,
    /urls\.py$/
  ];

  return apiPatterns.some(pattern => pattern.test(fileName)) ||
         fileName.endsWith('.route.ts') ||
         fileName.endsWith('.controller.ts') ||
         fileName.endsWith('Routes.js');
}

function shouldSkipDirectory(dirName: string): boolean {
  const skipDirs = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.pytest_cache', 'target'];
  return skipDirs.includes(dirName) || dirName.startsWith('.');
}