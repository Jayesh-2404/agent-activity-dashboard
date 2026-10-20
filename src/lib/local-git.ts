import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { LocalCommit, LocalErrorCode, LocalState } from "@/lib/activity-types";

const CONFIG_FILE = ".local-repos.json";
const CONFIG_TTL_MS = 5_000;
const GIT_TIMEOUT_MS = 3_000;
const MAX_BUFFER = 2 * 1024 * 1024;
const UNPUSHED_LIMIT = 20;
const LOCAL_DEADLINE_MS = 6_000;
const FIELD = "\x1f";

export type ParsedStatus = {
  branch: string | null;
  headSha: string | null;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  dirty: { changed: number; untracked: number };
};

export type LocalRead = {
  local: LocalState | null;
  localError: LocalErrorCode | null;
};

type GitResult = { ok: true; stdout: string } | { ok: false; code: LocalErrorCode };
type ConfigCache = { value: Map<string, string>; loadedAt: number };

let configCache: ConfigCache | null = null;

export function parseConfig(raw: string): Map<string, string> {
  const entries = new Map<string, string>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return entries;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return entries;

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string" || value.trim() === "" || !key.includes("/")) continue;
    entries.set(key.toLowerCase(), value.trim());
  }
  return entries;
}

export function parseStatus(stdout: string): ParsedStatus {
  let branch: string | null = null;
  let headSha: string | null = null;
  let upstream: string | null = null;
  let ahead: number | null = null;
  let behind: number | null = null;
  let changed = 0;
  let untracked = 0;

  for (const line of stdout.split("\n")) {
    if (line.startsWith("# branch.oid ")) {
      const value = line.slice("# branch.oid ".length).trim();
      headSha = value === "(initial)" ? null : value;
    } else if (line.startsWith("# branch.head ")) {
      const value = line.slice("# branch.head ".length).trim();
      branch = value === "(detached)" ? null : value;
    } else if (line.startsWith("# branch.upstream ")) {
      upstream = line.slice("# branch.upstream ".length).trim() || null;
    } else if (line.startsWith("# branch.ab ")) {
      const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(line.trim());
      if (match) {
        ahead = Number(match[1]);
        behind = Number(match[2]);
      }
    } else if (line.startsWith("? ")) {
      untracked += 1;
    } else if (line.startsWith("1 ") || line.startsWith("2 ") || line.startsWith("u ")) {
      changed += 1;
    }
  }

  return { branch, headSha, upstream, ahead, behind, dirty: { changed, untracked } };
}

export function parseLog(stdout: string): LocalCommit[] {
  const commits: LocalCommit[] = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const [sha, author, date, ...message] = line.split(FIELD);
    if (!sha || !date) continue;
    commits.push({
      sha,
      author: author || "Unknown",
      date,
      message: message.join(FIELD) || "(no message)",
    });
  }
  return commits;
}

async function loadConfig(): Promise<Map<string, string>> {
  if (configCache && Date.now() - configCache.loadedAt < CONFIG_TTL_MS) return configCache.value;

  let value = new Map<string, string>();
  try {
    value = parseConfig(await readFile(path.join(process.cwd(), CONFIG_FILE), "utf8"));
  } catch {
    // A missing config is the normal remote-only mode, not a failure.
  }
  configCache = { value, loadedAt: Date.now() };
  return value;
}

async function isDirectory(value: string): Promise<boolean> {
  try {
    return (await stat(value)).isDirectory();
  } catch {
    return false;
  }
}

function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        encoding: "utf8",
        // git status refreshes the index unless optional locks are off.
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      },
      (error, stdout) => {
        if (!error) {
          resolve({ ok: true, stdout });
          return;
        }
        const failure = error as NodeJS.ErrnoException & { killed?: boolean };
        if (failure.code === "ENOENT") resolve({ ok: false, code: "git-missing" });
        else if (failure.killed) resolve({ ok: false, code: "timeout" });
        else resolve({ ok: false, code: "unreadable" });
      },
    );
  });
}

export async function readLocalState(fullName: string): Promise<LocalRead> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<LocalRead>((resolve) => {
    timer = setTimeout(() => resolve({ local: null, localError: "timeout" }), LOCAL_DEADLINE_MS);
  });

  try {
    return await Promise.race([readLocalStateUncapped(fullName), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readLocalStateUncapped(fullName: string): Promise<LocalRead> {
  const config = await loadConfig();
  const configured = config.get(fullName.toLowerCase());
  if (!configured) return { local: null, localError: null };

  const requested = path.resolve(configured);
  if (!(await isDirectory(requested))) return { local: null, localError: "not-a-repo" };

  const toplevel = await runGit(requested, ["rev-parse", "--show-toplevel"]);
  if (!toplevel.ok) return { local: null, localError: toplevel.code };
  const root = toplevel.stdout.trim();
  if (!root) return { local: null, localError: "not-a-repo" };

  const status = await runGit(root, [
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=normal",
  ]);
  if (!status.ok) return { local: null, localError: status.code };
  const parsed = parseStatus(status.stdout);

  let unpushed: LocalCommit[] = [];
  if (parsed.upstream && parsed.ahead !== null && parsed.ahead > 0) {
    const log = await runGit(root, [
      "log",
      `--format=%H${FIELD}%an${FIELD}%aI${FIELD}%s`,
      "-n",
      String(UNPUSHED_LIMIT),
      "@{u}..HEAD",
    ]);
    if (log.ok) unpushed = parseLog(log.stdout);
  } else if (!parsed.upstream && parsed.headSha) {
    // A branch without an upstream still has commits that live on no remote.
    const log = await runGit(root, [
      "log",
      `--format=%H${FIELD}%an${FIELD}%aI${FIELD}%s`,
      "-n",
      String(UNPUSHED_LIMIT),
      "HEAD",
      "--not",
      "--remotes",
    ]);
    if (log.ok) unpushed = parseLog(log.stdout);
  }

  return {
    local: {
      branch: parsed.branch,
      headSha: parsed.headSha,
      upstream: parsed.upstream,
      ahead: parsed.ahead,
      behind: parsed.behind,
      dirty: parsed.dirty,
      unpushed,
      capturedAt: new Date().toISOString(),
    },
    localError: null,
  };
}
