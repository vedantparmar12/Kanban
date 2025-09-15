import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GitHubClient } from '../../clients/github-client.js';
import { ChunkingService } from '../../utils/chunking.js';
import { createLogger } from '../../utils/logger.js';
import { createMCPErrorResponse } from '../../utils/error-handler.js';
import type { FileDiff } from '../../types/github.js';

const logger = createLogger('ReadFileChunkedTool');

export class ReadFileChunkedTool implements Tool {
  name = 'read_file_chunked';
  description = 'Read a file diff from a PR with intelligent chunking for large files';

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
      pullNumber: {
        type: 'number',
        description: 'Pull request number'
      },
      filename: {
        type: 'string',
        description: 'Path to the file to read'
      },
      chunkIndex: {
        type: 'number',
        description: 'Specific chunk to read (0-based index)',
        default: 0
      },
      maxTokens: {
        type: 'number',
        description: 'Maximum tokens per chunk',
        default: 4000
      },
      contextToken: {
        type: 'string',
        description: 'Pagination context token from previous call'
      }
    },
    required: ['owner', 'repo', 'pullNumber', 'filename']
  };

  private chunkingService: ChunkingService;

  constructor(private githubClient: GitHubClient) {
    this.chunkingService = new ChunkingService();
  }

  async execute(args: any) {
    try {
      const { 
        owner, 
        repo, 
        pullNumber, 
        filename, 
        chunkIndex = 0, 
        maxTokens = 4000,
        contextToken 
      } = args;

      logger.info({ 
        owner, 
        repo, 
        pullNumber, 
        filename, 
        chunkIndex 
      }, 'Reading chunked file diff');

      // Check if we have a context token for pagination
      let paginationContext = null;
      if (contextToken) {
        paginationContext = this.chunkingService.decodePaginationToken(contextToken);
        if (!paginationContext) {
          return {
            content: [{
              type: 'text',
              text: 'Invalid or expired pagination token. Please start over with a new request.'
            }]
          };
        }
      }

      // Get file diff from GitHub
      const fileDiff = await this.githubClient.getFileDiff(owner, repo, pullNumber, filename);

      if (!fileDiff) {
        return {
          content: [{
            type: 'text',
            text: `File "${filename}" not found in PR #${pullNumber}`
          }]
        };
      }

      // Configure chunking service
      this.chunkingService = new ChunkingService({
        maxTokens,
        overlapLines: 3,
        preserveContext: true
      });

      // Chunk the file diff if needed
      const chunks = fileDiff.patch ? 
        this.chunkingService.chunkFileDiff(fileDiff.patch, filename) : 
        [];

      if (chunks.length === 0) {
        // No patch available or file is empty
        return {
          content: [{
            type: 'text',
            text: this.formatNoPatchResponse(fileDiff)
          }]
        };
      }

      // Validate chunk index
      if (chunkIndex >= chunks.length) {
        return {
          content: [{
            type: 'text',
            text: `Chunk index ${chunkIndex} is out of range. File has ${chunks.length} chunks.`
          }]
        };
      }

      const currentChunk = chunks[chunkIndex];

      // Create pagination token for navigation
      const newContextToken = this.chunkingService.createPaginationToken(
        0, // fileIndex (single file in this case)
        chunkIndex,
        1, // totalFiles
        chunks.length,
        {
          owner,
          repo,
          pullNumber,
          filename,
          fileDiff: {
            status: fileDiff.status,
            additions: fileDiff.additions,
            deletions: fileDiff.deletions
          }
        }
      );

      return {
        content: [{
          type: 'text',
          text: this.formatChunkedResponse(fileDiff, currentChunk, newContextToken)
        }],
        _meta: {
          pagination: {
            currentChunk: chunkIndex,
            totalChunks: chunks.length,
            hasNext: chunkIndex < chunks.length - 1,
            hasPrevious: chunkIndex > 0,
            contextToken: newContextToken,
            estimatedTokens: currentChunk.estimatedTokens
          },
          file: {
            name: filename,
            status: fileDiff.status,
            additions: fileDiff.additions,
            deletions: fileDiff.deletions
          }
        }
      };
    } catch (error: any) {
      logger.error({ error, args }, 'Failed to read chunked file');
      return createMCPErrorResponse(error);
    }
  }

  private formatNoPatchResponse(file: FileDiff): string {
    return `
# File: ${file.filename}

**Status:** ${this.getStatusText(file.status)}
**Changes:** +${file.additions}/-${file.deletions}

## No Diff Available
This file doesn't have a diff patch available. This typically happens with:
- Binary files (images, executables, etc.)
- Very large files that exceed GitHub's diff display limits
- Files with no changes (moved/renamed only)

## File Information
- **Additions:** +${file.additions}
- **Deletions:** -${file.deletions}
- **Total Changes:** ${file.changes}

## File URLs
- [View File](${file.blob_url})
- [Raw Content](${file.raw_url})
    `.trim();
  }

  private formatChunkedResponse(file: FileDiff, chunk: any, contextToken: string): string {
    const statusText = this.getStatusText(file.status);
    const isLastChunk = chunk.chunkIndex === chunk.totalChunks - 1;
    const isFirstChunk = chunk.chunkIndex === 0;

    return `
# File Diff: ${file.filename} (Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks})

**Status:** ${statusText}
**Total Changes:** +${file.additions}/-${file.deletions}
**Chunk Range:** Lines ${chunk.startLine + 1}-${chunk.endLine + 1}
**Estimated Tokens:** ${chunk.estimatedTokens}

## Navigation
${!isFirstChunk ? '⬅️ **Previous Chunk:** Use `contextToken` with `chunkIndex: ' + (chunk.chunkIndex - 1) + '`' : ''}
${!isLastChunk ? '➡️ **Next Chunk:** Use `contextToken` with `chunkIndex: ' + (chunk.chunkIndex + 1) + '`' : ''}

## Diff Content
\`\`\`diff
${chunk.content}
\`\`\`

## Pagination Info
- **Context Token:** \`${contextToken}\`
- **Current Chunk:** ${chunk.chunkIndex + 1} of ${chunk.totalChunks}
- **Chunk Size:** ${chunk.estimatedTokens} estimated tokens

${!isLastChunk ? '\n💡 **Tip:** To continue reading, call this tool again with `contextToken` and `chunkIndex: ' + (chunk.chunkIndex + 1) + '`' : '\n✅ **End of file reached**'}

## File URLs
- [View File](${file.blob_url})
- [Raw Content](${file.raw_url})
    `.trim();
  }

  private getStatusText(status: FileDiff['status']): string {
    switch (status) {
      case 'added': return 'Added';
      case 'removed': return 'Removed';
      case 'modified': return 'Modified';
      case 'renamed': return 'Renamed';
      default: return 'Unknown';
    }
  }
}