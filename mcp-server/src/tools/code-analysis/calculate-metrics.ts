import { ToolHandler } from '../../types/mcp.js';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

const logger = createLogger('CalculateMetricsTool');

const CalculateMetricsSchema = z.object({
  source: z.string().min(1, 'Source is required'),
  sourceType: z.enum(['directory', 'file']).default('directory'),
  metrics: z.array(z.enum(['loc', 'complexity', 'halstead', 'maintainability', 'technical_debt'])).default(['loc', 'complexity']),
  languages: z.array(z.string()).optional(),
  includeTests: z.boolean().default(false),
  outputFormat: z.enum(['summary', 'detailed', 'csv']).default('summary')
});

export const calculateMetricsTool: ToolHandler = {
  name: 'calculate-metrics',
  description: 'Calculate comprehensive code complexity and maintainability metrics',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Directory or file path to analyze'
      },
      sourceType: {
        type: 'string',
        enum: ['directory', 'file'],
        description: 'Type of source to analyze',
        default: 'directory'
      },
      metrics: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['loc', 'complexity', 'halstead', 'maintainability', 'technical_debt']
        },
        description: 'Metrics to calculate',
        default: ['loc', 'complexity']
      },
      languages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Programming languages to include'
      },
      includeTests: {
        type: 'boolean',
        description: 'Include test files in analysis',
        default: false
      },
      outputFormat: {
        type: 'string',
        enum: ['summary', 'detailed', 'csv'],
        description: 'Output format for results',
        default: 'summary'
      }
    },
    required: ['source']
  },

  async execute(params) {
    try {
      const { source, sourceType, metrics, languages, includeTests, outputFormat } =
        CalculateMetricsSchema.parse(params);

      logger.info({ source, sourceType, metrics, outputFormat }, 'Calculating code metrics');

      const results: any = {
        source,
        timestamp: new Date().toISOString(),
        summary: {
          totalFiles: 0,
          totalLines: 0,
          languages: {}
        },
        fileMetrics: [],
        aggregatedMetrics: {}
      };

      // Analyze source
      if (sourceType === 'file') {
        await analyzeFile(source, metrics, results);
      } else {
        await analyzeDirectory(source, metrics, languages, includeTests, results);
      }

      // Calculate aggregated metrics
      results.aggregatedMetrics = calculateAggregatedMetrics(results.fileMetrics, metrics);

      // Format output
      const formattedOutput = formatOutput(results, outputFormat);

      return {
        content: [{
          type: 'text',
          text: typeof formattedOutput === 'string' ? formattedOutput : JSON.stringify(formattedOutput, null, 2)
        }]
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to calculate metrics');

      return {
        content: [{
          type: 'text',
          text: `Error calculating metrics: ${error.message}`
        }]
      };
    }
  }
};

async function analyzeFile(filePath: string, metrics: string[], results: any) {
  const fileMetrics = await calculateFileMetrics(filePath, metrics);
  if (fileMetrics) {
    results.fileMetrics.push(fileMetrics);
    results.summary.totalFiles = 1;
    results.summary.totalLines = fileMetrics.loc?.total || 0;

    const language = getFileLanguage(path.basename(filePath));
    if (language) {
      results.summary.languages[language] = {
        files: 1,
        lines: fileMetrics.loc?.total || 0
      };
    }
  }
}

async function analyzeDirectory(dirPath: string, metrics: string[], languages?: string[], includeTests = false, results: any) {
  await analyzeDirectoryRecursive(dirPath, metrics, languages, includeTests, results, 0);

  // Calculate summary
  results.summary.totalFiles = results.fileMetrics.length;
  results.summary.totalLines = results.fileMetrics.reduce((sum: number, file: any) => sum + (file.loc?.total || 0), 0);

  // Group by language
  for (const fileMetric of results.fileMetrics) {
    const language = getFileLanguage(path.basename(fileMetric.filePath));
    if (language) {
      if (!results.summary.languages[language]) {
        results.summary.languages[language] = { files: 0, lines: 0 };
      }
      results.summary.languages[language].files++;
      results.summary.languages[language].lines += fileMetric.loc?.total || 0;
    }
  }
}

