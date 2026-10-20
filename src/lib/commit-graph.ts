import type { Commit } from "@/lib/activity-types";

export type GraphCommit = Commit & { local?: boolean };

export type GraphEdge = {
  lane: number;
  merge: boolean;
};

export type GraphRow = {
  commit: GraphCommit;
  lane: number;
  passes: number[];
  ends: number[];
  edges: GraphEdge[];
  breakBefore: boolean;
};

export type CommitGraph = {
  rows: GraphRow[];
  laneCount: number;
};

export type GraphOptions = {
  localCount?: number;
  maxLanes?: number;
};

export function buildCommitGraph(
  commits: GraphCommit[],
  options: GraphOptions = {},
): CommitGraph {
  const maxLanes = Math.max(2, options.maxLanes ?? 6);
  const localCount = Math.min(Math.max(0, options.localCount ?? 0), commits.length);
  const rows: GraphRow[] = [];
  let lanes: Array<string | null> = [];
  let maxLane = 0;

  for (let index = 0; index < commits.length; index += 1) {
    const commit = commits[index];
    if (!commit) continue;
    let breakBefore = false;

    if (localCount > 0 && index === localCount) {
      const remoteShas = new Set(commits.slice(localCount).map((item) => item.sha));
      const activeBefore = lanes.filter(Boolean).length;
      const filtered = lanes.map((sha) => (sha && remoteShas.has(sha) ? sha : null));
      if (activeBefore > 0 && filtered.every((sha) => sha === null)) breakBefore = true;
      lanes = filtered;
    }

    const before = lanes.slice();
    const activeBefore = before
      .map((sha, lane) => (sha === null ? -1 : lane))
      .filter((lane) => lane !== -1);

    let lane = lanes.indexOf(commit.sha);
    if (lane === -1) {
      lane = lanes.indexOf(null);
      if (lane === -1) lane = Math.min(lanes.length, maxLanes - 1);
    }
    while (lanes.length <= lane) lanes.push(null);
    lanes[lane] = null;

    const parents =
      commit.parents ??
      (index + 1 < commits.length && commits[index + 1] ? [commits[index + 1].sha] : []);
    const edges: GraphEdge[] = [];

    for (let parentIndex = 0; parentIndex < Math.min(parents.length, 3); parentIndex += 1) {
      const parent = parents[parentIndex];
      if (!parent) continue;

      let target = lanes.indexOf(parent);
      if (target === -1) {
        if (parentIndex === 0) {
          target = lane;
        } else {
          target = lanes.indexOf(null);
          if (target === -1) {
            if (lanes.length < maxLanes) {
              target = lanes.length;
              lanes.push(null);
            } else {
              target = maxLanes - 1;
            }
          }
        }
      }
      while (lanes.length <= target) lanes.push(null);
      lanes[target] = parent;
      if (!edges.some((edge) => edge.lane === target)) {
        edges.push({ lane: target, merge: parentIndex > 0 });
      }
    }

    const activeAfter = lanes
      .map((sha, laneIndex) => (sha === null ? -1 : laneIndex))
      .filter((laneIndex) => laneIndex !== -1);
    const passes = activeBefore.filter(
      (laneIndex) => laneIndex !== lane && activeAfter.includes(laneIndex),
    );
    const ends = activeBefore.filter(
      (laneIndex) => laneIndex !== lane && !activeAfter.includes(laneIndex),
    );

    for (const laneIndex of [...activeBefore, ...activeAfter, ...edges.map((edge) => edge.lane)]) {
      if (laneIndex > maxLane) maxLane = laneIndex;
    }

    rows.push({ commit, lane, passes, ends, edges, breakBefore });
  }

  return {
    rows,
    laneCount: Math.max(1, Math.min(maxLanes, maxLane + 1)),
  };
}
