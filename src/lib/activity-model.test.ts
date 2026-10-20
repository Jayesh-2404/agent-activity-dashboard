import { describe, expect, it } from "vitest";
import {
  buildWorkItems,
  inferAttention,
  partitionWorkItems,
  sortWorkItems,
  summarize,
} from "./activity-model";
import {
  formatAge,
  formatLines,
  plural,
  queueHeadline,
  queueTriage,
  shortSha,
} from "./format";
import type {
  ActivityBranch,
  DashboardRepository,
  PullRequest,
  QueueSummary,
  RepositoryResult,
} from "./activity-types";

const now = new Date("2026-10-20T12:00:00Z").getTime();

function minutesAgo(minutes: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

function makePull(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: "A change",
    url: "https://example.test/acme/atlas/pull/1",
    draft: false,
    createdAt: minutesAgo(60),
    updatedAt: minutesAgo(10),
    additions: 10,
    deletions: 2,
    changedFiles: 2,
    author: "Jules",
    avatarUrl: "",
    branch: "agent/one",
    base: "main",
    reviewers: [],
    reviewState: "ready",
    checkState: "success",
    checkCount: 1,
    ...overrides,
  };
}

function makeBranch(overrides: Partial<ActivityBranch> = {}): ActivityBranch {
  return {
    name: "agent/one",
    sha: "a".repeat(40),
    ahead: 1,
    behind: 0,
    commits: [],
    pullRequest: null,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<DashboardRepository> = {}): DashboardRepository {
  return {
    id: 1,
    name: "atlas",
    fullName: "acme/atlas",
    description: null,
    private: true,
    url: "https://github.com/acme/atlas",
    defaultBranch: "main",
    pushedAt: minutesAgo(12),
    latestSha: "b".repeat(40),
    branches: [],
    pullRequests: [],
    deployment: null,
    truncatedBranches: false,
    ...overrides,
  };
}

function makeResult(repo: DashboardRepository): RepositoryResult {
  return { repository: repo, local: null, localError: null, error: null, name: repo.fullName };
}

function makeSummary(overrides: Partial<QueueSummary> = {}): QueueSummary {
  return {
    needsYou: 0,
    inFlight: 0,
    failedChecks: 0,
    large: 0,
    total: 0,
    ...overrides,
  };
}

describe("inferAttention", () => {
  it("puts draft before failing checks", () => {
    expect(
      inferAttention(makePull({ draft: true, reviewState: "draft", checkState: "failure" })),
    ).toBe("draft");
  });

  it("puts failing checks before changes requested", () => {
    expect(
      inferAttention(makePull({ reviewState: "changes_requested", checkState: "failure" })),
    ).toBe("checks-failing");
  });

  it("maps ready, approved, review, and no pull states", () => {
    expect(inferAttention(makePull({ reviewState: "ready" }))).toBe("your-review");
    expect(inferAttention(makePull({ reviewState: "approved" }))).toBe("approved");
    expect(inferAttention(makePull({ reviewState: "in_review" }))).toBe("in-review");
    expect(inferAttention(null)).toBe("no-pull-request");
  });
});

describe("buildWorkItems", () => {
  it("joins a branch to its pull request once", () => {
    const pull = makePull({ branch: "agent/one" });
    const repo = makeRepo({
      branches: [makeBranch({ name: "agent/one", pullRequest: { number: 1 } })],
      pullRequests: [pull],
    });

    const items = buildWorkItems([makeResult(repo)]);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("acme/atlas:agent/one");
    expect(items[0].pull?.number).toBe(1);
    expect(items[0].attention).toBe("your-review");
  });

  it("keeps a branch without a pull request distinct", () => {
    const repo = makeRepo({
      branches: [makeBranch({ name: "agent/no-pr", pullRequest: null })],
    });

    const items = buildWorkItems([makeResult(repo)]);

    expect(items).toHaveLength(1);
    expect(items[0].attention).toBe("no-pull-request");
    expect(items[0].needsYou).toBe(false);
  });

  it("does not mislabel a branch whose pull request was not loaded", () => {
    const repo = makeRepo({
      branches: [makeBranch({ name: "agent/unloaded", pullRequest: { number: 42 } })],
      pullRequests: [],
    });

    const items = buildWorkItems([makeResult(repo)]);

    expect(items).toHaveLength(1);
    expect(items[0].pull).toBeNull();
    expect(items[0].branch.pullRequest?.number).toBe(42);
    expect(items[0].attention).toBe("unknown");
    expect(items[0].attention).not.toBe("no-pull-request");
  });

  it("summarizes waiting, in flight, failing checks, and large diffs", () => {
    const waiting = makePull({
      number: 1,
      branch: "agent/waiting",
      reviewState: "ready",
      additions: 400,
      deletions: 150,
    });
    const draft = makePull({
      number: 2,
      branch: "agent/draft",
      draft: true,
      reviewState: "draft",
      checkState: "failure",
      additions: 20,
      deletions: 5,
    });
    const repo = makeRepo({
      branches: [
        makeBranch({ name: "agent/waiting", pullRequest: { number: 1 } }),
        makeBranch({ name: "agent/draft", pullRequest: { number: 2 } }),
        makeBranch({ name: "agent/no-pr", pullRequest: null }),
      ],
      pullRequests: [waiting, draft],
    });

    const items = buildWorkItems([makeResult(repo)]);

    expect(summarize(items)).toEqual({
      needsYou: 1,
      inFlight: 2,
      failedChecks: 1,
      large: 1,
      total: 3,
    });
    expect(partitionWorkItems(items).waiting).toHaveLength(1);
    expect(partitionWorkItems(items).inFlight).toHaveLength(2);
  });
});

describe("sortWorkItems", () => {
  it("sorts waiting before blocked before larger changes", () => {
    const waitingLarge = makePull({
      number: 1,
      branch: "agent/waiting-large",
      reviewState: "ready",
      additions: 500,
      deletions: 0,
    });
    const waitingSmall = makePull({
      number: 2,
      branch: "agent/waiting-small",
      reviewState: "approved",
      additions: 10,
      deletions: 0,
    });
    const blocked = makePull({
      number: 3,
      branch: "agent/blocked",
      draft: true,
      reviewState: "draft",
      checkState: "failure",
      additions: 900,
      deletions: 0,
    });
    const inFlight = makePull({
      number: 4,
      branch: "agent/inflight",
      reviewState: "changes_requested",
      additions: 100,
      deletions: 0,
    });
    const repo = makeRepo({
      branches: [
        makeBranch({ name: "agent/waiting-small", pullRequest: { number: 2 } }),
        makeBranch({ name: "agent/blocked", pullRequest: { number: 3 } }),
        makeBranch({ name: "agent/inflight", pullRequest: { number: 4 } }),
        makeBranch({ name: "agent/waiting-large", pullRequest: { number: 1 } }),
      ],
      pullRequests: [waitingLarge, waitingSmall, blocked, inFlight],
    });

    const items = buildWorkItems([makeResult(repo)]);

    expect(items.map((item) => item.branch.name)).toEqual([
      "agent/waiting-large",
      "agent/waiting-small",
      "agent/blocked",
      "agent/inflight",
    ]);
  });

  it("breaks equal-priority ties by branch name", () => {
    const repo = makeRepo({
      branches: [
        makeBranch({ name: "agent/b", pullRequest: { number: 1 } }),
        makeBranch({ name: "agent/a", pullRequest: { number: 2 } }),
      ],
      pullRequests: [
        makePull({
          number: 1,
          branch: "agent/b",
          reviewState: "changes_requested",
          additions: 0,
          deletions: 0,
        }),
        makePull({
          number: 2,
          branch: "agent/a",
          reviewState: "changes_requested",
          additions: 0,
          deletions: 0,
        }),
      ],
    });

    const items = buildWorkItems([makeResult(repo)]);
    const sorted = sortWorkItems(items);

    expect(sorted.map((item) => item.branch.name)).toEqual(["agent/a", "agent/b"]);
  });
});

describe("format", () => {
  it("formats ages at the requested boundaries", () => {
    expect(formatAge(minutesAgo(0), now)).toBe("just now");
    expect(formatAge(minutesAgo(1), now)).toBe("1m ago");
    expect(formatAge(minutesAgo(59), now)).toBe("59m ago");
    expect(formatAge(minutesAgo(60), now)).toBe("1h ago");
    expect(formatAge(minutesAgo(23 * 60), now)).toBe("23h ago");
    expect(formatAge(minutesAgo(24 * 60), now)).toBe("1d ago");
    expect(formatAge(minutesAgo(6 * 24 * 60), now)).toBe("6d ago");
    expect(formatAge(minutesAgo(8 * 24 * 60), now)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it("handles missing and invalid ages", () => {
    expect(formatAge(null, now)).toBe("no recent activity");
    expect(formatAge("not-a-date", now)).toBe("unknown time");
  });

  it("formats counts, SHAs, and plurals", () => {
    expect(formatLines(999)).toBe("999");
    expect(formatLines(1_200)).toBe("1.2k");
    expect(formatLines(12_000)).toBe("12k");
    expect(shortSha("a".repeat(40))).toBe("aaaaaaa");
    expect(shortSha("")).toBe("unknown");
    expect(plural(1, "change")).toBe("change");
    expect(plural(2, "change")).toBe("changes");
    expect(plural(2, "diff", "diffs")).toBe("diffs");
  });

  it("writes the queue headline and triage from exact counts", () => {
    expect(queueHeadline(makeSummary({ needsYou: 0 }))).toBe("Nothing is waiting on you.");
    expect(queueHeadline(makeSummary({ needsYou: 1 }))).toBe("1 change is waiting on you.");
    expect(queueHeadline(makeSummary({ needsYou: 3 }))).toBe("3 changes are waiting on you.");
    expect(queueTriage(makeSummary({ failedChecks: 1, large: 1 }))).toBe(
      "1 check failing, 1 large diff.",
    );
    expect(queueTriage(makeSummary())).toBe("All checks are passing.");
  });
});
