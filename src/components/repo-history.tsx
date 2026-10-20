"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CommitTree, type CommitRef } from "@/components/commit-tree";
import { Icon } from "@/components/ui/icon";
import type {
  Commit,
  CommitHistoryPage,
  LocalState,
  PullDetailPage,
  PullHistoryItem,
  PullHistoryPage,
  PullState,
  RepositoryView,
} from "@/lib/activity-types";
import type { GraphCommit } from "@/lib/commit-graph";
import { formatAge, formatLines, plural, shortSha } from "@/lib/format";
import styles from "./repo-history.module.css";

type Tab = "commits" | "pulls";
type ViewStatus = "idle" | "loading" | "ready" | "error";
type Filter = "all" | PullState;

type CommitList = {
  status: ViewStatus;
  items: Commit[];
  page: number;
  hasMore: boolean;
  error: string;
};

type PullList = {
  status: ViewStatus;
  items: PullHistoryItem[];
  page: number;
  hasMore: boolean;
  error: string;
};

type PullDetailState = {
  number: number;
  status: ViewStatus;
  data: PullDetailPage | null;
  error: string;
};

async function fetchHistory<T extends object>(params: Record<string, string>): Promise<T> {
  const search = new URLSearchParams(params);
  const response = await fetch(`/api/github/history?${search.toString()}`, { cache: "no-store" });
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error ? payload.error : "Could not load history.",
    );
  }
  return payload as T;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function localAhead(local: LocalState): string {
  if (local.ahead === null) return "no upstream";
  if (local.ahead === 0) {
    return local.behind !== null && local.behind > 0 ? "0 unpushed" : "in sync";
  }
  return `${local.ahead} unpushed`;
}

function localDetails(local: LocalState): string {
  const parts: string[] = [];
  if (local.behind !== null && local.behind > 0) parts.push(`${local.behind} behind`);
  if (local.dirty.changed > 0) parts.push(`${local.dirty.changed} changed`);
  if (local.dirty.untracked > 0) parts.push(`${local.dirty.untracked} untracked`);
  return parts.join(", ");
}

function stateLabel(pull: PullHistoryItem): string {
  return pull.state === "open" && pull.draft ? "draft" : pull.state;
}

function stateTone(pull: PullHistoryItem): "open" | "draft" | "merged" | "closed" {
  if (pull.state === "merged") return "merged";
  if (pull.state === "open") return pull.draft ? "draft" : "open";
  return "closed";
}

export function RepoHistory({
  repo,
  onClose,
  onLocalChange,
}: {
  repo: RepositoryView | null;
  onClose: () => void;
  onLocalChange?: () => void;
}) {
  if (!repo) return null;
  return <RepoHistoryDialog repo={repo} onClose={onClose} onLocalChange={onLocalChange} />;
}