async function analyzeDirectoryRecursive(dirPath: string, metrics: string[], languages?: string[], includeTests = false, results: any, depth = 0) {
  if (depth > 10) return; // Prevent infinite recursion

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);

      if (item.isFile()) {
        if (!includeTests && isTestFile(item.name)) continue;

        const language = getFileLanguage(item.name);
        if (!language) continue;

        if (languages && !languages.includes(language)) continue;

        const fileMetrics = await calculateFileMetrics(fullPath, metrics);
        if (fileMetrics) {
          results.fileMetrics.push(fileMetrics);
        }

      } else if (item.isDirectory() && !shouldSkipDirectory(item.name)) {
        await analyzeDirectoryRecursive(fullPath, metrics, languages, includeTests, results, depth + 1);
      }
    }
  } catch (error) {
    logger.warn({ dirPath, error: error.message }, 'Failed to analyze directory');
  }
}

async function calculateFileMetrics(filePath: string, metrics: string[]) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const fileStats = await fs.stat(filePath);
    const language = getFileLanguage(path.basename(filePath));

    const fileMetrics: any = {
      filePath,
      fileName: path.basename(filePath),
      language,
      fileSize: fileStats.size,
      lastModified: fileStats.mtime.toISOString()
    };

    // Calculate requested metrics
    for (const metric of metrics) {
      switch (metric) {
        case 'loc':
          fileMetrics.loc = calculateLinesOfCode(content);
          break;
        case 'complexity':
          fileMetrics.complexity = calculateComplexityMetrics(content, language || 'unknown');
          break;
        case 'halstead':
          fileMetrics.halstead = calculateHalsteadMetrics(content, language || 'unknown');
          break;
        case 'maintainability':
          fileMetrics.maintainability = calculateMaintainabilityIndex(content, fileMetrics);
          break;
        case 'technical_debt':
          fileMetrics.technicalDebt = calculateTechnicalDebt(content, fileMetrics);
          break;
      }
    }

    return fileMetrics;

  } catch (error) {
    logger.warn({ filePath, error: error.message }, 'Failed to analyze file');
    return null;
  }
}

function calculateLinesOfCode(content: string) {
  const lines = content.split('\n');

  return {
    total: lines.length,
    source: lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !isCommentLine(trimmed);
    }).length,
    comments: lines.filter(line => isCommentLine(line.trim())).length,
    blank: lines.filter(line => line.trim().length === 0).length
  };
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') ||
         trimmed.startsWith('#') ||
         trimmed.startsWith('/*') ||
         trimmed.startsWith('*') ||
         trimmed.startsWith('"""') ||
         trimmed.startsWith("'''") ||
         trimmed.startsWith('<!--');
}

function calculateComplexityMetrics(content: string, language: string) {
  const cyclomaticComplexity = calculateCyclomaticComplexity(content, language);
  const cognitiveComplexity = calculateCognitiveComplexity(content, language);
  const nestingDepth = calculateMaxNestingDepth(content, language);

  return {
    cyclomatic: cyclomaticComplexity,
    cognitive: cognitiveComplexity,
    maxNestingDepth: nestingDepth,
    averageComplexity: cyclomaticComplexity.average
  };
}

function calculateCyclomaticComplexity(content: string, language: string) {
  const functions = extractFunctions(content, language);
  const complexities = functions.map(func => calculateFunctionComplexity(func.body, language));

  return {
    total: complexities.reduce((sum, comp) => sum + comp, 0),
    average: complexities.length > 0 ? complexities.reduce((sum, comp) => sum + comp, 0) / complexities.length : 0,
    maximum: Math.max(...complexities, 0),
    functions: functions.map((func, index) => ({
      name: func.name,
      complexity: complexities[index],
      startLine: func.startLine
    }))
  };
}

function calculateCognitiveComplexity(content: string, language: string) {
  // Simplified cognitive complexity calculation
  let complexity = 0;
  let nestingLevel = 0;

  const lines = content.split('\n');
  const patterns = getComplexityPatterns(language);

  for (const line of lines) {
    const trimmed = line.trim();

    // Increase nesting level
    if (patterns.nestingIncrease.some(pattern => trimmed.includes(pattern))) {
      nestingLevel++;
    }

    // Decrease nesting level
    if (patterns.nestingDecrease.some(pattern => trimmed.includes(pattern))) {
      nestingLevel = Math.max(0, nestingLevel - 1);
    }

    // Add complexity based on control structures
    for (const pattern of patterns.complexityIncrease) {
      if (trimmed.includes(pattern)) {
        complexity += 1 + nestingLevel; // Base complexity + nesting penalty
      }
    }
  }

  return complexity;
}

