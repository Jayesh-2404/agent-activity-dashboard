import type {
  ActivityBranch,
  AttentionState,
  DashboardRepository,
  PullRequest,
  QueueSummary,
  RepoRef,
  RepositoryResult,
  WorkItem,
} from "@/lib/activity-types";

function repoRef(repo: DashboardRepository): RepoRef {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.fullName,
    url: repo.url,
    defaultBranch: repo.defaultBranch,
    private: repo.private,
    pushedAt: repo.pushedAt,
  };
}

export function inferAttention(pull: PullRequest | null): AttentionState {
  if (!pull) return "no-pull-request";
  if (pull.draft || pull.reviewState === "draft") return "draft";
  if (pull.checkState === "failure") return "checks-failing";
  if (pull.reviewState === "changes_requested") return "agent-revising";
  if (pull.reviewState === "approved") return "approved";
  if (pull.reviewState === "in_review") return "in-review";
  if (pull.reviewState === "ready") return "your-review";
  return "unknown";
}

function makeWorkItem(
  repo: DashboardRepository,
  branch: ActivityBranch,
  pull: PullRequest | null,
): WorkItem {
  const attention = pull
    ? inferAttention(pull)
    : branch.pullRequest
      ? "unknown"
      : "no-pull-request";
  const needsYou = attention === "your-review" || attention === "approved";
  return {
    id: `${repo.fullName}:${branch.name}`,
    repo: repoRef(repo),
    branch,
    pull,
    attention,
    needsYou,
    blocked: pull?.checkState === "failure",
    lines: pull ? pull.additions + pull.deletions : 0,
    files: pull?.changedFiles ?? 0,
    updatedAt: pull?.updatedAt ?? repo.pushedAt,
  };
}

export function buildWorkItems(results: RepositoryResult[]): WorkItem[] {
  const items = new Map<string, WorkItem>();

  for (const result of results) {
    const repo = result.repository;
    if (!repo) continue;

    const pullsByBranch = new Map(repo.pullRequests.map((pull) => [pull.branch, pull]));
    const coveredBranches = new Set<string>();

    for (const branch of repo.branches) {
      const pull = pullsByBranch.get(branch.name) ?? null;
      if (branch.ahead <= 0 && !pull) continue;
      const item = makeWorkItem(repo, branch, pull);
      items.set(item.id, item);
      coveredBranches.add(branch.name);
    }

    for (const pull of repo.pullRequests) {
      if (coveredBranches.has(pull.branch)) continue;
      const branch: ActivityBranch = {
        name: pull.branch,
        sha: pull.headSha,
        ahead: 0,
        behind: 0,
        commits: [],
        pullRequest: { number: pull.number },
      };
      const item = makeWorkItem(repo, branch, pull);
      items.set(item.id, item);
    }
  }

  return sortWorkItems([...items.values()]);
}

function timestamp(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

export function sortWorkItems(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    if (a.needsYou !== b.needsYou) return a.needsYou ? -1 : 1;
    if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;
    if (a.lines !== b.lines) return b.lines - a.lines;
    if (timestamp(a.updatedAt) !== timestamp(b.updatedAt)) {
      return timestamp(a.updatedAt) - timestamp(b.updatedAt);
    }
    if (a.repo.fullName !== b.repo.fullName) return a.repo.fullName.localeCompare(b.repo.fullName);
    return a.branch.name.localeCompare(b.branch.name);
  });
}

export function partitionWorkItems(items: WorkItem[]): {
  waiting: WorkItem[];
  inFlight: WorkItem[];
} {
  return {
    waiting: items.filter((item) => item.needsYou),
    inFlight: items.filter((item) => !item.needsYou),
  };
}

export function summarize(items: WorkItem[]): QueueSummary {
  const needsYou = items.filter((item) => item.needsYou).length;
  return {
    needsYou,
    inFlight: items.length - needsYou,
    failedChecks: items.filter((item) => item.pull?.checkState === "failure").length,
    large: items.filter((item) => item.lines >= 500).length,
    total: items.length,
  };
}

export function workItemSnapshot(item: WorkItem): string {
  return `${item.attention}:${item.branch.sha}`;
}

export function snapshotWorkItems(items: WorkItem[]): Record<string, string> {
  return Object.fromEntries(items.map((item) => [item.id, workItemSnapshot(item)]));
}

export function updateWorkItemSeen(
  items: WorkItem[],
  seenItems: Record<string, string>,
  knownRepositories: Record<string, string>,
  initialized: boolean,
): { snapshots: Record<string, string>; changed: string[] } {
  const current = snapshotWorkItems(items);
  if (!initialized) return { snapshots: current, changed: [] };

  const snapshots = { ...seenItems };
  for (const item of items) {
    if (knownRepositories[item.repo.fullName] === undefined) snapshots[item.id] = current[item.id];
  }

  return {
    snapshots,
    changed: items
      .filter((item) => snapshots[item.id] !== current[item.id])
      .map((item) => item.id),
  };
}
