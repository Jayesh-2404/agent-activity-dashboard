"use client";

import { Icon } from "@/components/ui/icon";
import { MainLine } from "@/components/main-line";
import { WorkItem } from "@/components/work-item";
import { partitionWorkItems } from "@/lib/activity-model";
import type { QueueSummary, RepositoryResult, RepositoryView, WorkItem as WorkItemType } from "@/lib/activity-types";
import { formatAge, queueHeadline, queueTriage } from "@/lib/format";
import styles from "./queue-view.module.css";

export function QueueView({
  items,
  summary,
  repositories,
  selectedCount,
  errors,
  lastUpdated,
  newRepos,
  refreshing,
  error,
  onRefresh,
  onRetry,
  onAddRepos,
  onMarkSeen,
}: {
  items: WorkItemType[];
  summary: QueueSummary;
  repositories: RepositoryView[];
  selectedCount: number;
  errors: RepositoryResult[];
  lastUpdated: Date | null;
  newRepos: string[];
  refreshing: boolean;
  error: string;
  onRefresh: () => void;
  onRetry: () => void;
  onAddRepos: () => void;
  onMarkSeen: () => void;
}) {
  const { waiting, inFlight } = partitionWorkItems(items);
  const truncated = repositories.some((repo) => repo.pullRequestsTruncated || repo.truncatedBranches);
  const empty = items.length === 0;

  return (
    <main className={styles.queue}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{queueHeadline(summary)}</h1>
          <p className={styles.triage}>{queueTriage(summary)}</p>
        </div>
        <div className={styles.headerActions}>
          <button className="button" onClick={onAddRepos}>
            <Icon name="plus" size={14} />
            Add repositories
          </button>
        </div>
      </header>

      {error ? (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button className={styles.errorAction} onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}

      {repositories.length > 0 ? (
        <MainLine repositories={repositories} newRepos={newRepos} onMarkSeen={onMarkSeen} />
      ) : null}

      {empty ? (
        <section className={styles.empty} aria-labelledby="empty-title">
          <h2 className={styles.emptyTitle} id="empty-title">
            {selectedCount === 0 ? "Choose a repository to follow." : "No open work right now."}
          </h2>
          <p className={styles.emptyText}>
            {selectedCount === 0
              ? "Add the repositories your agents are working in. The queue will show branches, pull requests, checks, and the main line in one place."
              : "No open pull requests and no branches ahead of main. Check again after the next push."}
          </p>
          {selectedCount === 0 ? (
            <button className="button buttonPrimary" onClick={onAddRepos}>
              <Icon name="plus" size={14} />
              Choose repositories
            </button>
          ) : (
            <button className="button" onClick={onRefresh} disabled={refreshing}>
              <Icon name="refresh" size={14} className={refreshing ? "spin" : undefined} />
              {refreshing ? "Checking" : "Check again"}
            </button>
          )}
        </section>
      ) : null}

      {waiting.length > 0 ? (
        <section className={styles.group} aria-labelledby="waiting-title">
          <div className={styles.groupHeading}>
            <h2 className={styles.groupTitle} id="waiting-title">
              Waiting on you
            </h2>
            <span className={styles.groupCount}>{waiting.length}</span>
          </div>
          <ul>
            {waiting.map((item) => (
              <WorkItem item={item} key={item.id} />
            ))}
          </ul>
        </section>
      ) : null}

      {!empty && waiting.length === 0 ? (
        <p className={styles.quiet}>Nothing is waiting on you. Here is what is still moving.</p>
      ) : null}

      {inFlight.length > 0 ? (
        <section className={styles.group} aria-labelledby="inflight-title">
          <div className={styles.groupHeading}>
            <h2 className={styles.groupTitle} id="inflight-title">
              In flight
            </h2>
            <span className={styles.groupCount}>{inFlight.length}</span>
          </div>
          <ul>
            {inFlight.map((item) => (
              <WorkItem item={item} key={item.id} />
            ))}
          </ul>
        </section>
      ) : null}

      {truncated ? (
        <p className={styles.limitNote}>
          Showing the first 5 branches and 2 pull requests per repository. Open GitHub for the rest.
        </p>
      ) : null}

      {errors.length > 0 ? (
        <section className={styles.errors} aria-label="Repository errors">
          <p className={styles.errorsTitle}>Some repositories did not load</p>
          {errors.map((result) => (
            <p className={styles.repoError} key={result.name ?? result.error}>
              <strong>{result.name}</strong>
              <span>{result.error}</span>
            </p>
          ))}
        </section>
      ) : null}

      <footer className={styles.footer}>
        <span>{lastUpdated ? `checked ${formatAge(lastUpdated.toISOString())}` : "not checked yet"}</span>
        <span>Read-only GitHub App access</span>
      </footer>
    </main>
  );
}
