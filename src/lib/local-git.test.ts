import { describe, expect, it } from "vitest";
import {
  expandHome,
  parseConfig,
  parseGitConfig,
  parseLog,
  parseRemoteUrl,
  parseStatus,
} from "./local-git";

const STATUS_WITH_UPSTREAM = [
  "# branch.oid 97706c7b36092b697f0d0d10984261177703c411",
  "# branch.head main",
  "# branch.upstream origin/main",
  "# branch.ab +3 -0",
  "1 .M N... 100644 100644 100644 aaaaaaa bbbbbbb src/app/page.tsx",
  "2 R. N... 100644 100644 100644 ccccccc ddddddd src/old.ts",
  "? docs/explainer.html",
  "? docs/zex-architecture.excalidraw",
  "",
].join("\n");

describe("parseStatus", () => {
  it("reads branch, upstream, ahead and dirty counts", () => {
    expect(parseStatus(STATUS_WITH_UPSTREAM)).toEqual({
      branch: "main",
      headSha: "97706c7b36092b697f0d0d10984261177703c411",
      upstream: "origin/main",
      ahead: 3,
      behind: 0,
      dirty: { changed: 2, untracked: 2 },
    });
  });

  it("reports unknown ahead and behind when no upstream is set", () => {
    const parsed = parseStatus("# branch.oid abc123\n# branch.head feature\n");
    expect(parsed.upstream).toBeNull();
    expect(parsed.ahead).toBeNull();
    expect(parsed.behind).toBeNull();
  });

  it("treats a detached head as no branch", () => {
    expect(parseStatus("# branch.oid abc123\n# branch.head (detached)\n").branch).toBeNull();
  });

  it("treats an unborn branch as no head", () => {
    expect(parseStatus("# branch.oid (initial)\n# branch.head main\n").headSha).toBeNull();
  });
});

describe("parseLog", () => {
  it("keeps field order, parents and the subject", () => {
    const raw = [
      "aaa\x1fparent1 parent2\x1fAda\x1f2026-10-18T16:22:27Z\x1fadd the thing",
      "bbb\x1f\x1fGrace\x1f2026-10-17T10:00:00Z\x1fchore: deps",
      "",
    ].join("\n");

    expect(parseLog(raw)).toEqual([
      {
        sha: "aaa",
        parents: ["parent1", "parent2"],
        author: "Ada",
        date: "2026-10-18T16:22:27Z",
        message: "add the thing",
      },
      {
        sha: "bbb",
        parents: [],
        author: "Grace",
        date: "2026-10-17T10:00:00Z",
        message: "chore: deps",
      },
    ]);
  });

  it("returns nothing for empty output", () => {
    expect(parseLog("")).toEqual([]);
  });

  it("drops records without a sha or date", () => {
    expect(parseLog("only\x1fone\n")).toEqual([]);
  });
});

describe("parseConfig", () => {
  it("lowercases repository keys, trims paths and reads roots", () => {
    const config = parseConfig(
      JSON.stringify({
        roots: [" F:\\code ", "D:\\work"],
        "Jayesh-2404/zex": " F:\\zex ",
      }),
    );
    expect(config.repos.get("jayesh-2404/zex")).toBe("F:\\zex");
    expect(config.roots).toEqual(["F:\\code", "D:\\work"]);
  });

  it("accepts a single root string", () => {
    const config = parseConfig(JSON.stringify({ roots: "F:\\code" }));
    expect(config.roots).toEqual(["F:\\code"]);
  });

  it("ignores entries that are not owner/name pairs with a path", () => {
    const config = parseConfig(
      JSON.stringify({ "owner/repo": 42, nope: "F:\\x", "owner/ok": "F:\\ok" }),
    );
    expect(config.repos.has("owner/repo")).toBe(false);
    expect(config.repos.has("nope")).toBe(false);
    expect(config.repos.get("owner/ok")).toBe("F:\\ok");
  });

  it("returns an empty config for invalid json", () => {
    const config = parseConfig("{");
    expect(config.repos.size).toBe(0);
    expect(config.roots).toEqual([]);
  });

  it("tolerates a UTF-8 BOM", () => {
    const config = parseConfig("\uFEFF" + JSON.stringify({ "owner/repo": "F:\\repo" }));
    expect(config.repos.get("owner/repo")).toBe("F:\\repo");
  });
});

describe("parseRemoteUrl", () => {
  it("normalizes https, ssh and scp-style GitHub remotes", () => {
    expect(parseRemoteUrl("https://github.com/Jayesh-2404/zex.git")).toBe("jayesh-2404/zex");
    expect(parseRemoteUrl("https://github.com/Jayesh-2404/zex")).toBe("jayesh-2404/zex");
    expect(parseRemoteUrl("git@github.com:Jayesh-2404/zex.git")).toBe("jayesh-2404/zex");
    expect(parseRemoteUrl("ssh://git@github.com/Jayesh-2404/zex.git")).toBe("jayesh-2404/zex");
  });

  it("rejects non-GitHub and malformed remotes", () => {
    expect(parseRemoteUrl("https://gitlab.com/acme/atlas.git")).toBeNull();
    expect(parseRemoteUrl("https://github.com/acme")).toBeNull();
    expect(parseRemoteUrl("")).toBeNull();
    expect(parseRemoteUrl(null)).toBeNull();
  });
});

describe("parseGitConfig", () => {
  it("reads only the origin remote", () => {
    const config = [
      '[core]',
      "\trepositoryformatversion = 0",
      '[remote "upstream"]',
      "\turl = https://github.com/other/atlas.git",
      '[remote "origin"]',
      "\turl = git@github.com:Jayesh-2404/zex.git",
      "\tfetch = +refs/heads/*:refs/remotes/origin/*",
      "",
    ].join("\n");
    expect(parseGitConfig(config)).toBe("git@github.com:Jayesh-2404/zex.git");
  });

  it("returns null when origin is missing", () => {
    expect(parseGitConfig('[core]\n\trepositoryformatversion = 0\n')).toBeNull();
  });
});

describe("expandHome", () => {
  it("expands a leading tilde", () => {
    expect(expandHome("~/code", "C:\\Users\\ada")).toBe("C:\\Users\\ada\\code");
    expect(expandHome("F:\\code", "C:\\Users\\ada")).toBe("F:\\code");
  });
});
