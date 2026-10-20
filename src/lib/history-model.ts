import type {
  Commit,
  PullDetailItem,
  PullHistoryItem,
  PullState,
} from "@/lib/activity-types";

export type GitHubCommit = {
  sha: string;
  parents?: Array<{ sha: string }>;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
};

export type GitHubPull = {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft: boolean;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  user: { login: string; avatar_url: string } | null;
  head: { ref: string };
  base: { ref: string };
};

export type GitHubPullDetail = GitHubPull & {
  body: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  comments: number;
};

export const HISTORY_PAGE_SIZE = 30;
export const PULL_COMMIT_LIMIT = 100;

export function pullState(value: Pick<GitHubPull, "state" | "merged_at">): PullState {
  if (value.merged_at) return "merged";
  return value.state === "open" ? "open" : "closed";
}

export function toCommit(value: GitHubCommit): Commit {
  return {
    sha: value.sha,
    message: value.commit.message.split("\n")[0] || "(no message)",
    author: value.commit.author?.name ?? "Unknown",
    date: value.commit.author?.date ?? "",
    parents: value.parents?.map((parent) => parent.sha) ?? [],
  };
}

export function toHistoryItem(value: GitHubPull): PullHistoryItem {
  return {
    number: value.number,
    title: value.title,
    url: value.html_url,
    state: pullState(value),
    draft: value.draft,
    author: value.user?.login ?? "ghost",
    avatarUrl: value.user?.avatar_url ?? "",
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    mergedAt: value.merged_at,
    closedAt: value.closed_at,
    base: value.base.ref,
    head: value.head.ref,
  };
}

export function toPullDetail(value: GitHubPullDetail): PullDetailItem {
  return {
    ...toHistoryItem(value),
    additions: value.additions,
    deletions: value.deletions,
    changedFiles: value.changed_files,
    commitCount: value.commits,
    comments: value.comments,
    body: value.body ?? "",
  };
}
