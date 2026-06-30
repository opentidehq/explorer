import Graph from "graphology";
import { describe, expect, it } from "vitest";
import {
  applyKillchainLayout,
  computeKillchainLayout,
  computeKillchainViewBBox,
  getThreatKillchain,
  positionKillchainSatellites,
  resolveKillchainStage,
  restoreBasePositions,
  snapshotBasePositions,
} from "@/lib/graph/killchain-grouping";

describe("killchain-grouping", () => {
  const vocab = {
    Persistence: {
      name: "Persistence",
      stage: "Initial Foothold",
    },
    Execution: {
      name: "Execution",
      stage: "Network Propagation",
    },
    Impact: {
      name: "Impact",
      stage: "Action on Objectives",
    },
  };

  it("reads threat killchain from body", () => {
    expect(
      getThreatKillchain({
        threat: { killchain: "Persistence" },
      }),
    ).toBe("Persistence");
    expect(
      getThreatKillchain({
        threat: { killchain: ["Execution", "Impact"] },
      }),
    ).toBe("Execution");
    expect(getThreatKillchain({ threat: {} })).toBeNull();
  });

  it("resolves macro kill chain stage", () => {
    expect(resolveKillchainStage("Persistence", vocab)).toBe(
      "Initial Foothold",
    );
    expect(resolveKillchainStage("Execution", vocab)).toBe(
      "Network Propagation",
    );
    expect(resolveKillchainStage(null, vocab)).toBe("Unassigned");
  });

  it("resolves killchain via vocab aliases", () => {
    const extended = {
      ...vocab,
      "Initial Foothold::Persistence": vocab.Persistence,
    };
    expect(
      resolveKillchainStage("Initial Foothold::Persistence", extended),
    ).toBe("Initial Foothold");
  });

  it("clusters visible threats by stage", () => {
    const bundle = {
      summaries: [
        { uuid: "t1", type: "threat", name: "Alpha" },
        { uuid: "t2", type: "threat", name: "Beta" },
        { uuid: "o1", type: "objective", name: "Obj" },
      ],
      flatIndex: {
        t1: { threat: { killchain: "Persistence" } },
        t2: { threat: { killchain: "Execution" } },
        o1: {},
      },
    } as never;

    const visible = new Set(["t1", "t2", "o1"]);
    const { positions, groups } = computeKillchainLayout(
      bundle,
      visible,
      vocab,
    );

    expect(positions.size).toBe(2);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.stage).sort()).toEqual([
      "Initial Foothold",
      "Network Propagation",
    ]);

    const t1 = positions.get("t1")!;
    const t2 = positions.get("t2")!;
    expect(Math.abs(t1.x - t2.x)).toBeGreaterThan(1);
  });

  it("snapshots and restores base positions", () => {
    const graph = new Graph();
    graph.addNode("a", { x: 1, y: 2 });
    graph.addNode("b", { x: 3, y: 4 });

    snapshotBasePositions(graph);
    graph.setNodeAttribute("a", "x", 9);
    graph.setNodeAttribute("a", "y", 8);

    restoreBasePositions(graph);
    expect(graph.getNodeAttributes("a")).toMatchObject({ x: 1, y: 2 });

    graph.setNodeAttribute("b", "x", 5);
    snapshotBasePositions(graph, { force: true });
    graph.setNodeAttribute("b", "x", 0);
    restoreBasePositions(graph);
    expect(graph.getNodeAttributes("b").x).toBe(5);
  });

  it("moves threat nodes when killchain layout is applied", () => {
    const graph = new Graph();
    graph.addNode("t1", { x: 10, y: 10 });
    graph.addNode("t2", { x: -10, y: -10 });

    const bundle = {
      summaries: [
        { uuid: "t1", type: "threat", name: "Alpha" },
        { uuid: "t2", type: "threat", name: "Beta" },
      ],
      flatIndex: {
        t1: { threat: { killchain: "Persistence" } },
        t2: { threat: { killchain: "Execution" } },
      },
    } as never;

    const { positions } = computeKillchainLayout(
      bundle,
      new Set(["t1", "t2"]),
      vocab,
    );
    applyKillchainLayout(graph, positions);

    expect(graph.getNodeAttributes("t1").x).not.toBe(10);
    expect(graph.getNodeAttributes("t2").x).not.toBe(-10);
    expect(
      Math.abs(
        graph.getNodeAttributes("t1").x - graph.getNodeAttributes("t2").x,
      ),
    ).toBeGreaterThan(1);
  });

  it("pulls related non-threat nodes into the killchain view", () => {
    const graph = new Graph();
    graph.addNode("t1", { x: 400, y: 400, objectType: "threat" });
    graph.addNode("o1", { x: -500, y: -500, objectType: "objective" });
    graph.addUndirectedEdge("t1", "o1");

    const bundle = {
      summaries: [
        { uuid: "t1", type: "threat", name: "Alpha" },
        { uuid: "o1", type: "objective", name: "Obj" },
      ],
      flatIndex: {
        t1: { threat: { killchain: "Persistence" } },
        o1: {},
      },
    } as never;

    const visible = new Set(["t1", "o1"]);
    const { positions, groups } = computeKillchainLayout(
      bundle,
      visible,
      vocab,
    );
    applyKillchainLayout(graph, positions);
    positionKillchainSatellites(graph, visible, positions);

    const threat = graph.getNodeAttributes("t1");
    const objective = graph.getNodeAttributes("o1");
    expect(Math.abs(objective.x - threat.x)).toBeLessThan(3);
    expect(Math.abs(objective.y - threat.y)).toBeLessThan(3);

    const bbox = computeKillchainViewBBox(groups, graph, visible);
    expect(bbox).not.toBeNull();
    expect(bbox!.x[1] - bbox!.x[0]).toBeLessThan(12);
    expect(bbox!.y[1] - bbox!.y[0]).toBeLessThan(12);
  });
});
