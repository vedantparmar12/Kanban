import { createLogger } from './logger.js';

const logger = createLogger('Chunking');

export interface ChunkConfig {
  maxTokens: number;
  overlapLines: number;
  preserveContext: boolean;
}

export interface DiffChunk {
  content: string;
  startLine: number;
  endLine: number;
  contextBefore: string;
  contextAfter: string;
  chunkIndex: number;
  totalChunks: number;
  estimatedTokens: number;
}

export interface PaginationToken {
  sessionId: string;
  fileIndex: number;
  chunkIndex: number;
  totalFiles: number;
  totalChunks: number;
  context: any;
  expiresAt: number;
}

export class ChunkingService {
  private readonly config: ChunkConfig;
  private readonly sessions = new Map<string, PaginationToken>();

  constructor(config: Partial<ChunkConfig> = {}) {
    this.config = {
      maxTokens: config.maxTokens || 4000,
      overlapLines: config.overlapLines || 3,
      preserveContext: config.preserveContext !== false
    };

    logger.info({ config: this.config }, 'Chunking service initialized');
  }

  /**
   * Chunk a file diff into manageable pieces
   */
  chunkFileDiff(diff: string, filename: string): DiffChunk[] {
    if (!diff || diff.trim().length === 0) {
      return [];
    }

    const lines = diff.split('\n');
    const chunks: DiffChunk[] = [];
    
    let currentChunk: string[] = [];
    let currentStartLine = 0;
    let currentTokens = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = this.estimateTokens(line);

      // Check if adding this line would exceed the token limit
      if (currentTokens + lineTokens > this.config.maxTokens && currentChunk.length > 0) {
        // Create chunk from current content
        const chunk = this.createChunk(
          currentChunk,
          currentStartLine,
          i - 1,
          chunks.length,
          filename
        );
        chunks.push(chunk);

        // Start new chunk with overlap
        if (this.config.preserveContext && this.config.overlapLines > 0) {
          const overlapStart = Math.max(0, currentChunk.length - this.config.overlapLines);
          currentChunk = currentChunk.slice(overlapStart);
          currentStartLine = Math.max(0, currentStartLine + overlapStart);
          currentTokens = currentChunk.reduce((sum, l) => sum + this.estimateTokens(l), 0);
        } else {
          currentChunk = [];
          currentStartLine = i;
          currentTokens = 0;
        }
      }

      // Add current line to chunk
      currentChunk.push(line);
      currentTokens += lineTokens;
    }

    // Add final chunk if there's content
    if (currentChunk.length > 0) {
      const chunk = this.createChunk(
        currentChunk,
        currentStartLine,
        lines.length - 1,
        chunks.length,
        filename
      );
      chunks.push(chunk);
    }

    // Update total chunks count
    chunks.forEach(chunk => {
      chunk.totalChunks = chunks.length;
    });

    logger.debug({ 
      filename, 
      originalLines: lines.length, 
      chunks: chunks.length 
    }, 'File chunked successfully');

