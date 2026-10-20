"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function stateLabel(pull: PullHistoryItem): string {
  return pull.state === "open" && pull.draft ? "draft" : pull.state;
}

function CommitRow({ commit, tag }: { commit: Commit; tag?: string }) {
  return (
    <li className={styles.commit}>
      <span className={styles.commitSha}>{shortSha(commit.sha)}</span>
      <span className={styles.commitMessage}>{commit.message}</span>
      <span className={styles.commitMeta}>
        {commit.author}
        {commit.date ? ` · ${formatAge(commit.date)}` : ""}
      </span>
      {tag ? <span className={styles.commitTag}>{tag}</span> : null}
    </li>
  );
}

export function RepoHistory({
  repo,
  onClose,
}: {
  repo: RepositoryView | null;
  onClose: () => void;
}) {
  if (!repo) return null;
  return <RepoHistoryDialog repo={repo} onClose={onClose} />;
}

function RepoHistoryDialog({
  repo,
  onClose,
}: {
  repo: RepositoryView;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const [tab, setTab] = useState<Tab>("commits");
  const [filter, setFilter] = useState<Filter>("all");
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

  const local = repo.local;
  const unpushedTotal = local ? (local.ahead ?? local.unpushed.length) : 0;
  const showUnpushed = local !== null && (local.unpushed.length > 0 || unpushedTotal > 0);

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
            <h2 className={styles.title} id="repo-history-title">
              {repo.name}
            </h2>
            {local ? (
              <p className={styles.localLine}>
                <span className={styles.localTag}>local</span>
                <span>{local.branch ?? "detached"}</span>
                <span>{local.headSha ? shortSha(local.headSha) : "no commits"}</span>
                <span data-tone={local.ahead !== null && local.ahead > 0 ? "hold" : "muted"}>
                  {localAhead(local)}
                </span>
                {local.behind !== null && local.behind > 0 ? (
                  <span>{local.behind} behind</span>
                ) : null}
                {local.dirty.changed > 0 ? <span>{local.dirty.changed} changed</span> : null}
                {local.dirty.untracked > 0 ? <span>{local.dirty.untracked} untracked</span> : null}
              </p>
            ) : repo.localError ? (
              <p className={styles.localLine}>
                <span className={styles.localTag}>local</span>
                <span>Mapped but unreadable on this machine ({repo.localError}).</span>
              </p>
            ) : (
              <p className={styles.localLine}>
                <span className={styles.localTag}>local</span>
                <span className={styles.muted}>
                  Not mapped on this machine. Add it to .local-repos.json to see unpushed commits.
                </span>
              </p>
            )}
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
          <button className={styles.tab} aria-pressed={tab === "commits"} onClick={() => setTab("commits")}>
            Commits
          </button>
          <button className={styles.tab} aria-pressed={tab === "pulls"} onClick={() => setTab("pulls")}>
            Pull requests
          </button>
        </div>

        {tab === "commits" ? (
          <div className={styles.panel} role="group" aria-label="Commit history">
            {showUnpushed && local ? (
              <section className={styles.section} aria-labelledby="unpushed-title">
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionTitle} id="unpushed-title">
                    Unpushed from this machine
                  </h3>
                  <span className={styles.count}>
                    {local.unpushed.length < unpushedTotal
                      ? `${local.unpushed.length} of ${unpushedTotal}`
                      : unpushedTotal}
                  </span>
                </div>
                <p className={styles.sectionNote}>
                  These commits are not on GitHub yet. Push them to add them to the remote history.
                </p>
                {local.unpushed.length > 0 ? (
                  <ol className={styles.commits}>
                    {local.unpushed.map((commit) => (
                      <CommitRow commit={commit} tag="local" key={commit.sha} />
                    ))}
                  </ol>
                ) : (
                  <p className={styles.muted}>
                    Unpushed commits could not be read from the local repository.
                  </p>
                )}
              </section>
            ) : null}

            <section className={styles.section} aria-labelledby="remote-commits-title">
              <div className={styles.sectionHead}>
                <h3 className={styles.sectionTitle} id="remote-commits-title">
                  On {repo.defaultBranch}
                </h3>
                <span className={styles.count}>GitHub</span>
              </div>
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
                <p className={styles.muted}>Loading commits...</p>
              ) : null}
              {commits.items.length > 0 ? (
                <ol className={styles.commits}>
                  {commits.items.map((commit) => (
                    <CommitRow commit={commit} key={commit.sha} />
                  ))}
                </ol>
              ) : commits.status === "ready" ? (
                <p className={styles.muted}>No commits on {repo.defaultBranch} yet.</p>
              ) : null}
              {commits.hasMore ? (
                <button
                  className="button"
                  onClick={() => void loadCommits(commits.page + 1)}
                  disabled={commits.status === "loading"}
                >
                  {commits.status === "loading" ? "Loading" : "Load older commits"}
                </button>
              ) : null}
            </section>
          </div>
        ) : (
          <div className={styles.panel} role="group" aria-label="Pull request history">
            <div className={styles.filters} role="group" aria-label="Filter pull requests">
              {(["all", "open", "merged", "closed"] as const).map((value) => (
                <button
                  key={value}
                  className={styles.filter}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
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
                  <li className={styles.pull} key={pull.number}>
                    <button
                      className={styles.pullSummary}
                      aria-expanded={expanded === pull.number}
                      onClick={() => togglePull(pull.number)}
                    >
                      <span className={styles.pullNumber}>#{pull.number}</span>
                      <span className={styles.pullTitle}>{pull.title}</span>
                      <span className={styles.state} data-state={stateLabel(pull)}>
                        {stateLabel(pull)}
                      </span>
                      <span className={styles.pullMeta}>
                        {pull.author} · {pull.head} → {pull.base} · updated {formatAge(pull.updatedAt)}
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
                              <button className="button" onClick={() => void loadPull(pull.number)}>
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
                                <ol className={styles.commits}>
                                  {detail.data.commits.map((commit) => (
                                    <CommitRow commit={commit} key={commit.sha} />
                                  ))}
                                </ol>
                              ) : (
                                <p className={styles.muted}>No commits in this pull request.</p>
                              )}
                              {detail.data.truncated ? (
                                <p className={styles.muted}>
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
                  : `No ${filter} pull requests in the first ${pulls.items.length} loaded.`}
              </p>
            ) : null}

            {pulls.hasMore ? (
              <button
                className="button"
                onClick={() => void loadPulls(pulls.page + 1)}
                disabled={pulls.status === "loading"}
              >
                {pulls.status === "loading" ? "Loading" : "Load older pull requests"}
              </button>
            ) : null}
          </div>
        )}

        <footer className={styles.footer}>
          <span>Read-only GitHub data</span>
          <span>Unpushed commits are read locally and never leave this machine.</span>
        </footer>
      </div>
    </div>
  );
}
