import { Octokit } from '@octokit/rest';
import { prisma } from '../../database/connection';
import { AppError } from '../../api/middlewares/error.middleware';
import { mcpConfig } from '../../config/mcp.config';
import { logger } from '../../utils/logger';
import { queueService, QueueName } from '../../utils/queue';
import { llmService } from '../ai/llm.service';
import { PRStatus } from '@prisma/client';

export class PRAgentService {
  private octokit: Octokit;

  constructor() {
    this.octokit = new Octokit({
      auth: mcpConfig.github.token
    });
  }

  async createPR(userId: string, data: {
    title: string;
    description?: string;
    branch: string;
    baseBranch?: string;
    taskId?: string;
    repositoryUrl: string;
  }) {
    const { owner, repo } = this.parseRepoUrl(data.repositoryUrl);
    
    let enhancedDescription = data.description;
    if (data.taskId) {
      const task = await prisma.task.findUnique({
        where: { id: data.taskId },
        include: {
          column: { include: { board: true } },
          assignee: true,
          labels: { include: { label: true } }
        }
      });

      if (task) {
        enhancedDescription = await this.generatePRDescription({
          originalDescription: data.description,
          task,
          branch: data.branch
        });
      }
    }

    try {
      const githubPR = await this.octokit.pulls.create({
        owner,
        repo,
        title: data.title,
        body: enhancedDescription,
        head: data.branch,
        base: data.baseBranch || 'main'
      });

      const pr = await prisma.pullRequest.create({
        data: {
          title: data.title,
          description: enhancedDescription,
          branch: data.branch,
          baseBranch: data.baseBranch || 'main',
          prNumber: githubPR.data.number,
          externalId: String(githubPR.data.id),
          status: PRStatus.OPEN,
          taskId: data.taskId,
          authorId: userId,
          repositoryUrl: data.repositoryUrl,
          diffUrl: githubPR.data.diff_url
        },
        include: {
          author: {
            select: { id: true, username: true, avatar: true }
          },
          task: true
        }
      });

      await queueService.addJob(QueueName.DOC_GENERATION, {
        prId: pr.id,
        repositoryUrl: data.repositoryUrl,
        branch: data.branch
      });

      logger.info(`PR created: ${pr.id} by user: ${userId}`);
      return pr;
    } catch (error: any) {
      logger.error('Failed to create PR:', error);
      throw new AppError(500, 'Failed to create pull request');
    }
  }

  async getPR(prId: string, userId: string) {
    const pr = await prisma.pullRequest.findUnique({
      where: { id: prId },
      include: {
        author: {
          select: { id: true, username: true, avatar: true }
        },
        task: {
          include: {
            column: { include: { board: true } }
          }
        },
        reviews: {
          include: {
            reviewer: {
              select: { id: true, username: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!pr) {
      throw new AppError(404, 'Pull request not found');
    }

    if (pr.task) {
      const hasAccess = await this.checkBoardAccess(
        pr.task.column.boardId,
        userId
      );
      if (!hasAccess) {
        throw new AppError(403, 'Access denied');
      }
    }

    return pr;
  }

  async updatePR(prId: string, userId: string, data: any) {
    const pr = await prisma.pullRequest.findUnique({
      where: { id: prId }
    });

    if (!pr) {
      throw new AppError(404, 'Pull request not found');
    }

    if (pr.authorId !== userId) {
      throw new AppError(403, 'Only PR author can update');
    }

    const updatedPR = await prisma.pullRequest.update({
      where: { id: prId },
      data,
      include: {
        author: {
          select: { id: true, username: true, avatar: true }
        },
        task: true
      }
    });

    if (pr.prNumber && pr.repositoryUrl) {
      const { owner, repo } = this.parseRepoUrl(pr.repositoryUrl);
      
      try {
        await this.octokit.pulls.update({
          owner,
          repo,
          pull_number: pr.prNumber,
          title: data.title,
          body: data.description,
          state: this.mapPRStatus(data.status)
        });
      } catch (error) {
        logger.error('Failed to update GitHub PR:', error);
      }
    }

    logger.info(`PR updated: ${prId} by user: ${userId}`);
    return updatedPR;
  }

  async addReview(prId: string, userId: string, data: {
    status: string;
    comment?: string;
  }) {
    const pr = await prisma.pullRequest.findUnique({
      where: { id: prId }
    });

    if (!pr) {
      throw new AppError(404, 'Pull request not found');
    }

    const review = await prisma.review.create({
      data: {
        pullRequestId: prId,
        reviewerId: userId,
        status: data.status,
        comment: data.comment
      },
      include: {
        reviewer: {
          select: { id: true, username: true, avatar: true }
        }
      }
    });

    if (pr.prNumber && pr.repositoryUrl) {
      const { owner, repo } = this.parseRepoUrl(pr.repositoryUrl);
      
      try {
        await this.octokit.pulls.createReview({
          owner,
          repo,
          pull_number: pr.prNumber,
          body: data.comment,
          event: this.mapReviewStatus(data.status)
        });
      } catch (error) {
        logger.error('Failed to create GitHub review:', error);
      }
    }

    logger.info(`Review added to PR: ${prId} by user: ${userId}`);
    return review;
  }

  async updateDocumentation(prId: string, userId: string) {
    const pr = await prisma.pullRequest.findUnique({
      where: { id: prId }
    });

    if (!pr) {
      throw new AppError(404, 'Pull request not found');
    }

    await queueService.addJob(QueueName.DOC_GENERATION, {
      prId,
      repositoryUrl: pr.repositoryUrl,
      branch: pr.branch,
      userId
    });

    return { message: 'Documentation update queued' };
  }

  private async generatePRDescription(context: any): Promise<string> {
    const prompt = `Generate a comprehensive pull request description based on the following context:
    
Task Title: ${context.task.title}
Task Description: ${context.task.description || 'N/A'}
Board: ${context.task.column.board.name}
Column: ${context.task.column.name}
Branch: ${context.branch}
Labels: ${context.task.labels.map((l: any) => l.label.name).join(', ')}

Please include:
1. Summary of changes
2. Related task/issue
3. Type of change
4. Testing performed
5. Checklist items`;

    const description = await llmService.generate(prompt);
    return description;
  }

  private parseRepoUrl(url: string): { owner: string; repo: string } {
    const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (!match) {
      throw new AppError(400, 'Invalid repository URL');
    }
    return { owner: match[1], repo: match[2] };
  }

  private mapPRStatus(status?: PRStatus): 'open' | 'closed' {
    if (!status) return 'open';
    return status === PRStatus.MERGED || status === PRStatus.CLOSED ? 'closed' : 'open';
  }

  private mapReviewStatus(status: string): 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' {
    switch (status) {
      case 'approved':
        return 'APPROVE';
      case 'changes_requested':
        return 'REQUEST_CHANGES';
      default:
        return 'COMMENT';
    }
  }

  private async checkBoardAccess(boardId: string, userId: string): Promise<boolean> {
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      }
    });
    return !!board;
  }
}

export const prAgentService = new PRAgentService();