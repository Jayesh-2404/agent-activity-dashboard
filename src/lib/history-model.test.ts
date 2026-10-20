import { describe, expect, it } from "vitest";
import { pullState, toCommit, toHistoryItem, toPullDetail } from "./history-model";

const pull = {
  number: 12,
  title: "Add history",
  html_url: "https://github.com/acme/atlas/pull/12",
  state: "closed" as const,
  draft: false,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-02T10:00:00Z",
  merged_at: "2026-10-02T09:00:00Z",
  closed_at: "2026-10-02T09:00:00Z",
  user: { login: "ada", avatar_url: "https://avatar.test/ada" },
  head: { ref: "feature/history" },
  base: { ref: "main" },
};

describe("pullState", () => {
  it("calls a closed pull with a merge date merged", () => {
    expect(pullState(pull)).toBe("merged");
  });

  it("keeps open pulls open", () => {
    expect(pullState({ ...pull, state: "open", merged_at: null })).toBe("open");
  });

  it("keeps closed pulls closed", () => {
    expect(pullState({ ...pull, merged_at: null })).toBe("closed");
  });
});

describe("toCommit", () => {
  it("maps the GitHub shape and keeps only the subject", () => {
    expect(
      toCommit({
        sha: "abc",
        commit: {
          message: "fix: thing\n\nbody text",
          author: { name: "Ada", date: "2026-10-18T16:22:27Z" },
        },
      }),
    ).toEqual({
      sha: "abc",
      message: "fix: thing",
      author: "Ada",
      date: "2026-10-18T16:22:27Z",
      parents: [],
    });
  });

  it("keeps parent shas for the commit graph", () => {
    expect(
      toCommit({
        sha: "merge",
        parents: [{ sha: "one" }, { sha: "two" }],
        commit: { message: "merge", author: { name: "Ada", date: "2026-10-18T16:22:27Z" } },
      }).parents,
    ).toEqual(["one", "two"]);
  });

  it("falls back when a commit has no author", () => {
    expect(toCommit({ sha: "abc", commit: { message: "x", author: null } })).toEqual({
      sha: "abc",
      message: "x",
      author: "Unknown",
      date: "",
      parents: [],
    });
  });
});

describe("toHistoryItem", () => {
  it("maps state, dates, branches and author", () => {
    const item = toHistoryItem(pull);
    expect(item.state).toBe("merged");
    expect(item.head).toBe("feature/history");
    expect(item.base).toBe("main");
    expect(item.author).toBe("ada");
    expect(item.url).toBe("https://github.com/acme/atlas/pull/12");
  });

  it("handles pull requests from deleted accounts", () => {
    const item = toHistoryItem({ ...pull, user: null });
    expect(item.author).toBe("ghost");
    expect(item.avatarUrl).toBe("");
  });
});

describe("toPullDetail", () => {
  it("adds stats that only the detail endpoint returns", () => {
    const detail = toPullDetail({
      ...pull,
      body: "hello",
      additions: 10,
      deletions: 2,
      changed_files: 3,
      commits: 4,
      comments: 1,
    });
    expect(detail.additions).toBe(10);
    expect(detail.changedFiles).toBe(3);
    expect(detail.commitCount).toBe(4);
    expect(detail.body).toBe("hello");
  });
});