function calculateMaxNestingDepth(content: string, language: string) {
  let maxDepth = 0;
  let currentDepth = 0;

  const patterns = getComplexityPatterns(language);
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (patterns.nestingIncrease.some(pattern => trimmed.includes(pattern))) {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    }

    if (patterns.nestingDecrease.some(pattern => trimmed.includes(pattern))) {
      currentDepth = Math.max(0, currentDepth - 1);
    }
  }

  return maxDepth;
}

function getComplexityPatterns(language: string) {
  const patterns: Record<string, any> = {
    javascript: {
      nestingIncrease: ['{', 'if', 'for', 'while', 'switch', 'try', 'function'],
      nestingDecrease: ['}'],
      complexityIncrease: ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', '&&', '||', '?']
    },
    typescript: {
      nestingIncrease: ['{', 'if', 'for', 'while', 'switch', 'try', 'function'],
      nestingDecrease: ['}'],
      complexityIncrease: ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', '&&', '||', '?']
    },
    python: {
      nestingIncrease: ['if', 'for', 'while', 'try', 'def', 'class', 'with'],
      nestingDecrease: [], // Python uses indentation
      complexityIncrease: ['if', 'elif', 'else', 'while', 'for', 'except', 'and', 'or']
    },
    java: {
      nestingIncrease: ['{', 'if', 'for', 'while', 'switch', 'try'],
      nestingDecrease: ['}'],
      complexityIncrease: ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', '&&', '||', '?']
    }
  };

  return patterns[language] || patterns.javascript;
}

function extractFunctions(content: string, language: string) {
  const functions = [];

  switch (language) {
    case 'javascript':
    case 'typescript':
      const jsRegex = /(function\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/g;
      let jsMatch;
      while ((jsMatch = jsRegex.exec(content)) !== null) {
        const name = jsMatch[2] || jsMatch[3] || 'anonymous';
        const startLine = content.substring(0, jsMatch.index).split('\n').length;
        const body = extractFunctionBody(content, jsMatch.index);
        functions.push({ name, startLine, body });
      }
      break;

    case 'python':
      const pyRegex = /def\s+(\w+)\s*\(/g;
      let pyMatch;
      while ((pyMatch = pyRegex.exec(content)) !== null) {
        const name = pyMatch[1];
        const startLine = content.substring(0, pyMatch.index).split('\n').length;
        const body = extractPythonFunctionBody(content, pyMatch.index);
        functions.push({ name, startLine, body });
      }
      break;

    case 'java':
      const javaRegex = /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?\w+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[^{]+)?\s*{/g;
      let javaMatch;
      while ((javaMatch = javaRegex.exec(content)) !== null) {
        const name = javaMatch[1];
        const startLine = content.substring(0, javaMatch.index).split('\n').length;
        const body = extractFunctionBody(content, javaMatch.index);
        functions.push({ name, startLine, body });
      }
      break;
  }

  return functions;
}

function extractFunctionBody(content: string, startIndex: number): string {
  let braceCount = 0;
  let inFunction = false;
  let body = '';

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];

    if (char === '{') {
      braceCount++;
      inFunction = true;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0 && inFunction) {
        body += char;
        break;
      }
    }

    if (inFunction) {
      body += char;
    }
  }

  return body;
}

function extractPythonFunctionBody(content: string, startIndex: number): string {
  const lines = content.substring(startIndex).split('\n');
  let body = lines[0] + '\n'; // Include function definition
  let baseIndent = -1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.length - line.trimStart().length;

    if (line.trim() === '') {
      body += line + '\n';
      continue;
    }

    if (baseIndent === -1 && line.trim()) {
      baseIndent = indent;
    }

    if (baseIndent > -1 && indent < baseIndent && line.trim()) {
      break; // End of function
    }

    body += line + '\n';
  }

  return body;
}

function calculateFunctionComplexity(functionBody: string, language: string): number {
  let complexity = 1; // Base complexity

  const patterns = getComplexityPatterns(language);

  for (const pattern of patterns.complexityIncrease) {
    const regex = new RegExp(`\\b${pattern}\\b`, 'g');
    const matches = functionBody.match(regex);
    if (matches) {
      complexity += matches.length;
    }
  }

  return complexity;
}

