export interface GitHubUser {
  id: number;
  login: string;
  node_id?: string;
  avatar_url?: string;
  gravatar_id?: string;
  url?: string;
  html_url?: string;
}

export interface GitHubRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  url?: string;
  html_url?: string;
}

export interface GitHubCommit {
  id: string;
  node_id?: string;
  message: string;
  timestamp: string;
  url: string;
  author: GitHubUser;
  added?: string[];
  removed?: string[];
  modified?: string[];
}

export interface PullRequestRef {
  label: string;
  ref: string;
  sha: string;
  node_id?: string;
}

export interface PullRequest {
  number: number;
  node_id: string;
  title: string;
  state: 'open' | 'closed';
  locked: boolean;
  user: GitHubUser;
  body?: string;
  url: string;
  html_url: string;
  diff_url: string;
  patch_url: string;
  issue_url: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  merged_at?: string;
  merge_commit_sha?: string;
  merged: boolean;
  mergeable?: boolean;
  rebaseable?: boolean;
  mergeable_state?: string;
  merged_by?: GitHubUser;
  head: PullRequestRef;
  base: PullRequestRef;
}

export interface WebhookPayload {
  action?: 'opened' | 'closed' | 'reopened' | 'edited' | 'synchronize';
  pull_request?: PullRequest;
  repository: GitHubRepository;
  commits?: GitHubCommit[];
  ref?: string;
  after?: string;
}
