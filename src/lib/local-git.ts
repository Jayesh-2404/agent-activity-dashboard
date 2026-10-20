import { execFile } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LocalCommit, LocalErrorCode, LocalState } from "@/lib/activity-types";

const CONFIG_FILE = ".local-repos.json";
const CONFIG_TTL_MS = 5_000;
const DISCOVERY_TTL_MS = 30_000;
const GIT_TIMEOUT_MS = 3_000;
const MAX_BUFFER = 2 * 1024 * 1024;
const UNPUSHED_LIMIT = 20;
const LOCAL_DEADLINE_MS = 8_000;
const FIELD = "\x1f";

const SCAN_BUDGET_MS = 1_500;
const SCAN_MAX_DIRS = 2_500;
const SCAN_MAX_DEPTH = 3;
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".cache",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "venv",
  "windows",
  "program files",
  "program files (x86)",
  "appdata",
  "$recycle.bin",
  "system volume information",
]);

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

export type LocalConfig = {
  repos: Map<string, string>;
  roots: string[];
};

export type LocalMappingResult = LocalRead & { error?: string };

type GitResult = { ok: true; stdout: string } | { ok: false; code: LocalErrorCode };
type ConfigCache = { value: LocalConfig; loadedAt: number };
type Discovery = { key: string; index: Map<string, string>; scannedAt: number };

let configCache: ConfigCache | null = null;
let discoveryCache: Discovery | null = null;
let discoveryPromise: { key: string; promise: Promise<Discovery> } | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

export function parseConfig(raw: string): LocalConfig {
  const repos = new Map<string, string>();
  const roots: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return { repos, roots };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { repos, roots };

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (key === "roots") {
      const values = Array.isArray(value) ? value : [value];
      for (const entry of values) {
        if (typeof entry === "string" && entry.trim() !== "") roots.push(entry.trim());
      }
      continue;
    }
    if (typeof value !== "string" || value.trim() === "" || !key.includes("/")) continue;
    repos.set(key.toLowerCase(), value.trim());
  }
  return { repos, roots };
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
    const [sha, parents, author, date, ...message] = line.split(FIELD);
    if (!sha || !date) continue;
    commits.push({
      sha,
      parents: parents ? parents.split(" ").filter(Boolean) : [],
      author: author || "Unknown",
      date,
      message: message.join(FIELD) || "(no message)",
    });
  }
  return commits;
}

export function parseRemoteUrl(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/\.git$/i, "");
  const patterns = [
    /^(?:https?|ssh):\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/([^/]+)$/i,
    /^(?:git@)?github\.com:([^/]+)\/([^/]+)$/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (!match) continue;
    const owner = match[1];
    const repo = match[2].replace(/\.git$/i, "");
    if (!owner || !repo || repo.includes("/")) return null;
    return `${owner}/${repo}`.toLowerCase();
  }
  return null;
}

export function parseGitConfig(raw: string): string | null {
  let inOrigin = false;
  for (const line of raw.split(/\r?\n/)) {
    const section = /^\s*\[([^\]]+)\]/.exec(line);
    if (section) {
      inOrigin = /^remote\s+"origin"$/i.test(section[1].trim());
      continue;
    }
    if (!inOrigin) continue;
    const url = /^\s*url\s*=\s*(.+?)\s*$/.exec(line);
    if (url) return url[1].replace(/^"|"$/g, "");
  }
  return null;
}

export function expandHome(value: string, home = os.homedir()): string {
  if (value === "~") return home;
  if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(home, value.slice(2));
  return value;
}

function uniqueRoots(values: string[]): string[] {
  const seen = new Set<string>();
  const roots: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const resolved = path.resolve(expandHome(value));
    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push(resolved);
  }
  return roots;
}