function RepoHistoryDialog({
  repo,
  onClose,
  onLocalChange,
}: {
  repo: RepositoryView;
  onClose: () => void;
  onLocalChange?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pathRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("commits");
  const [filter, setFilter] = useState<Filter>("all");
  const [local, setLocal] = useState<LocalState | null>(repo.local);
  const [localError, setLocalError] = useState<RepositoryView["localError"]>(repo.localError);
  const [linking, setLinking] = useState(false);
  const [linkPath, setLinkPath] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [commits, setCommits] = useState<CommitList>({
    status: "loading",
    items: [],
    page: 1,
    hasMore: false,
    error: "",
  });
  const [pulls, setPulls] = useState<PullList>({
    status: "idle",
    items: [],
    page: 1,
    hasMore: false,
    error: "",
  });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detail, setDetail] = useState<PullDetailState | null>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 20);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable) return;
      const items = Array.from(focusable).filter((element) => element.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (linking) pathRef.current?.focus();
  }, [linking]);

  const loadCommits = useCallback(
    async (page: number) => {
      setCommits((current) => ({ ...current, status: "loading", error: "" }));
      try {
        const payload = await fetchHistory<CommitHistoryPage>({
          repo: repo.fullName,
          view: "commits",
          page: String(page),
        });
        setCommits((current) => ({
          status: "ready",
          items: page === 1 ? payload.commits : [...current.items, ...payload.commits],
          page,
          hasMore: payload.hasMore,
          error: "",
        }));
      } catch (error) {
        setCommits((current) => ({
          ...current,
          status: "error",
          error: messageOf(error, "Could not load commits."),
        }));
      }
    },
    [repo.fullName],
  );

  useEffect(() => {
    void loadCommits(1);
  }, [loadCommits]);

  const loadPulls = useCallback(
    async (page: number) => {
      setPulls((current) => ({ ...current, status: "loading", error: "" }));
      try {
        const payload = await fetchHistory<PullHistoryPage>({
          repo: repo.fullName,
          view: "pulls",
          page: String(page),
        });
        setPulls((current) => ({
          status: "ready",
          items: page === 1 ? payload.pullRequests : [...current.items, ...payload.pullRequests],
          page,
          hasMore: payload.hasMore,
          error: "",
        }));
      } catch (error) {
        setPulls((current) => ({
          ...current,
          status: "error",
          error: messageOf(error, "Could not load pull requests."),
        }));
      }
    },
    [repo.fullName],
  );

  useEffect(() => {
    if (tab !== "pulls" || pulls.status !== "idle") return;
    void loadPulls(1);
  }, [tab, pulls.status, loadPulls]);

  const loadPull = useCallback(
    async (number: number) => {
      setDetail({ number, status: "loading", data: null, error: "" });
      try {
        const payload = await fetchHistory<PullDetailPage>({
          repo: repo.fullName,
          view: "pull",
          number: String(number),
        });
        setDetail((current) =>
          current && current.number !== number
            ? current
            : { number, status: "ready", data: payload, error: "" },
        );
      } catch (error) {
        setDetail((current) =>
          current && current.number !== number
            ? current
            : {
                number,
                status: "error",
                data: null,
                error: messageOf(error, "Could not load this pull request."),
              },
        );
      }
    },
    [repo.fullName],
  );

  const togglePull = (number: number) => {
    if (expanded === number) {
      setExpanded(null);
      return;
    }
    setExpanded(number);
    if (detail?.number === number && detail.status !== "error") return;
    void loadPull(number);
  };

  const visiblePulls = useMemo(
    () => (filter === "all" ? pulls.items : pulls.items.filter((pull) => pull.state === filter)),
    [filter, pulls.items],
  );

  const pullCounts = useMemo(() => {
    const counts = { all: pulls.items.length, open: 0, merged: 0, closed: 0 };
    for (const pull of pulls.items) counts[pull.state] += 1;
    return counts;
  }, [pulls.items]);

  const tree = useMemo(() => {
    const seen = new Set<string>();
    const list: GraphCommit[] = [];
    for (const commit of local?.unpushed ?? []) {
      if (seen.has(commit.sha)) continue;
      seen.add(commit.sha);
      list.push({ ...commit, local: true });
    }
    const localCount = list.length;
    for (const commit of commits.items) {
      if (seen.has(commit.sha)) continue;
      seen.add(commit.sha);
      list.push(commit);
    }
    return { commits: list, localCount };
  }, [local, commits.items]);

  const remoteHead = commits.items[0]?.sha ?? repo.latestSha;
  const refs = useMemo<CommitRef[]>(() => {
    const list: CommitRef[] = [];
    if (local?.headSha) {
      list.push({ sha: local.headSha, label: local.branch ?? "HEAD", tone: "local" });
    }
    if (remoteHead) {
      list.push({ sha: remoteHead, label: `origin/${repo.defaultBranch}`, tone: "remote" });
    }
    return list;
  }, [local, remoteHead, repo.defaultBranch]);

  const unpushedTotal = local ? (local.ahead ?? local.unpushed.length) : 0;
  const details = local ? localDetails(local) : "";

  const linkLocal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = linkPath.trim();
    if (!value) return;

    setLinkBusy(true);
    setLinkError("");
    try {
      const response = await fetch("/api/local/repos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: repo.fullName, path: value }),
      });
      const payload = (await response.json()) as {
        local?: LocalState | null;
        localError?: RepositoryView["localError"];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Could not link that folder.");
      setLocal(payload.local ?? null);
      setLocalError(payload.localError ?? null);
      setLinking(false);
      setLinkPath("");
      onLocalChange?.();
    } catch (error) {
      setLinkError(messageOf(error, "Could not link that folder."));
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="repo-history-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <p className={styles.eyebrow}>{repo.fullName}</p>
            <div className={styles.titleRow}>
              <h2 className={styles.title} id="repo-history-title">
                {repo.name}
              </h2>
              {repo.private ? <span className={styles.private}>private</span> : null}
            </div>

            <div className={styles.refs} aria-label="Repository refs">
              {local ? (
                <span className={styles.ref} data-tone="local" title={local.path}>
                  <span className={styles.refName}>{local.branch ?? "detached"}</span>
                  <span className={styles.refSha}>
                    {local.headSha ? shortSha(local.headSha) : "no commits"}
                  </span>
                  <span className={styles.refMeta}>{localAhead(local)}</span>
                </span>
              ) : null}
              <span className={styles.ref} data-tone="remote">
                <span className={styles.refName}>origin/{repo.defaultBranch}</span>
                {remoteHead ? <span className={styles.refSha}>{shortSha(remoteHead)}</span> : null}
              </span>
              {details ? <span className={styles.localMeta}>{details}</span> : null}
            </div>

            {!local ? (
              <div className={styles.localPrompt}>
                <span className={styles.promptText}>
                  {localError
                    ? `Local mapping is unreadable (${localError}).`
                    : "No local clone found on this machine."}
                </span>
                {linking ? (
                  <form className={styles.linkForm} onSubmit={linkLocal}>
                    <label className="srOnly" htmlFor="local-repo-path">
                      Local folder path
                    </label>
                    <input
                      id="local-repo-path"
                      ref={pathRef}
                      value={linkPath}
                      onChange={(event) => setLinkPath(event.target.value)}
                      placeholder={"F:\\path\\to\\repo"}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button className="button" type="submit" disabled={linkBusy}>
                      {linkBusy ? "Linking" : "Link"}
                    </button>
                    <button
                      className="button buttonQuiet"
                      type="button"
                      onClick={() => {
                        setLinking(false);
                        setLinkError("");
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button className={styles.linkButton} onClick={() => setLinking(true)}>
                    <Icon name="folder" size={13} />
                    Link a folder
                  </button>
                )}
                {linkError ? (
                  <p className={styles.linkError} role="alert">
                    {linkError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className={styles.headerActions}>
            <a className="button" href={repo.url} target="_blank" rel="noreferrer">
              Open on GitHub
              <Icon name="external" size={13} />
            </a>
            <button
              className="button buttonQuiet"
              onClick={onClose}
              ref={closeRef}
              aria-label="Close history"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        </header>

        <div className={styles.tabs} role="group" aria-label="History view">
          <button
            className={styles.tab}
            aria-pressed={tab === "commits"}
            onClick={() => setTab("commits")}
          >
            Commits
          </button>
          <button
            className={styles.tab}
            aria-pressed={tab === "pulls"}
            onClick={() => setTab("pulls")}
          >
            Pull requests
          </button>
        </div>

        <div className={styles.body}>
          {tab === "commits" ? (
            <div
              className={styles.panel}
              role="group"
              aria-label="Commit history"
              aria-busy={commits.status === "loading"}
            >
              {commits.status === "error" ? (
                <div className={styles.errorRow}>
                  <p className={styles.error}>{commits.error}</p>
                  <button
                    className="button"
                    onClick={() =>
                      void loadCommits(commits.items.length === 0 ? 1 : commits.page + 1)
                    }
                  >
                    Try again
                  </button>
                </div>
              ) : null}

              {commits.status === "loading" && commits.items.length === 0 ? (
                <div className={styles.loading}>
                  <span className={styles.loadingRail} aria-hidden="true" />
                  <span>Reading commits...</span>
                </div>
              ) : null}

              {tree.commits.length > 0 ? (
                <CommitTree
                  commits={tree.commits}
                  localCount={tree.localCount}
                  repoUrl={repo.url}
                  refs={refs}
                />
              ) : commits.status === "ready" ? (
                <p className={styles.muted}>No commits on {repo.defaultBranch} yet.</p>
              ) : null}

              {local && unpushedTotal > 0 && local.unpushed.length === 0 ? (
                <p className={styles.note}>
                  Unpushed commits could not be read from the local repository.
                </p>
              ) : null}

              {local && unpushedTotal > local.unpushed.length ? (
                <p className={styles.note}>
                  Showing the newest {local.unpushed.length} of {unpushedTotal} unpushed
                  commits.
                </p>
              ) : null}

              {commits.hasMore ? (
                <button
                  className={`button ${styles.loadMore}`}
                  onClick={() => void loadCommits(commits.page + 1)}
                  disabled={commits.status === "loading"}
                >
                  {commits.status === "loading" ? "Loading" : "Load older commits"}
                </button>
              ) : null}
            </div>
          ) : (
            <div
              className={styles.panel}
              role="group"
              aria-label="Pull request history"
              aria-busy={pulls.status === "loading"}
            >
              <div className={styles.pullTools}>
                <div className={styles.filters} role="group" aria-label="Filter pull requests">
                  {(["all", "open", "merged", "closed"] as const).map((value) => (
                    <button
                      key={value}
                      className={styles.filter}
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      <span>{value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}</span>
                      <span className={styles.filterCount}>{pullCounts[value]}</span>
                    </button>
                  ))}
                </div>
                {pulls.items.length > 0 ? (
                  <span className={styles.filterNote}>
                    {pulls.hasMore ? `${pulls.items.length} loaded` : `${pulls.items.length} total`}
                  </span>
                ) : null}
              </div>

              {pulls.status === "error" ? (
                <div className={styles.errorRow}>
                  <p className={styles.error}>{pulls.error}</p>
                  <button
                    className="button"
                    onClick={() =>
                      void loadPulls(pulls.items.length === 0 ? 1 : pulls.page + 1)
                    }
                  >
                    Try again
                  </button>
                </div>
              ) : null}
              {pulls.status === "loading" && pulls.items.length === 0 ? (
                <p className={styles.muted}>Loading pull requests...</p>
              ) : null}

              {visiblePulls.length > 0 ? (
                <ol className={styles.pulls}>
                  {visiblePulls.map((pull) => (
                    <li className={styles.pull} data-state={stateTone(pull)} key={pull.number}>
                      <button
                        className={styles.pullSummary}
                        aria-expanded={expanded === pull.number}
                        onClick={() => togglePull(pull.number)}
                      >
                        <span className={styles.pullRail} aria-hidden="true">
                          <span className={styles.pullDot} />
                        </span>
                        <span className={styles.pullNumber}>#{pull.number}</span>
                        <span className={styles.pullTitle}>{pull.title}</span>
                        <span className={styles.state} data-state={stateTone(pull)}>
                          {stateLabel(pull)}
                        </span>
                        <span className={styles.pullMeta}>
                          {pull.author} · {pull.head} → {pull.base} · updated{" "}
                          {formatAge(pull.updatedAt)}
                        </span>
                      </button>

                      {expanded === pull.number ? (
                        <div className={styles.pullDetail}>
                          {detail?.number === pull.number ? (
                            detail.status === "loading" ? (
                              <p className={styles.muted}>Loading commits...</p>
                            ) : detail.status === "error" ? (
                              <div className={styles.errorRow}>
                                <p className={styles.error}>{detail.error}</p>
                                <button
                                  className="button"
                                  onClick={() => void loadPull(pull.number)}
                                >
                                  Try again
                                </button>
                              </div>
                            ) : detail.data ? (
                              <>
                                <div className={styles.stats}>
                                  <span className={styles.additions}>
                                    +{formatLines(detail.data.pullRequest.additions)}
                                  </span>
                                  <span className={styles.deletions}>
                                    −{formatLines(detail.data.pullRequest.deletions)}
                                  </span>
                                  <span>
                                    {detail.data.pullRequest.changedFiles}{" "}
                                    {plural(detail.data.pullRequest.changedFiles, "file")}
                                  </span>
                                  <span>
                                    {detail.data.pullRequest.commitCount}{" "}
                                    {plural(detail.data.pullRequest.commitCount, "commit")}
                                  </span>
                                  <span>
                                    {detail.data.pullRequest.comments}{" "}
                                    {plural(detail.data.pullRequest.comments, "comment")}
                                  </span>
                                </div>
                                {detail.data.commits.length > 0 ? (
                                  <>
                                    <p className={styles.panelLabel}>commits</p>
                                    <CommitTree
                                      commits={[...detail.data.commits].reverse()}
                                      repoUrl={repo.url}
                                    />
                                  </>
                                ) : (
                                  <p className={styles.muted}>No commits in this pull request.</p>
                                )}
                                {detail.data.truncated ? (
                                  <p className={styles.note}>
                                    Showing the first 100 commits. Open GitHub for the rest.
                                  </p>
                                ) : null}
                                <a
                                  className={styles.pullLink}
                                  href={detail.data.pullRequest.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open pull request
                                  <Icon name="external" size={12} />
                                </a>
                              </>
                            ) : null
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : pulls.status === "ready" ? (
                <p className={styles.muted}>
                  {pulls.items.length === 0
                    ? "No pull requests yet."
                    : `No ${filter} pull requests in the ${pulls.items.length} loaded.`}
                </p>
              ) : null}

              {pulls.hasMore ? (
                <button
                  className={`button ${styles.loadMore}`}
                  onClick={() => void loadPulls(pulls.page + 1)}
                  disabled={pulls.status === "loading"}
                >
                  {pulls.status === "loading" ? "Loading" : "Load older pull requests"}
                </button>
              ) : null}
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <span>Read-only GitHub data</span>
          <span>Unpushed commits are read locally and stay on this machine.</span>
        </footer>
      </div>
    </div>
  );
}