    return chunks;
  }

  /**
   * Create a pagination token for tracking progress across chunks
   */
  createPaginationToken(
    fileIndex: number,
    chunkIndex: number,
    totalFiles: number,
    totalChunks: number,
    context: any = {}
  ): string {
    const sessionId = this.generateSessionId();
    const expiresAt = Date.now() + (30 * 60 * 1000); // 30 minutes

    const token: PaginationToken = {
      sessionId,
      fileIndex,
      chunkIndex,
      totalFiles,
      totalChunks,
      context,
      expiresAt
    };

    this.sessions.set(sessionId, token);
    this.cleanupExpiredSessions();

    // Return base64 encoded session ID for security
    return Buffer.from(sessionId).toString('base64');
  }

  /**
   * Decode and validate a pagination token
   */
  decodePaginationToken(tokenStr: string): PaginationToken | null {
    try {
      const sessionId = Buffer.from(tokenStr, 'base64').toString('utf-8');
      const token = this.sessions.get(sessionId);

      if (!token) {
        logger.warn({ tokenStr }, 'Pagination token not found');
        return null;
      }

      if (Date.now() > token.expiresAt) {
        logger.warn({ sessionId }, 'Pagination token expired');
        this.sessions.delete(sessionId);
        return null;
      }

      return token;
    } catch (error) {
      logger.error({ error, tokenStr }, 'Failed to decode pagination token');
      return null;
    }
  }

  /**
   * Update pagination token context
   */
  updatePaginationToken(tokenStr: string, updates: Partial<PaginationToken>): boolean {
    const token = this.decodePaginationToken(tokenStr);
    if (!token) return false;

    const updatedToken = { ...token, ...updates };
    this.sessions.set(token.sessionId, updatedToken);
    return true;
  }

  /**
   * Split large text into manageable chunks preserving structure
   */
  chunkText(text: string, preserveStructure: boolean = true): string[] {
    if (this.estimateTokens(text) <= this.config.maxTokens) {
      return [text];
    }

    const chunks: string[] = [];
    
    if (preserveStructure) {
      // Try to split by paragraphs first
      const paragraphs = text.split('\n\n');
      let currentChunk = '';
      
      for (const paragraph of paragraphs) {
        const chunkWithParagraph = currentChunk + (currentChunk ? '\n\n' : '') + paragraph;
        
        if (this.estimateTokens(chunkWithParagraph) > this.config.maxTokens) {
          if (currentChunk) {
            chunks.push(currentChunk);
            currentChunk = paragraph;
          } else {
            // Paragraph is too large, split by sentences
            const sentences = this.splitBySentences(paragraph);
            chunks.push(...this.chunkSentences(sentences));
          }
        } else {
          currentChunk = chunkWithParagraph;
        }
      }
      
      if (currentChunk) {
        chunks.push(currentChunk);
      }
    } else {
      // Simple character-based chunking
      const targetLength = Math.floor(this.config.maxTokens * 3.5); // Rough char to token ratio
      for (let i = 0; i < text.length; i += targetLength) {
        chunks.push(text.slice(i, i + targetLength));
      }
    }

    logger.debug({ 
      originalLength: text.length, 
      chunks: chunks.length,
      preserveStructure 
    }, 'Text chunked');

    return chunks;
  }

  private createChunk(
    lines: string[],
    startLine: number,
    endLine: number,
    chunkIndex: number,
    filename: string
  ): DiffChunk {
    const content = lines.join('\n');
    const estimatedTokens = this.estimateTokens(content);

    return {
      content,
      startLine,
      endLine,
      contextBefore: '',
      contextAfter: '',
      chunkIndex,
      totalChunks: 0, // Will be updated later
      estimatedTokens
    };
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 3.5 characters for code
    // Adjust for special characters and code syntax
    const baseTokens = text.length / 3.5;
    const specialChars = (text.match(/[{}()\[\];,.@#$%^&*]/g) || []).length;
    const keywords = (text.match(/\b(function|class|import|export|const|let|var|if|else|for|while)\b/g) || []).length;
    
    return Math.ceil(baseTokens + specialChars * 0.1 + keywords * 0.2);
  }

  private splitBySentences(text: string): string[] {
    return text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  }

  private chunkSentences(sentences: string[]): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const chunkWithSentence = currentChunk + (currentChunk ? '. ' : '') + sentence.trim();
      
      if (this.estimateTokens(chunkWithSentence) > this.config.maxTokens) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = sentence.trim();
        } else {
          // Single sentence is too large, split by words
          chunks.push(sentence.trim());
        }
      } else {
        currentChunk = chunkWithSentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, token] of this.sessions.entries()) {
      if (now > token.expiresAt) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug({ cleanedCount }, 'Cleaned up expired pagination sessions');
    }
  }

  /**
   * Get statistics about current chunking sessions
   */
  getSessionStats() {
    const activeSessions = this.sessions.size;
    const now = Date.now();
    const expiredSessions = Array.from(this.sessions.values())
      .filter(token => now > token.expiresAt).length;

    return {
      activeSessions,
      expiredSessions,
      config: this.config
    };
  }
}