function calculateHalsteadMetrics(content: string, language: string) {
  const operators = getOperators(language);
  const operands = getOperands(content, language);

  const n1 = operators.unique;
  const N1 = operators.total;
  const n2 = operands.unique;
  const N2 = operands.total;

  const n = n1 + n2; // Program vocabulary
  const N = N1 + N2; // Program length
  const V = N * Math.log2(n); // Volume
  const D = (n1 / 2) * (N2 / n2); // Difficulty
  const E = D * V; // Effort
  const T = E / 18; // Time (seconds)
  const B = Math.pow(V, 2/3) / 3000; // Bugs

  return {
    vocabulary: n,
    length: N,
    volume: Math.round(V * 100) / 100,
    difficulty: Math.round(D * 100) / 100,
    effort: Math.round(E * 100) / 100,
    timeSeconds: Math.round(T * 100) / 100,
    estimatedBugs: Math.round(B * 100) / 100
  };
}

function getOperators(language: string) {
  const operatorSets: Record<string, string[]> = {
    javascript: ['+', '-', '*', '/', '%', '=', '==', '===', '!=', '!==', '<', '>', '<=', '>=', '&&', '||', '!', '?', ':', '++', '--', '+=', '-=', '*=', '/='],
    typescript: ['+', '-', '*', '/', '%', '=', '==', '===', '!=', '!==', '<', '>', '<=', '>=', '&&', '||', '!', '?', ':', '++', '--', '+=', '-=', '*=', '/='],
    python: ['+', '-', '*', '/', '//', '%', '**', '=', '==', '!=', '<', '>', '<=', '>=', 'and', 'or', 'not', 'is', 'in'],
    java: ['+', '-', '*', '/', '%', '=', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!', '?', ':', '++', '--', '+=', '-=', '*=', '/=']
  };

  const ops = operatorSets[language] || operatorSets.javascript;

  // This is simplified - in practice, you'd count actual occurrences
  return {
    unique: ops.length,
    total: ops.length * 5 // Estimated average usage
  };
}

function getOperands(content: string, language: string) {
  // Simplified operand extraction
  const words = content.match(/\b\w+\b/g) || [];
  const uniqueWords = new Set(words.filter(word =>
    !isKeyword(word, language) &&
    word.length > 1
  ));

  return {
    unique: uniqueWords.size,
    total: words.length
  };
}

function isKeyword(word: string, language: string): boolean {
  const keywords: Record<string, string[]> = {
    javascript: ['var', 'let', 'const', 'function', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'new', 'this', 'class', 'extends', 'super'],
    typescript: ['var', 'let', 'const', 'function', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'new', 'this', 'class', 'extends', 'super', 'interface', 'type', 'enum'],
    python: ['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'with', 'import', 'from', 'as', 'return', 'yield', 'pass', 'break', 'continue', 'global', 'nonlocal', 'lambda'],
    java: ['class', 'interface', 'extends', 'implements', 'public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'native', 'volatile', 'transient', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'throws', 'new', 'this', 'super']
  };

  return keywords[language]?.includes(word.toLowerCase()) || false;
}

function calculateMaintainabilityIndex(content: string, fileMetrics: any) {
  // Microsoft's Maintainability Index formula
  const loc = fileMetrics.loc?.source || 1;
  const complexity = fileMetrics.complexity?.average || 1;
  const halstead = fileMetrics.halstead?.volume || 1;

  const mi = Math.max(0,
    171 - 5.2 * Math.log(halstead) - 0.23 * complexity - 16.2 * Math.log(loc)
  );

  return {
    index: Math.round(mi * 100) / 100,
    rating: mi > 85 ? 'High' : mi > 70 ? 'Medium' : mi > 50 ? 'Low' : 'Very Low'
  };
}

function calculateTechnicalDebt(content: string, fileMetrics: any) {
  let debtMinutes = 0;

  // Add debt based on various factors
  if (fileMetrics.complexity?.average > 10) {
    debtMinutes += (fileMetrics.complexity.average - 10) * 15; // 15 minutes per point over 10
  }

  if (fileMetrics.loc?.source > 1000) {
    debtMinutes += (fileMetrics.loc.source - 1000) * 0.1; // 0.1 minutes per line over 1000
  }

  if (fileMetrics.maintainability?.index < 70) {
    debtMinutes += (70 - fileMetrics.maintainability.index) * 2; // 2 minutes per point under 70
  }

  // Count TODO, FIXME, HACK comments
  const todos = (content.match(/TODO|FIXME|HACK/gi) || []).length;
  debtMinutes += todos * 30; // 30 minutes per TODO

  return {
    minutes: Math.round(debtMinutes * 100) / 100,
    hours: Math.round((debtMinutes / 60) * 100) / 100,
    rating: debtMinutes < 60 ? 'Low' : debtMinutes < 240 ? 'Medium' : debtMinutes < 480 ? 'High' : 'Critical'
  };
}

function calculateAggregatedMetrics(fileMetrics: any[], metrics: string[]) {
  const aggregated: any = {};

  for (const metric of metrics) {
    switch (metric) {
      case 'loc':
        aggregated.loc = {
          totalLines: fileMetrics.reduce((sum, file) => sum + (file.loc?.total || 0), 0),
          sourceLines: fileMetrics.reduce((sum, file) => sum + (file.loc?.source || 0), 0),
          commentLines: fileMetrics.reduce((sum, file) => sum + (file.loc?.comments || 0), 0),
          blankLines: fileMetrics.reduce((sum, file) => sum + (file.loc?.blank || 0), 0)
        };
        break;

      case 'complexity':
        const complexities = fileMetrics.map(f => f.complexity?.average || 0).filter(c => c > 0);
        aggregated.complexity = {
          average: complexities.length > 0 ? complexities.reduce((a, b) => a + b, 0) / complexities.length : 0,
          maximum: Math.max(...complexities, 0),
          totalFunctions: fileMetrics.reduce((sum, file) => sum + (file.complexity?.functions?.length || 0), 0)
        };
        break;

      case 'maintainability':
        const maintainability = fileMetrics.map(f => f.maintainability?.index || 0).filter(m => m > 0);
        aggregated.maintainability = {
          average: maintainability.length > 0 ? maintainability.reduce((a, b) => a + b, 0) / maintainability.length : 0,
          minimum: Math.min(...maintainability, 100)
        };
        break;

      case 'technical_debt':
        aggregated.technicalDebt = {
          totalMinutes: fileMetrics.reduce((sum, file) => sum + (file.technicalDebt?.minutes || 0), 0),
          totalHours: fileMetrics.reduce((sum, file) => sum + (file.technicalDebt?.hours || 0), 0)
        };
        break;
    }
  }

  return aggregated;
}

function formatOutput(results: any, format: string) {
  switch (format) {
    case 'summary':
      return {
        summary: results.summary,
        aggregatedMetrics: results.aggregatedMetrics,
        topIssues: results.fileMetrics
          .filter((f: any) => f.complexity?.average > 10 || f.maintainability?.index < 70)
          .sort((a: any, b: any) => (b.complexity?.average || 0) - (a.complexity?.average || 0))
          .slice(0, 10)
          .map((f: any) => ({
            file: f.fileName,
            complexity: f.complexity?.average,
            maintainability: f.maintainability?.index,
            technicalDebt: f.technicalDebt?.hours
          }))
      };

    case 'detailed':
      return results;

    case 'csv':
      let csv = 'File,Language,Lines,Complexity,Maintainability,Technical Debt (hours)\n';
      for (const file of results.fileMetrics) {
        csv += `"${file.fileName}","${file.language}",${file.loc?.source || 0},${file.complexity?.average || 0},${file.maintainability?.index || 0},${file.technicalDebt?.hours || 0}\n`;
      }
      return csv;

    default:
      return results;
  }
}

function getFileLanguage(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();
  const languageMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.pyw': 'python',
    '.java': 'java',
    '.cs': 'csharp',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c++': 'cpp',
    '.c': 'c',
    '.php': 'php',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.kt': 'kotlin',
    '.swift': 'swift',
    '.scala': 'scala'
  };

  return languageMap[ext] || null;
}

function isTestFile(fileName: string): boolean {
  return fileName.includes('test') || fileName.includes('spec') ||
         fileName.includes('__tests__') || fileName.endsWith('.test.js') ||
         fileName.endsWith('.test.ts') || fileName.endsWith('.spec.js') ||
         fileName.endsWith('.spec.ts');
}

function shouldSkipDirectory(dirName: string): boolean {
  const skipDirs = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.pytest_cache', 'target', 'vendor'];
  return skipDirs.includes(dirName) || dirName.startsWith('.');
}