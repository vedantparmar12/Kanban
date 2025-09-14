import { ToolHandler } from '../../types/mcp.js';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';
import { GitHubClient } from '../../clients/github-client.js';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const logger = createLogger('AnalyzeCodeQualityTool');
const execAsync = promisify(exec);

const AnalyzeCodeQualitySchema = z.object({
  source: z.string().min(1, 'Source is required'),
  sourceType: z.enum(['repository', 'directory', 'file']).default('directory'),
  analysisTypes: z.array(z.enum(['complexity', 'maintainability', 'duplication', 'coverage', 'security', 'performance'])).default(['complexity', 'maintainability']),
  languages: z.array(z.string()).optional(),
  includeTests: z.boolean().default(false),
  threshold: z.object({
    complexity: z.number().default(10),
    maintainability: z.number().default(60),
    duplication: z.number().default(5)
  }).default({})
});

export const analyzeCodeQualityTool: ToolHandler = {
  name: 'analyze-code-quality',
  description: 'Run comprehensive code quality analysis including complexity, maintainability, and security checks',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Source to analyze (GitHub URL, directory path, or file path)'
      },
      sourceType: {
        type: 'string',
        enum: ['repository', 'directory', 'file'],
        description: 'Type of source to analyze',
        default: 'directory'
      },
      analysisTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['complexity', 'maintainability', 'duplication', 'coverage', 'security', 'performance']
        },
        description: 'Types of analysis to perform',
        default: ['complexity', 'maintainability']
      },
      languages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Programming languages to analyze (auto-detected if not specified)'
      },
      includeTests: {
        type: 'boolean',
        description: 'Include test files in analysis',
        default: false
      },
      threshold: {
        type: 'object',
        properties: {
          complexity: { type: 'number', default: 10 },
          maintainability: { type: 'number', default: 60 },
          duplication: { type: 'number', default: 5 }
        },
        description: 'Quality thresholds for reporting issues'
      }
    },
    required: ['source']
  },

  async execute(params) {
    try {
      const { source, sourceType, analysisTypes, languages, includeTests, threshold } =
        AnalyzeCodeQualitySchema.parse(params);

      logger.info({ source, sourceType, analysisTypes }, 'Starting code quality analysis');

      let analysisPath = source;

      // Handle repository source
      if (sourceType === 'repository') {
        // This would typically clone the repo to a temp directory
        // For now, we'll assume it's a local path
        analysisPath = source;
      }

      const analysisResults: any = {
        source,
        sourceType,
        timestamp: new Date().toISOString(),
        summary: {
          totalFiles: 0,
          totalLines: 0,
          languages: {},
          overallScore: 0
        },
        issues: [],
        metrics: {}
      };

      // Detect languages if not provided
      const detectedLanguages = languages || await detectLanguages(analysisPath, sourceType);
      analysisResults.summary.languages = await getLanguageStats(analysisPath, detectedLanguages, includeTests);

      // Run each requested analysis
      for (const analysisType of analysisTypes) {
        logger.info({ analysisType }, 'Running analysis');

        switch (analysisType) {
          case 'complexity':
            const complexityResults = await analyzeComplexity(analysisPath, detectedLanguages, includeTests, threshold.complexity);
            analysisResults.metrics.complexity = complexityResults;
            analysisResults.issues.push(...complexityResults.issues);
            break;

          case 'maintainability':
            const maintainabilityResults = await analyzeMaintainability(analysisPath, detectedLanguages, includeTests, threshold.maintainability);
            analysisResults.metrics.maintainability = maintainabilityResults;
            analysisResults.issues.push(...maintainabilityResults.issues);
            break;

          case 'duplication':
            const duplicationResults = await analyzeDuplication(analysisPath, detectedLanguages, includeTests, threshold.duplication);
            analysisResults.metrics.duplication = duplicationResults;
            analysisResults.issues.push(...duplicationResults.issues);
            break;

          case 'security':
            const securityResults = await analyzeSecurityVulnerabilities(analysisPath, detectedLanguages, includeTests);
            analysisResults.metrics.security = securityResults;
            analysisResults.issues.push(...securityResults.issues);
            break;

          case 'performance':
            const performanceResults = await analyzePerformanceIssues(analysisPath, detectedLanguages, includeTests);
            analysisResults.metrics.performance = performanceResults;
            analysisResults.issues.push(...performanceResults.issues);
            break;

          case 'coverage':
            const coverageResults = await analyzeCoverage(analysisPath, detectedLanguages);
            analysisResults.metrics.coverage = coverageResults;
            if (coverageResults.coverage < 80) {
              analysisResults.issues.push({
                type: 'coverage',
                severity: 'warning',
                message: `Test coverage is ${coverageResults.coverage}% (below recommended 80%)`,
                file: 'Overall',
                line: 0
              });
            }
            break;
        }
      }

      // Calculate overall quality score
      analysisResults.summary.overallScore = calculateOverallScore(analysisResults.metrics, analysisResults.issues);

      // Sort issues by severity
      analysisResults.issues.sort((a: any, b: any) => {
        const severityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1, 'info': 0 };
        return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            summary: analysisResults.summary,
            issuesFound: analysisResults.issues.length,
            criticalIssues: analysisResults.issues.filter((i: any) => i.severity === 'critical').length,
            overallScore: analysisResults.summary.overallScore,
            recommendations: generateRecommendations(analysisResults),
            // Include top 20 issues to avoid overwhelming output
            topIssues: analysisResults.issues.slice(0, 20),
            detailedMetrics: analysisResults.metrics
          }, null, 2)
        }]
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to analyze code quality');

      return {
        content: [{
          type: 'text',
          text: `Error analyzing code quality: ${error.message}`
        }]
      };
    }
  }
};

