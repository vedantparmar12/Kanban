import { v4 as uuidv4 } from 'uuid';

export enum NodeLabel {
  User = 'User',
  Board = 'Board',
  Column = 'Column',
  Task = 'Task',
  Label = 'Label',
  Comment = 'Comment',
  PullRequest = 'PullRequest',
  Codebase = 'Codebase',
  File = 'File',
  CodeElement = 'CodeElement',
  Documentation = 'Documentation',
  Activity = 'Activity',
  Organization = 'Organization',
  Review = 'Review',
  Embedding = 'Embedding'
}

export enum RelationshipType {
  // User relationships
  OWNS = 'OWNS',
  MEMBER_OF = 'MEMBER_OF',
  ASSIGNED_TO = 'ASSIGNED_TO',
  CREATED = 'CREATED',
  COMMENTED_ON = 'COMMENTED_ON',
  REVIEWED = 'REVIEWED',
  WATCHES = 'WATCHES',
  
  // Board relationships
  HAS_COLUMN = 'HAS_COLUMN',
  HAS_LABEL = 'HAS_LABEL',
  BELONGS_TO_ORG = 'BELONGS_TO_ORG',
  
  // Task relationships
  IN_COLUMN = 'IN_COLUMN',
  HAS_LABEL = 'HAS_LABEL',
  SUBTASK_OF = 'SUBTASK_OF',
  BLOCKS = 'BLOCKS',
  RELATED_TO = 'RELATED_TO',
  HAS_COMMENT = 'HAS_COMMENT',
  HAS_ATTACHMENT = 'HAS_ATTACHMENT',
  LINKED_TO_PR = 'LINKED_TO_PR',
  
  // Code relationships
  MODIFIES_FILE = 'MODIFIES_FILE',
  CONTAINS_FILE = 'CONTAINS_FILE',
  IMPORTS = 'IMPORTS',
  EXPORTS = 'EXPORTS',
  CALLS = 'CALLS',
  EXTENDS = 'EXTENDS',
  IMPLEMENTS = 'IMPLEMENTS',
  DEPENDS_ON = 'DEPENDS_ON',
  REFERENCES = 'REFERENCES',
  
  // Documentation relationships
  DOCUMENTS = 'DOCUMENTS',
  GENERATED_FROM = 'GENERATED_FROM',
  
  // Activity relationships
  PERFORMED = 'PERFORMED',
  ACTIVITY_ON = 'ACTIVITY_ON',
  
  // Semantic relationships
  SIMILAR_TO = 'SIMILAR_TO',
  HAS_EMBEDDING = 'HAS_EMBEDDING',
  SEMANTIC_LINK = 'SEMANTIC_LINK'
}

export interface GraphNode {
  id: string;
  label: NodeLabel;
  properties: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface GraphRelationship {
  id: string;
  type: RelationshipType;
  fromId: string;
  toId: string;
  properties: Record<string, any>;
  createdAt: Date;
}

export interface UserNode extends GraphNode {
  label: NodeLabel.User;
  properties: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    role: 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER';
    isActive: boolean;
    emailVerified: boolean;
    lastLogin?: Date;
  };
}

export interface BoardNode extends GraphNode {
  label: NodeLabel.Board;
  properties: {
    name: string;
    description?: string;
    slug: string;
    isPublic: boolean;
    isArchived: boolean;
    settings?: Record<string, any>;
  };
}

export interface TaskNode extends GraphNode {
  label: NodeLabel.Task;
  properties: {
    title: string;
    description?: string;
    status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'BLOCKED';
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    position: number;
    dueDate?: Date;
    estimatedHours?: number;
    actualHours?: number;
    completedAt?: Date;
    metadata?: Record<string, any>;
  };
}

export interface PullRequestNode extends GraphNode {
  label: NodeLabel.PullRequest;
  properties: {
    title: string;
    description?: string;
    branch: string;
    baseBranch: string;
    prNumber?: number;
    externalId?: string;
    status: 'DRAFT' | 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'MERGED' | 'CLOSED';
    repositoryUrl: string;
    diffUrl?: string;
    mergedAt?: Date;
    closedAt?: Date;
    additions: number;
    deletions: number;
    filesChanged: number;
  };
}

export interface CodebaseNode extends GraphNode {
  label: NodeLabel.Codebase;
  properties: {
    name: string;
    repositoryUrl: string;
    language: string;
    framework?: string;
    version?: string;
    dependencies?: string[];
    metadata?: Record<string, any>;
  };
}

