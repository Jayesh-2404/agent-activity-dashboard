"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { WorkItem as WorkItemType } from "@/lib/activity-types";
import {
  formatAge,
  formatLines,
  repositoryBranchUrl,
  shortSha,
  statusLabel,
  statusTone,
} from "@/lib/format";
import styles from "./work-item.module.css";

function checksLabel(item: WorkItemType): string {
  if (!item.pull) return item.branch.pullRequest ? "not loaded" : "not reported";
  const labels = {
    success: "passing",
    failure: "failing",
    pending: "running",
    none: "none reported",
    unknown: "not loaded",
  };
  return labels[item.pull.checkState];
}

export function WorkItem({ item }: { item: WorkItemType }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const tone = statusTone(item.attention);
  const pullNumber = item.branch.pullRequest?.number ?? null;
  const unloadedPull = !item.pull && pullNumber !== null;
  const status = unloadedPull ? "PR not loaded" : statusLabel(item.attention);
  const title =
    item.pull?.title ??
    item.branch.commits[0]?.message ??
    (pullNumber ? `Pull request #${pullNumber}` : "Branch work");
  const href =
    item.pull?.url ??
    (pullNumber
      ? `${item.repo.url}/pull/${pullNumber}`
      : repositoryBranchUrl(item.repo.url, item.branch.name));
  const action = item.pull ? "Review on GitHub" : unloadedPull ? "Open pull request" : "Open branch";
  const lines = item.lines > 0 ? `${formatLines(item.lines)} lines` : null;
  const files = item.files > 0 ? `${item.files} ${item.files === 1 ? "file" : "files"}` : null;
  const checkCount = item.pull?.checkCount ? ` (${item.pull.checkCount})` : "";
  const diffWidth = Math.min(100, (item.lines / 1000) * 100);

  return (
    <li className={styles.item} data-tone={tone}>
      <div className={styles.row}>
        <span className={styles.dot} aria-hidden="true" />

        <div className={styles.body}>
          <div className={styles.topline}>
            <span className={styles.repo}>{item.repo.name}</span>
            <span className={styles.branch}>{item.branch.name}</span>
          </div>
          <h3 className={styles.title}>{title}</h3>
          <div className={styles.meta}>
            <span className={styles.status}>{status}</span>
            {item.attention !== "checks-failing" && item.pull?.checkState === "failure" ? (
              <span className={styles.checkFail}>checks failing</span>
            ) : null}
            {lines ? <span>{lines}</span> : null}
            {files ? <span>{files}</span> : null}
            <span>{formatAge(item.updatedAt)}</span>
          </div>
        </div>

        <div className={styles.actions}>
          <a className={styles.actionLink} href={href} target="_blank" rel="noreferrer">
            {action}
            <Icon name="external" size={13} />
          </a>
          <button
            className={styles.detailsButton}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? "Hide details" : "Details"}
            <Icon
              name="chevron"
              size={13}
              className={open ? styles.chevronOpen : styles.chevron}
            />
          </button>
        </div>

        {item.lines > 0 ? (
          <div className={styles.diff} aria-hidden="true">
            <span
              className={styles.diffFill}
              data-large={item.lines >= 500}
              style={{ width: `${diffWidth}%` }}
            />
          </div>
        ) : null}
      </div>

      {open ? (
        <div className={styles.panel} id={panelId} role="region" aria-label={`Details for ${title}`}>
          <div className={styles.panelGrid}>
            <div>
              <p className={styles.panelTitle}>commits</p>
              {item.branch.commits.length > 0 ? (
                <ol className={styles.commits}>
                  {item.branch.commits.slice(0, 3).map((commit) => (
                    <li className={styles.commit} key={commit.sha}>
                      <span className={styles.commitSha}>{shortSha(commit.sha)}</span>
                      <span className={styles.commitBody}>
                        <span className={styles.commitMessage}>{commit.message}</span>
                        <span className={styles.commitMeta}>
                          {commit.author} · {formatAge(commit.date)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.panelEmpty}>Commit details were not loaded for this branch.</p>
              )}
            </div>

            <div>
              <p className={styles.panelTitle}>review</p>
              <dl className={styles.facts}>
                <div className={styles.fact}>
                  <dt>state</dt>
                  <dd>{status}</dd>
                </div>
                <div className={styles.fact}>
                  <dt>checks</dt>
                  <dd>
                    {checksLabel(item)}
                    {checkCount}
                  </dd>
                </div>
                <div className={styles.fact}>
                  <dt>reviewers</dt>
                  <dd>
                    {item.pull?.reviewers.length
                      ? item.pull.reviewers.join(", ")
                      : unloadedPull
                        ? "not loaded"
                        : "none requested"}
                  </dd>
                </div>
                <div className={styles.fact}>
                  <dt>base</dt>
                  <dd>{item.pull?.base ?? item.repo.defaultBranch}</dd>
                </div>
                {item.files > 0 ? (
                  <div className={styles.fact}>
                    <dt>changed</dt>
                    <dd>{item.files} files</dd>
                  </div>
                ) : null}
              </dl>
              {unloadedPull ? (
                <p className={styles.panelEmpty}>
                  Pull request #{pullNumber} was not loaded. Open GitHub to review it.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