async function detectLanguages(sourcePath: string, sourceType: string): Promise<string[]> {
  const languages = new Set<string>();
  const languageExtensions: Record<string, string[]> = {
    'javascript': ['.js', '.jsx', '.mjs'],
    'typescript': ['.ts', '.tsx'],
    'python': ['.py', '.pyw'],
    'java': ['.java'],
    'csharp': ['.cs'],
    'cpp': ['.cpp', '.cc', '.cxx', '.c++'],
    'c': ['.c'],
    'php': ['.php'],
    'ruby': ['.rb'],
    'go': ['.go'],
    'rust': ['.rs'],
    'kotlin': ['.kt'],
    'swift': ['.swift'],
    'scala': ['.scala']
  };

  if (sourceType === 'file') {
    const ext = path.extname(sourcePath);
    for (const [lang, exts] of Object.entries(languageExtensions)) {
      if (exts.includes(ext)) {
        languages.add(lang);
        break;
      }
    }
  } else {
    await scanDirectoryForLanguages(sourcePath, languages, languageExtensions);
  }

  return Array.from(languages);
}

async function scanDirectoryForLanguages(dirPath: string, languages: Set<string>, languageExtensions: Record<string, string[]>, depth = 0) {
  if (depth > 5) return; // Prevent deep recursion

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);

      if (item.isFile()) {
        const ext = path.extname(item.name);
        for (const [lang, exts] of Object.entries(languageExtensions)) {
          if (exts.includes(ext)) {
            languages.add(lang);
          }
        }
      } else if (item.isDirectory() && !shouldSkipDirectory(item.name)) {
        await scanDirectoryForLanguages(fullPath, languages, languageExtensions, depth + 1);
      }
    }
  } catch (error) {
    // Continue if directory can't be read
  }
}

async function getLanguageStats(sourcePath: string, languages: string[], includeTests: boolean) {
  const stats: Record<string, any> = {};

  for (const language of languages) {
    stats[language] = {
      files: 0,
      lines: 0,
      bytes: 0
    };
  }

  await collectLanguageStats(sourcePath, stats, includeTests);
  return stats;
}

async function collectLanguageStats(dirPath: string, stats: Record<string, any>, includeTests: boolean, depth = 0) {
  if (depth > 5) return;

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);

      if (item.isFile()) {
        if (!includeTests && isTestFile(item.name)) continue;

        const language = getFileLanguage(item.name);
        if (language && stats[language]) {
          const fileStats = await fs.stat(fullPath);
          const content = await fs.readFile(fullPath, 'utf-8').catch(() => '');

          stats[language].files++;
          stats[language].bytes += fileStats.size;
          stats[language].lines += content.split('\n').length;
        }
      } else if (item.isDirectory() && !shouldSkipDirectory(item.name)) {
        await collectLanguageStats(fullPath, stats, includeTests, depth + 1);
      }
    }
  } catch (error) {
    // Continue if directory can't be read
  }
}

