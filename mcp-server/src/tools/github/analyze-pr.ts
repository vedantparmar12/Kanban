import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GitHubClient } from '../../clients/github-client.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';

const logger = createLogger('AnalyzePRTool');

export class AnalyzePRTool implements Tool {
  name = 'analyze_pr';
  description = 'Analyze a GitHub pull request for code quality, complexity, and potential issues';

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
      analyzeFiles: {
        type: 'boolean',
        description: 'Whether to analyze individual files (default: true)',
        default: true
      },
      maxFiles: {
        type: 'number',
        description: 'Maximum number of files to analyze in detail (default: 20)',
        default: 20
      }
    },
    required: ['owner', 'repo', 'pullNumber']
  };

  constructor(private githubClient: GitHubClient) {}

  async execute(args: any) {
    try {
      const { owner, repo, pullNumber, analyzeFiles = true, maxFiles = 20 } = args;

      logger.info({ owner, repo, pullNumber }, 'Analyzing pull request');

      // Get PR details
      const pr = await this.githubClient.getPullRequest(owner, repo, pullNumber);

      // Get file changes
      let files: any[] = [];
      if (analyzeFiles && pr.changed_files > 0) {
        const fileResult = await this.githubClient.listPullRequestFiles(owner, repo, pullNumber, 1, maxFiles);
        files = fileResult.files;
      }

      // Perform analysis
      const analysis = this.analyzePullRequest(pr, files);

      return {
        content: [
          {
            type: 'text',
            text: this.formatAnalysis(pr, analysis)
          }
        ],
        _meta: {
          analysis,
          pr: {
            id: pr.id,
            number: pr.number,
            url: `https://github.com/${owner}/${repo}/pull/${pr.number}`
          }
        }
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to analyze PR');
      return createMCPErrorResponse(error);
    }
  }

  private analyzePullRequest(pr: any, files: any[]) {
    const analysis = {
      overall: this.analyzeOverall(pr),
      size: this.analyzeSize(pr),
      complexity: this.analyzeComplexity(pr, files),
      risk: this.analyzeRisk(pr, files),
      quality: this.analyzeQuality(pr, files),
      recommendations: [] as string[]
    };

    // Generate recommendations based on analysis
    analysis.recommendations = this.generateRecommendations(analysis, pr, files);

    return analysis;
  }

  private analyzeOverall(pr: any) {
    return {
      state: pr.state,
      mergeable: pr.mergeable,
      merged: pr.merged,
      draft: pr.draft,
      age_days: Math.floor((Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      review_coverage: this.calculateReviewCoverage(pr)
    };
  }

  private analyzeSize(pr: any) {
    const totalLines = pr.additions + pr.deletions;
    let sizeCategory = 'small';
    
    if (totalLines > 500) sizeCategory = 'large';
    else if (totalLines > 100) sizeCategory = 'medium';

    return {
      files_changed: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
      total_changes: totalLines,
      category: sizeCategory,
      commits: pr.commits
    };
  }

  private analyzeComplexity(pr: any, files: any[]) {
    let complexityScore = 0;
    const factors = [];

    // File count complexity
    if (pr.changed_files > 20) {
      complexityScore += 3;
      factors.push('High file count');
    } else if (pr.changed_files > 10) {
      complexityScore += 2;
      factors.push('Medium file count');
    }

    // Changes complexity
    const totalChanges = pr.additions + pr.deletions;
    if (totalChanges > 1000) {
      complexityScore += 3;
      factors.push('Large change size');
    } else if (totalChanges > 300) {
      complexityScore += 2;
      factors.push('Medium change size');
    }

    // File type complexity
    const fileExtensions = files.map(f => f.filename.split('.').pop()).filter(Boolean);
    const uniqueExtensions = new Set(fileExtensions);
    if (uniqueExtensions.size > 5) {
      complexityScore += 2;
      factors.push('Multiple file types');
    }

    let level = 'low';
    if (complexityScore >= 6) level = 'high';
    else if (complexityScore >= 3) level = 'medium';

    return {
      score: complexityScore,
      level,
      factors
    };
  }

  private analyzeRisk(pr: any, files: any[]) {
    const risks = [];
    let riskScore = 0;

    // Large PR risk
    if (pr.changed_files > 50 || (pr.additions + pr.deletions) > 2000) {
      risks.push('Large PR - difficult to review thoroughly');
      riskScore += 3;
    }

    // Age risk
    const ageDays = Math.floor((Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays > 7) {
      risks.push('Old PR - may have merge conflicts');
      riskScore += 2;
    }

    // Mergeable risk
    if (pr.mergeable === false) {
      risks.push('Has merge conflicts');
      riskScore += 3;
    }

    // Critical file risk
    const criticalFiles = files.filter(f => 
      f.filename.includes('config') || 
      f.filename.includes('security') ||
      f.filename.includes('auth') ||
      f.filename.endsWith('.sql') ||
      f.filename.includes('migration')
    );
    
    if (criticalFiles.length > 0) {
      risks.push(`Changes to ${criticalFiles.length} critical files`);
      riskScore += 2;
    }

    let level = 'low';
    if (riskScore >= 6) level = 'high';
    else if (riskScore >= 3) level = 'medium';

    return {
      score: riskScore,
      level,
      risks
    };
  }

  private analyzeQuality(pr: any, files: any[]) {
    const qualityFactors = [];
    let qualityScore = 5; // Start with baseline

    // Description quality
    if (!pr.body || pr.body.length < 50) {
      qualityFactors.push('Lacks detailed description');
      qualityScore -= 1;
    } else if (pr.body.length > 200) {
      qualityFactors.push('Well documented');
      qualityScore += 1;
    }

    // Title quality
    if (pr.title.length < 10) {
      qualityFactors.push('Title too short');
      qualityScore -= 1;
    }

    // Review activity
    if (pr.review_comments > 5) {
      qualityFactors.push('Active review discussion');
      qualityScore += 1;
    }

    // Binary files
    const binaryFiles = files.filter(f => !f.patch);
    if (binaryFiles.length > 0) {
      qualityFactors.push(`${binaryFiles.length} binary files (harder to review)`);
      qualityScore -= 1;
    }

    let level = 'good';
    if (qualityScore >= 7) level = 'excellent';
    else if (qualityScore <= 3) level = 'poor';

    return {
      score: qualityScore,
      level,
      factors: qualityFactors
    };
  }

  private calculateReviewCoverage(pr: any): number {
    // Simple heuristic: review comments per 100 lines changed
    const totalChanges = pr.additions + pr.deletions;
    if (totalChanges === 0) return 100;
    
    return Math.min(100, Math.round((pr.review_comments / totalChanges) * 100 * 10));
  }

  private generateRecommendations(analysis: any, pr: any, files: any[]): string[] {
    const recommendations = [];

    if (analysis.size.category === 'large') {
      recommendations.push('Consider breaking this PR into smaller, focused changes');
    }

    if (analysis.complexity.level === 'high') {
      recommendations.push('High complexity PR - request thorough review from senior developers');
    }

    if (analysis.risk.level === 'high') {
      recommendations.push('High risk PR - ensure comprehensive testing and staging deployment');
    }

    if (analysis.quality.score <= 3) {
      recommendations.push('Consider improving PR description and documentation');
    }

    if (!pr.mergeable) {
      recommendations.push('Resolve merge conflicts before review');
    }

    if (analysis.overall.age_days > 7) {
      recommendations.push('Update branch with latest changes from base branch');
    }

    if (pr.review_comments === 0 && analysis.size.category !== 'small') {
      recommendations.push('This PR needs review attention');
    }

    return recommendations;
  }

  private formatAnalysis(pr: any, analysis: any): string {
    const overallStatus = analysis.risk.level === 'high' ? '🚨' : 
                          analysis.risk.level === 'medium' ? '⚠️' : '✅';

    return `
# PR Analysis Report ${overallStatus}

**PR #${pr.number}: ${pr.title}**

## Overall Assessment
- **Status:** ${pr.state.toUpperCase()}${pr.merged ? ' (MERGED)' : ''}
- **Age:** ${analysis.overall.age_days} days
- **Mergeable:** ${pr.mergeable ? 'Yes' : 'No'}
- **Review Coverage:** ${analysis.overall.review_coverage}%

## Size Analysis
- **Category:** ${analysis.size.category.toUpperCase()}
- **Files Changed:** ${analysis.size.files_changed}
- **Lines Added:** +${analysis.size.additions}
- **Lines Deleted:** -${analysis.size.deletions}
- **Commits:** ${analysis.size.commits}

## Complexity Analysis
- **Level:** ${analysis.complexity.level.toUpperCase()}
- **Score:** ${analysis.complexity.score}/10
${analysis.complexity.factors.length > 0 ? `- **Factors:** ${analysis.complexity.factors.join(', ')}` : ''}

## Risk Analysis
- **Level:** ${analysis.risk.level.toUpperCase()}
- **Score:** ${analysis.risk.score}/10
${analysis.risk.risks.length > 0 ? analysis.risk.risks.map(r => `- ⚠️ ${r}`).join('\n') : '- ✅ No major risks identified'}

## Quality Analysis
- **Level:** ${analysis.quality.level.toUpperCase()}
- **Score:** ${analysis.quality.score}/10
${analysis.quality.factors.length > 0 ? analysis.quality.factors.map(f => `- ${f}`).join('\n') : ''}

## Recommendations
${analysis.recommendations.length > 0 ? 
  analysis.recommendations.map(r => `- 💡 ${r}`).join('\n') : 
  '- ✅ No specific recommendations - looks good!'}

---
*Analysis based on PR metadata, file changes, and established best practices.*
    `.trim();
  }
}