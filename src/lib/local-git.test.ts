import { describe, expect, it } from "vitest";
import { parseConfig, parseLog, parseStatus } from "./local-git";

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
  it("keeps field order and preserves the subject", () => {
    const raw = [
      "aaa\x1fAda\x1f2026-10-18T16:22:27Z\x1fadd the thing",
      "bbb\x1fGrace\x1f2026-10-17T10:00:00Z\x1fchore: deps",
      "",
    ].join("\n");

    expect(parseLog(raw)).toEqual([
      { sha: "aaa", author: "Ada", date: "2026-10-18T16:22:27Z", message: "add the thing" },
      { sha: "bbb", author: "Grace", date: "2026-10-17T10:00:00Z", message: "chore: deps" },
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
  it("lowercases keys and trims paths", () => {
    const config = parseConfig(JSON.stringify({ "Jayesh-2404/zex": " F:\\zex " }));
    expect(config.get("jayesh-2404/zex")).toBe("F:\\zex");
  });

  it("ignores entries that are not owner/name pairs with a path", () => {
    const config = parseConfig(
      JSON.stringify({ "owner/repo": 42, nope: "F:\\x", "owner/ok": "F:\\ok" }),
    );
    expect(config.has("owner/repo")).toBe(false);
    expect(config.has("nope")).toBe(false);
    expect(config.get("owner/ok")).toBe("F:\\ok");
  });

  it("returns an empty map for invalid json", () => {
    expect(parseConfig("{").size).toBe(0);
  });

  it("tolerates a UTF-8 BOM", () => {
    const config = parseConfig("\uFEFF" + JSON.stringify({ "owner/repo": "F:\\repo" }));
    expect(config.get("owner/repo")).toBe("F:\\repo");
  });
});