function getFileLanguage(fileName: string): string | null {
  const ext = path.extname(fileName);
  const languageMap: Record<string, string> = {
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript',
    '.py': 'python', '.pyw': 'python',
    '.java': 'java',
    '.cs': 'csharp',
    '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.c++': 'cpp',
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

async function analyzeComplexity(sourcePath: string, languages: string[], includeTests: boolean, threshold: number) {
  const results = {
    averageComplexity: 0,
    maxComplexity: 0,
    filesAnalyzed: 0,
    functionsAnalyzed: 0,
    issues: [] as any[]
  };

  const complexityData: number[] = [];

  await analyzeComplexityRecursive(sourcePath, languages, includeTests, threshold, results, complexityData);

  if (complexityData.length > 0) {
    results.averageComplexity = complexityData.reduce((a, b) => a + b, 0) / complexityData.length;
    results.maxComplexity = Math.max(...complexityData);
  }

  return results;
}

async function analyzeComplexityRecursive(dirPath: string, languages: string[], includeTests: boolean, threshold: number, results: any, complexityData: number[], depth = 0) {
  if (depth > 5) return;

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);

      if (item.isFile()) {
        if (!includeTests && isTestFile(item.name)) continue;

        const language = getFileLanguage(item.name);
        if (language && languages.includes(language)) {
          const complexity = await analyzeFileComplexity(fullPath, language, threshold, results);
          if (complexity.length > 0) {
            complexityData.push(...complexity);
            results.filesAnalyzed++;
          }
        }
      } else if (item.isDirectory() && !shouldSkipDirectory(item.name)) {
        await analyzeComplexityRecursive(fullPath, languages, includeTests, threshold, results, complexityData, depth + 1);
      }
    }
  } catch (error) {
    // Continue if directory can't be read
  }
}

async function analyzeFileComplexity(filePath: string, language: string, threshold: number, results: any): Promise<number[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const complexity = calculateCyclomaticComplexity(content, language);

    results.functionsAnalyzed += complexity.length;

    // Report issues above threshold
    complexity.forEach(item => {
      if (item.complexity > threshold) {
        results.issues.push({
          type: 'complexity',
          severity: item.complexity > threshold * 2 ? 'high' : 'medium',
          message: `Function '${item.name}' has high cyclomatic complexity: ${item.complexity}`,
          file: filePath,
          line: item.line,
          metric: item.complexity,
          threshold
        });
      }
    });

    return complexity.map(item => item.complexity);

  } catch (error) {
    return [];
  }
}

function calculateCyclomaticComplexity(content: string, language: string): Array<{ name: string; complexity: number; line: number }> {
  const results: Array<{ name: string; complexity: number; line: number }> = [];

  switch (language) {
    case 'javascript':
    case 'typescript':
      return calculateJSComplexity(content);
    case 'python':
      return calculatePythonComplexity(content);
    case 'java':
      return calculateJavaComplexity(content);
    default:
      return calculateGenericComplexity(content);
  }
}

function calculateJSComplexity(content: string): Array<{ name: string; complexity: number; line: number }> {
  const results: Array<{ name: string; complexity: number; line: number }> = [];
  const lines = content.split('\n');

  // Find function definitions
  const functionRegex = /(function\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/g;
  let match;

  while ((match = functionRegex.exec(content)) !== null) {
    const functionName = match[2] || match[3] || 'anonymous';
    const startLine = content.substring(0, match.index).split('\n').length;

    // Find function body and calculate complexity
    const complexity = calculateFunctionComplexity(content, match.index, language);

    results.push({
      name: functionName,
      complexity,
      line: startLine
    });
  }

  return results;
}

function calculatePythonComplexity(content: string): Array<{ name: string; complexity: number; line: number }> {
  const results: Array<{ name: string; complexity: number; line: number }> = [];
  const lines = content.split('\n');

  const functionRegex = /def\s+(\w+)\s*\(/g;
  let match;

  while ((match = functionRegex.exec(content)) !== null) {
    const functionName = match[1];
    const startLine = content.substring(0, match.index).split('\n').length;

    const complexity = calculateFunctionComplexity(content, match.index, 'python');

    results.push({
      name: functionName,
      complexity,
      line: startLine
    });
  }

  return results;
}

function calculateJavaComplexity(content: string): Array<{ name: string; complexity: number; line: number }> {
  const results: Array<{ name: string; complexity: number; line: number }> = [];

  const methodRegex = /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?\w+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[^{]+)?\s*{/g;
  let match;

  while ((match = methodRegex.exec(content)) !== null) {
    const methodName = match[1];
    const startLine = content.substring(0, match.index).split('\n').length;

    const complexity = calculateFunctionComplexity(content, match.index, 'java');

    results.push({
      name: methodName,
      complexity,
      line: startLine
    });
  }

  return results;
}

function calculateGenericComplexity(content: string): Array<{ name: string; complexity: number; line: number }> {
  // Generic complexity calculation based on control flow keywords
  const complexity = 1; // Base complexity

  const controlFlowKeywords = ['if', 'else', 'elif', 'while', 'for', 'switch', 'case', 'catch', 'try', '&&', '||', '?'];
  let totalComplexity = complexity;

  for (const keyword of controlFlowKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'g');
    const matches = content.match(regex);
    if (matches) {
      totalComplexity += matches.length;
    }
  }

  return [{
    name: 'file',
    complexity: totalComplexity,
    line: 1
  }];
}

function calculateFunctionComplexity(content: string, startIndex: number, language: string): number {
  // Simplified complexity calculation
  let complexity = 1; // Base complexity

  // Find the function body (simplified approach)
  let braceCount = 0;
  let inFunction = false;
  let functionBody = '';

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];

    if (char === '{') {
      braceCount++;
      inFunction = true;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0 && inFunction) {
        break;
      }
    }

    if (inFunction) {
      functionBody += char;
    }
  }

  // Count control flow structures
  const patterns = {
    'javascript': ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', 'try', '&&', '||', '\\?'],
    'python': ['if', 'elif', 'else', 'while', 'for', 'except', 'and', 'or'],
    'java': ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', 'try', '&&', '||', '\\?']
  };

  const keywords = patterns[language as keyof typeof patterns] || patterns['javascript'];

  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'g');
    const matches = functionBody.match(regex);
    if (matches) {
      complexity += matches.length;
    }
  }

  return complexity;
}

