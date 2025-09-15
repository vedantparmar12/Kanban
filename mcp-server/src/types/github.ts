export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  user: {
    id: number;
    login: string;
    avatar_url: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  html_url: string;
  created_at: string;
  updated_at: string;
  additions: number;
  deletions: number;
  changed_files: number;
  merged: boolean;
  mergeable: boolean;
  merged_at?: string;
  comments: number;
  review_comments: number;
  commits: number;
}

export interface GitHubFile {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  raw_url: string;
  blob_url: string;
  patch?: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
}

export interface CreateCommentRequest {
  body: string;
  commit_id?: string;
  path?: string;
  line?: number;
  side?: 'LEFT' | 'RIGHT';
  start_line?: number;
  start_side?: 'LEFT' | 'RIGHT';
}

export interface ReviewRequest {
  body?: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments?: Array<{
    path: string;
    position?: number;
    body: string;
    line?: number;
    side?: 'LEFT' | 'RIGHT';
    start_line?: number;
    start_side?: 'LEFT' | 'RIGHT';
  }>;
}

export interface FileDiff {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
  blob_url?: string;
  raw_url?: string;
}

export interface ReviewComment {
  id: number;
  body: string;
  path: string;
  position?: number;
  line?: number;
  side?: 'LEFT' | 'RIGHT';
  start_line?: number;
  start_side?: 'LEFT' | 'RIGHT';
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
}

export interface Review {
  id: number;
  body: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  submitted_at?: string;
}

export interface CreateReviewParams {
  owner: string;
  repo: string;
  pull_number: number;
  body?: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' | 'PENDING';
  comments?: Array<{
    path: string;
    body: string;
    line?: number;
    side?: 'LEFT' | 'RIGHT';
    start_line?: number;
    start_side?: 'LEFT' | 'RIGHT';
  }>;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: {
    login: string;
    avatar_url: string;
  };
  html_url: string;
  created_at: string;
  updated_at: string;
  assignees?: Array<{
    login: string;
    avatar_url: string;
  }>;
  labels?: Array<{
    name: string;
    color: string;
    description?: string;
  }>;
  milestone?: {
    id: number;
    number: number;
    title: string;
  };
}

export interface CreateIssueParams {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

export interface UpdateIssueParams {
  owner: string;
  repo: string;
  issue_number: number;
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  state_reason?: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

export interface CreateIssueCommentParams {
  owner: string;
  repo: string;
  issue_number: number;
  body: string;
}