function configuredRoots(config: LocalConfig): string[] {
  const home = os.homedir();
  const fromEnv = (process.env.LOCAL_REPO_ROOTS ?? "")
    .split(/[;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const defaults = [
    path.dirname(process.cwd()),
    path.join(home, "projects"),
    path.join(home, "code"),
    path.join(home, "dev"),
    path.join(home, "repos"),
    path.join(home, "git"),
    path.join(home, "source", "repos"),
    path.join(home, "Documents", "GitHub"),
  ];
  return uniqueRoots([...config.roots, ...fromEnv, ...defaults]);
}

async function loadConfig(): Promise<LocalConfig> {
  if (configCache && Date.now() - configCache.loadedAt < CONFIG_TTL_MS) return configCache.value;

  let value: LocalConfig = { repos: new Map(), roots: [] };
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

async function readOrigin(root: string): Promise<string | null> {
  const dotGit = path.join(root, ".git");
  try {
    const info = await stat(dotGit);
    if (info.isDirectory()) {
      const config = await readFile(path.join(dotGit, "config"), "utf8");
      return parseRemoteUrl(parseGitConfig(config));
    }
    if (!info.isFile()) return null;

    const pointer = await readFile(dotGit, "utf8");
    const match = /^gitdir:\s*(.+)$/m.exec(pointer);
    if (!match) return null;
    const gitdir = path.resolve(root, match[1].trim());
    const candidates = [
      path.join(gitdir, "config"),
      path.resolve(gitdir, "..", "..", "config"),
    ];
    for (const candidate of candidates) {
      try {
        const config = await readFile(candidate, "utf8");
        const origin = parseRemoteUrl(parseGitConfig(config));
        if (origin) return origin;
      } catch {
        // Try the next config location.
      }
    }
  } catch {
    // A directory that looks like a repo but cannot be read is skipped.
  }
  return null;
}

async function scanRoots(roots: string[]): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const visited = new Set<string>();
  const queue = roots.map((root) => ({ dir: root, depth: 0 }));
  const deadline = Date.now() + SCAN_BUDGET_MS;
  let scanned = 0;

  while (queue.length > 0 && scanned < SCAN_MAX_DIRS && Date.now() < deadline) {
    const next = queue.shift();
    if (!next) break;
    const resolved = path.resolve(next.dir);
    const key = resolved.toLowerCase();
    if (visited.has(key)) continue;
    visited.add(key);

    let entries;
    try {
      entries = await readdir(resolved, { withFileTypes: true });
    } catch {
      continue;
    }
    scanned += 1;

    if (entries.some((entry) => entry.name === ".git")) {
      const fullName = await readOrigin(resolved);
      if (fullName && !index.has(fullName)) index.set(fullName, resolved);
    }

    if (next.depth >= SCAN_MAX_DEPTH) continue;
    const children = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.isSymbolicLink() &&
          !entry.name.startsWith(".") &&
          !SKIP_DIRS.has(entry.name.toLowerCase()),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      queue.push({ dir: path.join(resolved, child.name), depth: next.depth + 1 });
    }
  }

  return index;
}

async function discoverLocalRepositories(roots: string[], force = false): Promise<Discovery> {
  const key = roots.join("\u0000");
  if (!force && discoveryCache && discoveryCache.key === key && Date.now() - discoveryCache.scannedAt < DISCOVERY_TTL_MS) {
    return discoveryCache;
  }
  if (discoveryPromise && discoveryPromise.key === key) return discoveryPromise.promise;

  const promise = scanRoots(roots)
    .then((index): Discovery => {
      const next = { key, index, scannedAt: Date.now() };
      discoveryCache = next;
      return next;
    })
    .finally(() => {
      if (discoveryPromise?.promise === promise) discoveryPromise = null;
    });
  discoveryPromise = { key, promise };
  return promise;
}

async function resolveLocalPath(
  fullName: string,
): Promise<{ path: string | null; source: "config" | "discovered" | null }> {
  const config = await loadConfig();
  const key = fullName.toLowerCase();
  const configured = config.repos.get(key);
  if (configured) return { path: configured, source: "config" };

  const roots = configuredRoots(config);
  const discovery = await discoverLocalRepositories(roots);
  const found = discovery.index.get(key);
  return { path: found ?? null, source: found ? "discovered" : null };
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
  const resolved = await resolveLocalPath(fullName);
  if (!resolved.path) return { local: null, localError: null };

  const requested = path.resolve(resolved.path);
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
  const logFormat = `--format=%H${FIELD}%P${FIELD}%an${FIELD}%aI${FIELD}%s`;
  if (parsed.upstream && parsed.ahead !== null && parsed.ahead > 0) {
    const log = await runGit(root, [
      "log",
      logFormat,
      "-n",
      String(UNPUSHED_LIMIT),
      "@{u}..HEAD",
    ]);
    if (log.ok) unpushed = parseLog(log.stdout);
  } else if (!parsed.upstream && parsed.headSha) {
    // A branch without an upstream still has commits that live on no remote.
    const log = await runGit(root, [
      "log",
      logFormat,
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
      path: root,
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

function configPath(): string {
  return path.join(process.cwd(), CONFIG_FILE);
}

async function readConfigObject(): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse((await readFile(configPath(), "utf8")).replace(/^\uFEFF/, ""));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Start from an empty config when there is nothing readable.
  }
  return {};
}

async function writeConfigObject(value: Record<string, unknown>): Promise<void> {
  await writeFile(configPath(), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function setMapping(
  raw: Record<string, unknown>,
  fullName: string,
  localPath: string | null,
): void {
  for (const key of Object.keys(raw)) {
    if (key !== "roots" && key.toLowerCase() === fullName.toLowerCase()) delete raw[key];
  }
  if (localPath) raw[fullName] = localPath;
}

function invalidateCaches(): void {
  configCache = null;
  discoveryCache = null;
  discoveryPromise = null;
}

function enqueueWrite<T>(work: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(work, work);
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function setLocalMapping(
  fullName: string,
  localPath: string | null,
): Promise<LocalMappingResult> {
  return enqueueWrite(async () => {
    if (localPath === null) {
      const raw = await readConfigObject();
      setMapping(raw, fullName, null);
      await writeConfigObject(raw);
      invalidateCaches();
      return { local: null, localError: null };
    }

    const requested = path.resolve(expandHome(localPath));
    if (!(await isDirectory(requested))) {
      return { local: null, localError: "not-a-repo", error: "That folder does not exist." };
    }
    const toplevel = await runGit(requested, ["rev-parse", "--show-toplevel"]);
    if (!toplevel.ok) {
      return { local: null, localError: toplevel.code, error: "That folder is not a git repository." };
    }
    const root = toplevel.stdout.trim();
    if (!root) {
      return { local: null, localError: "not-a-repo", error: "That folder is not a git repository." };
    }

    const raw = await readConfigObject();
    setMapping(raw, fullName, root);
    await writeConfigObject(raw);
    invalidateCaches();
    return readLocalStateUncapped(fullName);
  });
}