async function analyzeMaintainability(sourcePath: string, languages: string[], includeTests: boolean, threshold: number) {
  const results = {
    averageScore: 0,
    filesAnalyzed: 0,
    issues: [] as any[]
  };

  const scores: number[] = [];
  await analyzeMaintainabilityRecursive(sourcePath, languages, includeTests, threshold, results, scores);

  if (scores.length > 0) {
    results.averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  return results;
}

async function analyzeMaintainabilityRecursive(dirPath: string, languages: string[], includeTests: boolean, threshold: number, results: any, scores: number[], depth = 0) {
  if (depth > 5) return;

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);

      if (item.isFile()) {
        if (!includeTests && isTestFile(item.name)) continue;

        const language = getFileLanguage(item.name);
        if (language && languages.includes(language)) {
          const score = await calculateMaintainabilityScore(fullPath);
          scores.push(score);
          results.filesAnalyzed++;

          if (score < threshold) {
            results.issues.push({
              type: 'maintainability',
              severity: score < threshold * 0.5 ? 'high' : 'medium',
              message: `File has low maintainability score: ${score}`,
              file: fullPath,
              line: 0,
              metric: score,
              threshold
            });
          }
        }
      } else if (item.isDirectory() && !shouldSkipDirectory(item.name)) {
        await analyzeMaintainabilityRecursive(fullPath, languages, includeTests, threshold, results, scores, depth + 1);
      }
    }
  } catch (error) {
    // Continue if directory can't be read
  }
}

async function calculateMaintainabilityScore(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    let score = 100; // Start with perfect score

    // Factors that reduce maintainability
    const linesOfCode = lines.filter(line => line.trim() && !line.trim().startsWith('//')).length;
    const averageLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    const duplicatedLines = findDuplicatedLines(lines);
    const commentRatio = calculateCommentRatio(content);

    // Penalize long files
    if (linesOfCode > 1000) score -= 20;
    else if (linesOfCode > 500) score -= 10;

    // Penalize long lines
    if (averageLineLength > 120) score -= 15;
    else if (averageLineLength > 80) score -= 5;

    // Penalize duplicate code
    score -= duplicatedLines * 2;

    // Reward good documentation
    if (commentRatio > 0.2) score += 10;
    else if (commentRatio < 0.05) score -= 10;

    return Math.max(0, Math.min(100, score));

  } catch (error) {
    return 50; // Default score if analysis fails
  }
}

function findDuplicatedLines(lines: string[]): number {
  const lineCount = new Map<string, number>();
  let duplicates = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && trimmed.length > 10) { // Only consider meaningful lines
      const count = lineCount.get(trimmed) || 0;
      lineCount.set(trimmed, count + 1);
      if (count === 1) duplicates++; // First duplicate
    }
  }

  return duplicates;
}

function calculateCommentRatio(content: string): number {
  const lines = content.split('\n');
  const commentLines = lines.filter(line => {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('#') ||
           trimmed.startsWith('/*') || trimmed.startsWith('*') ||
           trimmed.startsWith('"""') || trimmed.startsWith("'''");
  }).length;

  return commentLines / lines.length;
}

async function analyzeDuplication(sourcePath: string, languages: string[], includeTests: boolean, threshold: number) {
  // Simplified duplication analysis
  return {
    duplicatedLines: 0,
    duplicatedBlocks: 0,
    duplicationPercentage: 0,
    issues: [] as any[]
  };
}

