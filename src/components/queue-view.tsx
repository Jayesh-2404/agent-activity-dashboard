"use client";

import { Icon } from "@/components/ui/icon";
import { MainLine } from "@/components/main-line";
import { WorkItem } from "@/components/work-item";
import { partitionWorkItems } from "@/lib/activity-model";
import type { QueueSummary, RepositoryResult, RepositoryView, WorkItem as WorkItemType } from "@/lib/activity-types";
import { formatAge, queueHeadline, queueTriage, shortSha } from "@/lib/format";
import styles from "./queue-view.module.css";

export function QueueView({
  items,
  summary,
  repositories,
  selectedCount,
  errors,
  lastUpdated,
  newRepos,
  changedItems,
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
  changedItems: string[];
  refreshing: boolean;
  error: string;
  onRefresh: () => void;
  onRetry: () => void;
  onAddRepos: () => void;
  onMarkSeen: () => void;
}) {
  const { waiting, inFlight } = partitionWorkItems(items);
  const changedItemSet = new Set(changedItems);
  const truncated = repositories.some((repo) => repo.pullRequestsTruncated || repo.truncatedBranches);
  const empty = items.length === 0;
  const localRepositories = repositories.filter((repo) => repo.local !== null);
  const localBranchCount = localRepositories.reduce(
    (count, repo) => count + (repo.local?.branches.length ?? 0),
    0,
  );

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
        <MainLine
          repositories={repositories}
          newRepos={newRepos}
          changedItemCount={changedItems.length}
          onMarkSeen={onMarkSeen}
        />
      ) : null}

      <section className={styles.localActivity} aria-labelledby="local-activity-title">
        <div className={styles.groupHeading}>
          <h2 className={styles.groupTitle} id="local-activity-title">
            Local branches ahead of default branch
          </h2>
          <span className={styles.groupCount}>{localBranchCount}</span>
        </div>
        {localRepositories.length === 0 ? (
          <p className={styles.localEmpty}>
            Link a local clone from Repositories to see agent branches and commits ahead of the default branch.
          </p>
        ) : localBranchCount === 0 ? (
          <p className={styles.localEmpty}>
            {localRepositories.some((repo) => !repo.local?.baseBranch)
              ? "Could not find the default branch locally. Fetch it or create a local tracking branch to compare activity."
              : "No local branches have commits ahead of the default branch."}
          </p>
        ) : (
          <div className={styles.localRepos}>
            {localRepositories.map((repo) => {
              const local = repo.local;
              if (!local || local.branches.length === 0) return null;
              return (
                <div className={styles.localRepo} key={repo.fullName}>
                  <div className={styles.localRepoHeading}>
                    <span>{repo.fullName}</span>
                    <span>compared with {local.baseBranch ?? repo.defaultBranch}</span>
                  </div>
                  <ul className={styles.localBranches}>
                    {local.branches.map((branch) => (
                      <li className={styles.localBranch} key={branch.name}>
                        <div className={styles.localBranchHeading}>
                          <span className={styles.localBranchName}>{branch.name}</span>
                          <span className={styles.localAhead}>
                            {branch.ahead} {branch.ahead === 1 ? "commit" : "commits"} ahead
                          </span>
                          {branch.behind > 0 ? (
                            <span className={styles.localBehind}>{branch.behind} behind</span>
                          ) : null}
                          {branch.current ? <span className={styles.localCurrent}>checked out</span> : null}
                        </div>
                        {branch.commits.length > 0 ? (
                          <ol className={styles.localCommits}>
                            {branch.commits.map((commit) => (
                              <li key={commit.sha}>
                                <div className={styles.localCommit}>
                                  <code>{shortSha(commit.sha)}</code>
                                  <span>{commit.message}</span>
                                </div>
                              </li>
                            ))}
                            {branch.ahead > branch.commits.length ? (
                              <li className={styles.localMore}>
                                Showing {branch.commits.length} of {branch.ahead} commits
                              </li>
                            ) : null}
                          </ol>
                        ) : branch.ahead === 0 ? (
                          <p className={styles.localDirty}>Uncommitted work on this branch</p>
                        ) : (
                          <p className={styles.localDirty}>Commit details are unavailable</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {local.branchesTruncated ? (
                    <p className={styles.localMore}>Showing the 25 most recently active local branches.</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

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
              <WorkItem item={item} key={item.id} changed={changedItemSet.has(item.id)} />
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
              <WorkItem item={item} key={item.id} changed={changedItemSet.has(item.id)} />
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