export interface FileNode extends GraphNode {
  label: NodeLabel.File;
  properties: {
    path: string;
    name: string;
    extension: string;
    type: 'source' | 'test' | 'config' | 'documentation' | 'asset';
    size: number;
    language?: string;
    content?: string;
    hash?: string;
    complexity?: number;
    linesOfCode?: number;
  };
}

export interface CodeElementNode extends GraphNode {
  label: NodeLabel.CodeElement;
  properties: {
    name: string;
    type: 'class' | 'function' | 'interface' | 'enum' | 'variable' | 'component' | 'module';
    signature?: string;
    documentation?: string;
    startLine?: number;
    endLine?: number;
    complexity?: number;
    parameters?: string[];
    returnType?: string;
  };
}

export interface EmbeddingNode extends GraphNode {
  label: NodeLabel.Embedding;
  properties: {
    vector: number[];
    model: string;
    dimensions: number;
    contentType: 'text' | 'code' | 'documentation';
    sourceId: string;
    sourceType: string;
  };
}

export class GraphModelBuilder {
  static createUser(data: Partial<UserNode['properties']>): UserNode {
    return {
      id: uuidv4(),
      label: NodeLabel.User,
      properties: {
        email: data.email!,
        username: data.username!,
        password: data.password!,
        firstName: data.firstName,
        lastName: data.lastName,
        avatar: data.avatar,
        role: data.role || 'MEMBER',
        isActive: data.isActive !== false,
        emailVerified: data.emailVerified || false,
        lastLogin: data.lastLogin
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  static createBoard(data: Partial<BoardNode['properties']>): BoardNode {
    return {
      id: uuidv4(),
      label: NodeLabel.Board,
      properties: {
        name: data.name!,
        description: data.description,
        slug: data.slug || this.generateSlug(data.name!),
        isPublic: data.isPublic || false,
        isArchived: data.isArchived || false,
        settings: data.settings
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  static createTask(data: Partial<TaskNode['properties']>): TaskNode {
    return {
      id: uuidv4(),
      label: NodeLabel.Task,
      properties: {
        title: data.title!,
        description: data.description,
        status: data.status || 'TODO',
        priority: data.priority || 'MEDIUM',
        position: data.position || 0,
        dueDate: data.dueDate,
        estimatedHours: data.estimatedHours,
        actualHours: data.actualHours,
        completedAt: data.completedAt,
        metadata: data.metadata
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  static createPullRequest(data: Partial<PullRequestNode['properties']>): PullRequestNode {
    return {
      id: uuidv4(),
      label: NodeLabel.PullRequest,
      properties: {
        title: data.title!,
        description: data.description,
        branch: data.branch!,
        baseBranch: data.baseBranch || 'main',
        prNumber: data.prNumber,
        externalId: data.externalId,
        status: data.status || 'DRAFT',
        repositoryUrl: data.repositoryUrl!,
        diffUrl: data.diffUrl,
        mergedAt: data.mergedAt,
        closedAt: data.closedAt,
        additions: data.additions || 0,
        deletions: data.deletions || 0,
        filesChanged: data.filesChanged || 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  static createFile(data: Partial<FileNode['properties']>): FileNode {
    return {
      id: uuidv4(),
      label: NodeLabel.File,
      properties: {
        path: data.path!,
        name: data.name || data.path!.split('/').pop()!,
        extension: data.extension || data.path!.split('.').pop()!,
        type: data.type || 'source',
        size: data.size || 0,
        language: data.language,
        content: data.content,
        hash: data.hash,
        complexity: data.complexity,
        linesOfCode: data.linesOfCode
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  static createCodeElement(data: Partial<CodeElementNode['properties']>): CodeElementNode {
    return {
      id: uuidv4(),
      label: NodeLabel.CodeElement,
      properties: {
        name: data.name!,
        type: data.type!,
        signature: data.signature,
        documentation: data.documentation,
        startLine: data.startLine,
        endLine: data.endLine,
        complexity: data.complexity,
        parameters: data.parameters,
        returnType: data.returnType
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  static createEmbedding(data: Partial<EmbeddingNode['properties']>): EmbeddingNode {
    return {
      id: uuidv4(),
      label: NodeLabel.Embedding,
      properties: {
        vector: data.vector!,
        model: data.model || 'text-embedding-ada-002',
        dimensions: data.dimensions || data.vector!.length,
        contentType: data.contentType || 'text',
        sourceId: data.sourceId!,
        sourceType: data.sourceType!
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private static generateSlug(name: string): string {
    return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
  }
}