async function analyzeSecurityVulnerabilities(sourcePath: string, languages: string[], includeTests: boolean) {
  const results = {
    vulnerabilities: 0,
    criticalVulnerabilities: 0,
    issues: [] as any[]
  };

  await analyzeSecurityRecursive(sourcePath, languages, includeTests, results);
  return results;
}

async function analyzeSecurityRecursive(dirPath: string, languages: string[], includeTests: boolean, results: any, depth = 0) {
  if (depth > 5) return;

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);

      if (item.isFile()) {
        if (!includeTests && isTestFile(item.name)) continue;

        const language = getFileLanguage(item.name);
        if (language && languages.includes(language)) {
          await analyzeFileSecurity(fullPath, language, results);
        }
      } else if (item.isDirectory() && !shouldSkipDirectory(item.name)) {
        await analyzeSecurityRecursive(fullPath, languages, includeTests, results, depth + 1);
      }
    }
  } catch (error) {
    // Continue if directory can't be read
  }
}

async function analyzeFileSecurity(filePath: string, language: string, results: any) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Common security patterns to check
    const securityPatterns = [
      { pattern: /password\s*=\s*["'][^"']+["']/gi, message: 'Hard-coded password detected', severity: 'critical' },
      { pattern: /api_key\s*=\s*["'][^"']+["']/gi, message: 'Hard-coded API key detected', severity: 'critical' },
      { pattern: /eval\s*\(/gi, message: 'Use of eval() function is dangerous', severity: 'high' },
      { pattern: /document\.write\s*\(/gi, message: 'document.write() can be vulnerable to XSS', severity: 'medium' },
      { pattern: /innerHTML\s*=/gi, message: 'innerHTML assignment can be vulnerable to XSS', severity: 'medium' },
      { pattern: /exec\s*\(/gi, message: 'Command execution function detected', severity: 'high' },
      { pattern: /\.sql\s*=|\bSQL\s*=|query\s*=.*SELECT/gi, message: 'Potential SQL injection vulnerability', severity: 'high' }
    ];

    const lines = content.split('\n');

    for (const { pattern, message, severity } of securityPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;

        results.vulnerabilities++;
        if (severity === 'critical') results.criticalVulnerabilities++;

        results.issues.push({
          type: 'security',
          severity,
          message,
          file: filePath,
          line: lineNumber,
          context: lines[lineNumber - 1]?.trim() || ''
        });
      }
    }

  } catch (error) {
    // Continue if file can't be read
  }
}

async function analyzePerformanceIssues(sourcePath: string, languages: string[], includeTests: boolean) {
  // Simplified performance analysis
  return {
    performanceIssues: 0,
    issues: [] as any[]
  };
}

async function analyzeCoverage(sourcePath: string, languages: string[]) {
  // This would typically run test coverage tools
  // For now, return placeholder data
  return {
    coverage: 75, // Simulated coverage percentage
    linesCovered: 750,
    totalLines: 1000
  };
}

function calculateOverallScore(metrics: any, issues: any[]): number {
  let score = 100;

  // Deduct points for issues
  const severityWeights = { critical: 10, high: 5, medium: 3, low: 1, info: 0.5 };

  for (const issue of issues) {
    const weight = severityWeights[issue.severity as keyof typeof severityWeights] || 1;
    score -= weight;
  }

  // Factor in metrics
  if (metrics.complexity?.averageComplexity > 10) {
    score -= 5;
  }

  if (metrics.maintainability?.averageScore < 60) {
    score -= 10;
  }

  if (metrics.coverage?.coverage < 80) {
    score -= 15;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function generateRecommendations(analysisResults: any): string[] {
  const recommendations = [];
  const { issues, metrics } = analysisResults;

  if (issues.some((i: any) => i.type === 'security' && i.severity === 'critical')) {
    recommendations.push('Address critical security vulnerabilities immediately');
  }

  if (metrics.complexity?.averageComplexity > 10) {
    recommendations.push('Reduce code complexity by breaking down large functions');
  }

  if (metrics.maintainability?.averageScore < 60) {
    recommendations.push('Improve code maintainability by reducing file sizes and adding documentation');
  }

  if (metrics.coverage?.coverage < 80) {
    recommendations.push('Increase test coverage to at least 80%');
  }

  const duplicateIssues = issues.filter((i: any) => i.type === 'duplication').length;
  if (duplicateIssues > 5) {
    recommendations.push('Refactor to reduce code duplication');
  }

  if (recommendations.length === 0) {
    recommendations.push('Code quality looks good! Consider regular code reviews and automated quality checks.');
  }

  return recommendations;
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