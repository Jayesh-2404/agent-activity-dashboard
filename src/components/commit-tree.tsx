"use client";

import { useMemo } from "react";
import { buildCommitGraph, type GraphCommit } from "@/lib/commit-graph";
import { formatAge, shortSha } from "@/lib/format";
import styles from "./commit-tree.module.css";

export type CommitRef = {
  sha: string;
  label: string;
  tone: "local" | "remote";
};

const ROW_HEIGHT = 60;
const LANE_WIDTH = 16;
const GRAPH_PAD = 6;

function laneX(lane: number): number {
  return GRAPH_PAD + LANE_WIDTH / 2 + lane * LANE_WIDTH;
}

function toneFor(lane: number, local: boolean): "main" | "side" | "local" {
  if (local) return "local";
  return lane === 0 ? "main" : "side";
}

export function CommitTree({
  commits,
  localCount = 0,
  repoUrl,
  refs = [],
}: {
  commits: GraphCommit[];
  localCount?: number;
  repoUrl: string;
  refs?: CommitRef[];
}) {
  const graph = useMemo(
    () => buildCommitGraph(commits, { localCount }),
    [commits, localCount],
  );

  if (graph.rows.length === 0) return null;

  const width = GRAPH_PAD * 2 + graph.laneCount * LANE_WIDTH;
  const refLabels = new Map<string, CommitRef[]>();
  for (const ref of refs) {
    const list = refLabels.get(ref.sha) ?? [];
    list.push(ref);
    refLabels.set(ref.sha, list);
  }

  return (
    <ol className={styles.tree}>
      {graph.rows.map((row, index) => {
        const local = row.commit.local === true;
        const labels = refLabels.get(row.commit.sha) ?? [];
        const isHead = labels.length > 0;

        return (
          <li className={styles.row} key={row.commit.sha}>
            <span className={styles.graph} style={{ width }} aria-hidden="true">
              <svg
                width={width}
                height={ROW_HEIGHT}
                viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
                focusable="false"
              >
                {row.breakBefore ? (
                  <line
                    className={styles.breakLine}
                    x1={0}
                    x2={width}
                    y1={6}
                    y2={6}
                  />
                ) : null}

                {index > 0 && !row.breakBefore ? (
                  <line
                    className={styles.line}
                    data-tone={toneFor(row.lane, local)}
                    x1={laneX(row.lane)}
                    x2={laneX(row.lane)}
                    y1={0}
                    y2={ROW_HEIGHT / 2}
                  />
                ) : null}

                {row.passes.map((lane) => (
                  <line
                    key={`pass-${lane}`}
                    className={styles.line}
                    data-tone={toneFor(lane, local)}
                    x1={laneX(lane)}
                    x2={laneX(lane)}
                    y1={0}
                    y2={ROW_HEIGHT}
                  />
                ))}

                {row.ends.map((lane) => (
                  <line
                    key={`end-${lane}`}
                    className={styles.line}
                    data-tone={toneFor(lane, local)}
                    x1={laneX(lane)}
                    x2={laneX(lane)}
                    y1={0}
                    y2={ROW_HEIGHT / 2}
                  />
                ))}

                {row.edges.map((edge) => {
                  const from = laneX(row.lane);
                  const to = laneX(edge.lane);
                  const tone = toneFor(edge.lane, local);
                  return edge.lane === row.lane ? (
                    <line
                      key={`edge-${edge.lane}`}
                      className={styles.line}
                      data-tone={tone}
                      x1={from}
                      x2={to}
                      y1={ROW_HEIGHT / 2}
                      y2={ROW_HEIGHT}
                    />
                  ) : (
                    <path
                      key={`edge-${edge.lane}`}
                      className={styles.line}
                      data-tone={tone}
                      d={`M ${from} ${ROW_HEIGHT / 2} C ${from} ${ROW_HEIGHT / 2 + 18}, ${to} ${ROW_HEIGHT - 18}, ${to} ${ROW_HEIGHT}`}
                    />
                  );
                })}

                {isHead ? (
                  <circle
                    className={styles.headRing}
                    cx={laneX(row.lane)}
                    cy={ROW_HEIGHT / 2}
                    r={6.5}
                  />
                ) : null}

                <circle
                  className={styles.node}
                  data-local={local ? "true" : undefined}
                  data-merge={row.edges.some((edge) => edge.merge) ? "true" : undefined}
                  cx={laneX(row.lane)}
                  cy={ROW_HEIGHT / 2}
                  r={4}
                />
              </svg>
            </span>

            <a
              className={styles.commit}
              href={`${repoUrl}/commit/${row.commit.sha}`}
              target="_blank"
              rel="noreferrer"
              title={`${shortSha(row.commit.sha)} · ${row.commit.message}`}
              aria-label={`Open commit ${shortSha(row.commit.sha)}: ${row.commit.message}`}
            >
              <span className={styles.message}>{row.commit.message}</span>
              {labels.length > 0 ? (
                <span className={styles.refs}>
                  {labels.map((label) => (
                    <span className={styles.ref} data-tone={label.tone} key={`${label.tone}-${label.label}`}>
                      {label.label}
                    </span>
                  ))}
                </span>
              ) : null}
              <span className={styles.meta}>
                <span className={styles.sha}>{shortSha(row.commit.sha)}</span>
                <span className={styles.author}>{row.commit.author}</span>
                {row.commit.date ? <span>{formatAge(row.commit.date)}</span> : null}
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}
