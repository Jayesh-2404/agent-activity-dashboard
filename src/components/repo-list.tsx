"use client";

import { Icon } from "@/components/ui/icon";
import type {
  LocalState,
  Repository,
  RepositoryResult,
  RepositoryView,
} from "@/lib/activity-types";
import { deploymentLabel, formatAge, shortSha } from "@/lib/format";
import styles from "./repo-list.module.css";

function deploymentTone(
  deployment: RepositoryView["deployment"],
): "signal" | "clear" | "hold" | "muted" {
  if (!deployment) return "muted";
  if (deployment.matchesMain === false) return "hold";
  if (deployment.state === "success") return "clear";
  if (deployment.state === "failure" || deployment.state === "error") return "signal";
  return "hold";
}

function localAheadLabel(local: LocalState): string {
  if (local.ahead === null) return "no upstream";
  if (local.ahead === 0) {
    return local.behind !== null && local.behind > 0 ? "0 unpushed" : "in sync";
  }
  return `${local.ahead} unpushed`;
}

export function RepoList({
  selectedRepos,
  repositories,
  results,
  onManage,
  onHistory,
}: {
  selectedRepos: Repository[];
  repositories: RepositoryView[];
  results: RepositoryResult[];
  onManage: () => void;
  onHistory: (repo: RepositoryView) => void;
}) {
  const dataByFullName = new Map(repositories.map((repo) => [repo.fullName, repo]));
  const errorByFullName = new Map(
    results
      .filter((result) => result.error)
      .map((result) => [result.repository?.fullName ?? result.name ?? "", result.error ?? ""]),
  );
  const localByFullName = new Map(
    results.flatMap((result) =>
      result.local
        ? [[result.repository?.fullName ?? result.name ?? "", result.local] as const]
        : [],
    ),
  );
  const localErrorByFullName = new Map(
    results.flatMap((result) =>
      result.localError
        ? [[result.repository?.fullName ?? result.name ?? "", result.localError] as const]
        : [],
    ),
  );
  const anyTruncated = repositories.some(
    (repo) => repo.truncatedBranches || repo.pullRequestsTruncated,
  );

  return (
    <main className={styles.repos}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Repositories</h1>
          <p className={styles.subtitle}>
            What each watched repository is doing right now.
          </p>
        </div>
        <button className="button" onClick={onManage}>
          <Icon name="plus" size={14} />
          Manage
        </button>
      </header>

      {selectedRepos.length === 0 ? (
        <section className={styles.empty}>
          <h2 className={styles.emptyTitle}>No repositories watched yet.</h2>
          <p className={styles.emptyText}>
            Add the repositories your agents are working in. The queue and this page will
            follow their branches, pull requests, checks, and deployments.
          </p>
          <button className="button buttonPrimary" onClick={onManage}>
            <Icon name="plus" size={14} />
            Choose repositories
          </button>
        </section>
      ) : (
        <div className={styles.list}>
          {selectedRepos.map((repo) => {
            const data = dataByFullName.get(repo.fullName);
            const problem = errorByFullName.get(repo.fullName);
            const aheadCount = data
              ? data.branches.filter((branch) => branch.ahead > 0).length
              : 0;
            const aheadLabel = data
              ? `${aheadCount}${data.truncatedBranches ? "+" : ""}`
              : "not loaded";
            const openPrs = data ? (data.openPullCount ?? data.pullRequests.length) : null;
            const deployment = data?.deployment ?? null;
            const tone = deploymentTone(deployment);
            const local = data?.local ?? localByFullName.get(repo.fullName) ?? null;
            const localError =
              data?.localError ?? localErrorByFullName.get(repo.fullName) ?? null;

            return (
              <article className={styles.row} key={repo.id}>
                <div className={styles.identity}>
                  <div className={styles.nameLine}>
                    <span className={styles.name}>{repo.name}</span>
                    {repo.private ? <span className={styles.private}>private</span> : null}
                    {repo.stars > 0 ? (
                      <span className={styles.stars}>{repo.stars} stars</span>
                    ) : null}
                  </div>
                  <p className={styles.description}>
                    {repo.description ?? "No description."}
                  </p>
                  {problem ? (
                    <p className={styles.problem} role="status">
                      <Icon name="alert" size={13} />
                      {problem}
                    </p>
                  ) : null}
                </div>

                <dl className={styles.facts}>
                  <div className={styles.fact}>
                    <dt>default</dt>
                    <dd>
                      {data?.defaultBranch ?? repo.defaultBranch}
                      {data?.latestSha ? (
                        <span className={styles.sha}> {shortSha(data.latestSha)}</span>
                      ) : null}
                    </dd>
                  </div>
                  {local ? (
                    <div
                      className={styles.fact}
                      data-tone={local.ahead !== null && local.ahead > 0 ? "hold" : "muted"}
                    >
                      <dt>local</dt>
                      <dd>
                        {local.branch ?? "detached"}{" "}
                        <span className={styles.sha}>
                          {local.headSha ? shortSha(local.headSha) : "no commits"}
                        </span>
                        <span className={styles.separator}> · </span>
                        {localAheadLabel(local)}
                        {local.behind !== null && local.behind > 0
                          ? ` · ${local.behind} behind`
                          : ""}
                        {local.dirty.changed + local.dirty.untracked > 0
                          ? ` · ${local.dirty.changed + local.dirty.untracked} uncommitted`
                          : ""}
                      </dd>
                    </div>
                  ) : null}
                  {!local && localError ? (
                    <div className={styles.fact} data-tone="hold">
                      <dt>local</dt>
                      <dd>unreadable ({localError})</dd>
                    </div>
                  ) : null}
                  <div className={styles.fact}>
                    <dt>work</dt>
                    <dd>
                      {aheadLabel} branches ahead
                      <span className={styles.separator}> · </span>
                      {openPrs === null ? "PRs not loaded" : `${openPrs} open ${openPrs === 1 ? "PR" : "PRs"}`}
                    </dd>
                  </div>
                  <div className={styles.fact} data-tone={tone}>
                    <dt>deploy</dt>
                    <dd>
                      {deployment
                        ? `${deploymentLabel(deployment.state)} on ${deployment.environment}`
                        : "No deployment"}
                      {deployment ? (
                        <span className={styles.deployAge}> · {formatAge(deployment.date)}</span>
                      ) : null}
                      {deployment?.matchesMain === false ? (
                        <span className={styles.deployWarning}>main moved after deploy</span>
                      ) : null}
                    </dd>
                  </div>
                </dl>

                <div className={styles.actions}>
                  <button
                    className={styles.history}
                    aria-label={`History for ${repo.fullName}`}
                    onClick={() => {
                      if (data) onHistory(data);
                    }}
                    disabled={!data}
                    title={data ? "View commits and pull requests" : "History loads with the repository"}
                  >
                    History
                  </button>
                  <a
                    className={styles.open}
                    href={repo.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                    <Icon name="external" size={13} />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {anyTruncated ? (
        <p className={styles.note}>
          Branch details load for the first 5 branches and 2 pull requests per repository.
          Open GitHub for the rest.
        </p>
      ) : null}

      <footer className={styles.footer}>
        <span>{selectedRepos.length} watched</span>
        <span>Read-only GitHub App access</span>
      </footer>
    </main>
  );
}
