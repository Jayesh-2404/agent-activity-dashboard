import { describe, expect, it } from "vitest";
import { buildCommitGraph, type GraphCommit } from "./commit-graph";

function commit(sha: string, parents?: string[], local = false): GraphCommit {
  return { sha, parents, local, message: sha, author: "Ada", date: "2026-10-18T16:22:27Z" };
}

describe("buildCommitGraph", () => {
  it("draws a linear history on one lane", () => {
    const graph = buildCommitGraph([commit("c", ["b"]), commit("b", ["a"]), commit("a", [])]);

    expect(graph.laneCount).toBe(1);
    expect(
      graph.rows.map((row) => ({ lane: row.lane, edges: row.edges, passes: row.passes })),
    ).toEqual([
      { lane: 0, edges: [{ lane: 0, merge: false }], passes: [] },
      { lane: 0, edges: [{ lane: 0, merge: false }], passes: [] },
      { lane: 0, edges: [], passes: [] },
    ]);
  });

  it("opens a second lane for a merge and closes it at the shared parent", () => {
    const graph = buildCommitGraph([
      commit("m", ["a", "b"]),
      commit("a", ["c"]),
      commit("b", ["c"]),
      commit("c", ["d"]),
    ]);

    expect(graph.laneCount).toBe(2);
    expect(graph.rows.map((row) => row.lane)).toEqual([0, 0, 1, 0]);
    expect(graph.rows[0].edges).toEqual([
      { lane: 0, merge: false },
      { lane: 1, merge: true },
    ]);
    expect(graph.rows[1].passes).toEqual([1]);
    expect(graph.rows[2].passes).toEqual([0]);
    expect(graph.rows[2].edges).toEqual([{ lane: 0, merge: false }]);
  });

  it("breaks the tree when an unpushed base is outside the loaded remote page", () => {
    const graph = buildCommitGraph(
      [commit("local", ["base"], true), commit("remote", ["older"])],
      { localCount: 1 },
    );

    expect(graph.rows[1].breakBefore).toBe(true);
    expect(graph.rows[1].lane).toBe(0);
    expect(graph.rows[1].passes).toEqual([]);
  });

  it("keeps local commits attached when their base is the remote head", () => {
    const graph = buildCommitGraph(
      [commit("local", ["remote"], true), commit("remote", ["older"])],
      { localCount: 1 },
    );

    expect(graph.rows[1].breakBefore).toBe(false);
    expect(graph.rows[1].lane).toBe(0);
    expect(graph.rows[0].edges).toEqual([{ lane: 0, merge: false }]);
  });

  it("falls back to a linear parent when the source omits parents", () => {
    const graph = buildCommitGraph([commit("a"), commit("b")]);

    expect(graph.rows[0].edges).toEqual([{ lane: 0, merge: false }]);
    expect(graph.rows[1].lane).toBe(0);
  });

  it("keeps lane width inside the cap for wide merges", () => {
    const graph = buildCommitGraph(
      [
        commit("m", ["a", "b", "c", "d"]),
        commit("a", ["e"]),
        commit("b", ["e"]),
        commit("c", ["e"]),
        commit("d", ["e"]),
        commit("e", []),
      ],
      { maxLanes: 3 },
    );

    expect(graph.laneCount).toBeLessThanOrEqual(3);
    expect(graph.rows.every((row) => row.lane < 3)).toBe(true);
  });
});
