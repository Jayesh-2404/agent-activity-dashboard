export type SessionData = {
  authenticated: boolean;
  user?: { login: string; name: string; avatarUrl: string };
};

export type Repository = {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  url: string;
  defaultBranch: string;
  pushedAt: string | null;
  stars: number;
  owner: string;
  avatarUrl: string;
};

export type Commit = {
  sha: string;
  message: string;
  author: string;
  date: string;
  parents?: string[];
};

export type ReviewState =
  | "draft"
  | "changes_requested"
  | "approved"
  | "in_review"
  | "ready"
  | "unknown";

export type CheckState = "success" | "failure" | "pending" | "none" | "unknown";

export type PullRequest = {
  number: number;
  title: string;
  url: string;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  author: string;
  avatarUrl: string;
  branch: string;
  base: string;
  headSha: string;
  reviewers: string[];
  reviewState: ReviewState;
  checkState: CheckState;
  checkCount: number;
};

export type ActivityBranch = {
  name: string;
  sha: string;
  ahead: number;
  behind: number;
  commits: Commit[];
  pullRequest: { number: number } | null;
};

export type Deployment = {
  environment: string;
  date: string;
  state: string;
  sha?: string | null;
  matchesMain?: boolean | null;
};

export type DashboardRepository = {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  url: string;
  defaultBranch: string;
  pushedAt: string | null;
  latestSha: string;
  branches: ActivityBranch[];
  pullRequests: PullRequest[];
  deployment: Deployment | null;
  truncatedBranches: boolean;
  openPullCount?: number;
  pullRequestsTruncated?: boolean;
};

export type LocalCommit = {
  sha: string;
  message: string;
  author: string;
  date: string;
  parents?: string[];
};

export type LocalBranch = {
  name: string;
  sha: string;
  ahead: number;
  behind: number;
  current: boolean;
  commits: LocalCommit[];
};

export type LocalErrorCode = "not-a-repo" | "git-missing" | "timeout" | "unreadable";

export type LocalState = {
  path: string;
  branch: string | null;
  headSha: string | null;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  dirty: { changed: number; untracked: number };
  unpushed: LocalCommit[];
  baseBranch: string | null;
  branches: LocalBranch[];
  branchesTruncated: boolean;
  capturedAt: string;
};

export type RepositoryView = DashboardRepository & {
  local: LocalState | null;
  localError: LocalErrorCode | null;
};

export type RepositoryResult = {
  repository: DashboardRepository | null;
  local: LocalState | null;
  localError: LocalErrorCode | null;
  error: string | null;
  name?: string;
};

export type PullState = "open" | "merged" | "closed";

export type PullHistoryItem = {
  number: number;
  title: string;
  url: string;
  state: PullState;
  draft: boolean;
  author: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  base: string;
  head: string;
};

export type PullDetailItem = PullHistoryItem & {
  additions: number;
  deletions: number;
  changedFiles: number;
  commitCount: number;
  comments: number;
  body: string;
};

export type CommitHistoryPage = {
  view: "commits";
  commits: Commit[];
  page: number;
  hasMore: boolean;
};

export type PullHistoryPage = {
  view: "pulls";
  pullRequests: PullHistoryItem[];
  page: number;
  hasMore: boolean;
};

export type PullDetailPage = {
  view: "pull";
  pullRequest: PullDetailItem;
  commits: Commit[];
  truncated: boolean;
};

export type HistoryResponse = CommitHistoryPage | PullHistoryPage | PullDetailPage;

export type AttentionState =
  | "your-review"
  | "approved"
  | "agent-revising"
  | "in-review"
  | "checks-failing"
  | "draft"
  | "no-pull-request"
  | "unknown";

export type RepoRef = Pick<
  DashboardRepository,
  "id" | "name" | "fullName" | "url" | "defaultBranch" | "private" | "pushedAt"
>;

export type WorkItem = {
  id: string;
  repo: RepoRef;
  branch: ActivityBranch;
  pull: PullRequest | null;
  attention: AttentionState;
  needsYou: boolean;
  blocked: boolean;
  lines: number;
  files: number;
  updatedAt: string | null;
};

export type QueueSummary = {
  needsYou: number;
  inFlight: number;
  failedChecks: number;
  large: number;
  total: number;
};
