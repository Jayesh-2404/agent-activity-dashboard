import type { RepositoryView } from "@/lib/activity-types";
import { formatAge, shortSha } from "@/lib/format";
import styles from "./main-line.module.css";

export function MainLine({
  repositories,
  newRepos,
  changedItemCount,
  onMarkSeen,
}: {
  repositories: RepositoryView[];
  newRepos: string[];
  changedItemCount: number;
  onMarkSeen: () => void;
}) {
  const newSet = new Set(newRepos);
  const unseenCount = newRepos.length + changedItemCount;

  return (
    <section className={styles.mainLine} aria-labelledby="main-line-title">
      <div className={styles.header}>
        <h2 className={styles.title} id="main-line-title">
          Latest on main
        </h2>
        {unseenCount > 0 ? (
          <button className={styles.markSeen} onClick={onMarkSeen}>
            Mark all seen
          </button>
        ) : null}
      </div>

      {repositories.length === 0 ? (
        <p className={styles.empty}>No repository activity loaded yet.</p>
      ) : (
        <div className={styles.list}>
          {repositories.map((repo) => {
            const isNew = newSet.has(repo.fullName);
            const local = repo.local;
            const onDefaultBranch = local !== null && local.branch === repo.defaultBranch;
            const ahead = onDefaultBranch ? local.ahead : null;
            return (
              <a
                className={styles.row}
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                key={repo.id}
                title={`Open ${repo.fullName} on GitHub`}
              >
                <span className={styles.repo}>{repo.name}</span>
                <span className={styles.branchLine}>
                  <span className={styles.branch}>{repo.defaultBranch}</span>
                  <span className={styles.sha}>{repo.latestSha ? shortSha(repo.latestSha) : "no sha"}</span>
                  {ahead !== null && ahead > 0 ? (
                    <span
                      className={styles.unpushed}
                      title={`${ahead} unpushed ${ahead === 1 ? "commit" : "commits"} on this machine`}
                    >
                      +{ahead} local
                    </span>
                  ) : null}
                </span>
                <span className={styles.time}>{formatAge(repo.pushedAt)}</span>
                {isNew ? <span className={styles.new}>New</span> : <span className={styles.spacer} />}
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
