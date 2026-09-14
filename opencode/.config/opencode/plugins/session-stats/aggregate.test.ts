import { describe, expect, test } from "bun:test";
import { buildReport, DIVERGENCE_THRESHOLD } from "./aggregate";
import { traceIdForSession } from "./sources";
import type { LangfuseTraceSummary, OpenCodeMessage, OpenCodeTree, UnknownObservation } from "./types";

const session = (id: string, parentId: string | undefined, agent: string): OpenCodeTree["sessions"][number] => ({
  id,
  parentId,
  title: `session ${id}`,
  agent,
  projectId: "proj",
  createdAt: 1000,
  lastActivityAt: 9000,
  endAt: 9000,
  turnCount: 1,
});

const message = (
  id: string,
  role: "user" | "assistant",
  overrides: Partial<OpenCodeMessage["info"]> = {},
  parts: OpenCodeMessage["parts"] = [],
): OpenCodeMessage => ({
  info: {
    id,
    role,
    time: { created: 2000, completed: role === "assistant" ? 3000 : undefined },
    ...overrides,
  },
  parts,
});

const toolPart = (
  id: string,
  callID: string,
  name: string,
  status: "completed" | "error" | "pending" | "running",
  error?: string,
): NonNullable<OpenCodeMessage["parts"][number]> => ({
  id,
  type: "tool",
  tool: name,
  callID,
  state: { status, error, time: { start: 2500, end: 2800 } },
});

const generation = (overrides: Partial<UnknownObservation> & { id: string }): UnknownObservation => ({
  type: "GENERATION",
  startTime: "2026-09-08T10:00:01.000Z",
  model: "fake-model",
  usageDetails: { input: 10, output: 5, total: 15, cache_read_input_tokens: 2, cache_write_input_tokens: 1, reasoning: 0 },
  costDetails: { total: 0.01 },
  metadata: {
    attributes: {
      "opencode.session.id": "ses_root",
      "opencode.message.id": "msg_a1",
      "gen_ai.response.model": "fake-model",
    },
  },
  ...overrides,
});

const toolSpan = (id: string, status: string, name: string): UnknownObservation => ({
  id,
  type: "SPAN",
  name: `tool ${name}`,
  startTime: "2026-09-08T10:00:02.000Z",
  metadata: {
    attributes: {
      "opencode.session.id": "ses_root",
      "opencode.message.id": "msg_a2",
      "gen_ai.tool.call.id": "call_1",
      "gen_ai.tool.name": name,
      "opencode.tool.status": status,
    },
  },
  level: status === "error" ? "ERROR" : "DEFAULT",
  statusMessage: status,
});

const buildTree = (messagesBySession: Record<string, OpenCodeMessage[]>): OpenCodeTree => ({
  rootId: "ses_root",
  sessions: [
    session("ses_root", undefined, "build"),
    session("ses_child_a", "ses_root", "explore"),
    session("ses_child_b", "ses_root", "plan"),
  ],
  messagesBySession,
});

const tracesFor = (sessionIds: string[], extra: LangfuseTraceSummary[] = []): LangfuseTraceSummary[] => [
  ...sessionIds.map((id) => ({
    id: traceIdForSession(id),
    sessionId: "ses_root",
    userId: "tester",
    metadata: { opencode: { session: { id } } },
  })),
  ...extra,
];

describe("buildReport", () => {
  test("groups tokens, cost, and models by session with langfuse precedence", () => {
    const tree = buildTree({
      ses_root: [message("msg_a1", "assistant", { modelID: "fake-model", providerID: "p" }), message("msg_u1", "user")],
      ses_child_a: [message("msg_c1", "assistant", { modelID: "fake-model", providerID: "p" })],
      ses_child_b: [],
    });
    const traces = tracesFor(["ses_root", "ses_child_a"]);
    const observationsByTraceId: Record<string, UnknownObservation[]> = {
      [traceIdForSession("ses_root")]: [
        generation({ id: "g1" }),
        generation({
          id: "g2",
          model: "other-model",
          usageDetails: { input: 100, output: 50, cache_read_input_tokens: 20, cache_write_input_tokens: 10 },
          costDetails: { total: 0.5 },
          metadata: {
            attributes: { "opencode.session.id": "ses_child_a", "opencode.message.id": "msg_c1" },
          },
        }),
      ],
      [traceIdForSession("ses_child_a")]: [],
    };

    const report = buildReport({ tree, modelLimits: {}, traces, observationsByTraceId });

    expect(report.tokensBySession["ses_root"]).toEqual({ input: 10, output: 5, cacheRead: 2, cacheWrite: 1, total: 18 });
    expect(report.tokensBySession["ses_child_a"]).toEqual({ input: 100, output: 50, cacheRead: 20, cacheWrite: 10, total: 180 });
    expect(report.costBySession["ses_root"]).toBeCloseTo(0.01);
    expect(report.costBySession["ses_child_a"]).toBeCloseTo(0.5);
    expect(report.models.map((m) => [m.sessionId, m.model])).toEqual([
      ["ses_root", "fake-model"],
      ["ses_child_a", "other-model"],
    ]);
  });

  test("keeps langfuse values and warns on divergence above the threshold", () => {
    const assistantTokens = { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } };
    const tree = buildTree({
      ses_root: [message("msg_a1", "assistant", { tokens: assistantTokens })],
      ses_child_a: [message("msg_c1", "assistant", { tokens: assistantTokens })],
      ses_child_b: [],
    });
    // langfuse reports double the opencode tokens for the root -> divergence.
    const observationsByTraceId: Record<string, UnknownObservation[]> = {
      [traceIdForSession("ses_root")]: [
        generation({
          id: "g1",
          usageDetails: { input: 20, output: 10, cache_read_input_tokens: 0, cache_write_input_tokens: 0 },
        }),
      ],
      [traceIdForSession("ses_child_a")]: [],
    };
    const report = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root", "ses_child_a"]),
      observationsByTraceId,
    });

    const divergence = report.warnings.find((w) => w.kind === "divergence" && w.sessionId === "ses_root");
    expect(divergence).toBeDefined();
    if (divergence?.kind === "divergence") {
      expect(divergence.langfuseTotal).toBe(30);
      expect(divergence.openCodeTotal).toBe(15);
      expect(divergence.relativeDifference).toBeGreaterThanOrEqual(DIVERGENCE_THRESHOLD);
    }
    // langfuse value is kept
    expect(report.tokensBySession["ses_root"].total).toBe(30);
  });

  test("no divergence warning below the threshold", () => {
    const assistantTokens = { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } };
    const tree = buildTree({
      ses_root: [message("msg_a1", "assistant", { tokens: assistantTokens })],
      ses_child_a: [],
      ses_child_b: [],
    });
    const observationsByTraceId: Record<string, UnknownObservation[]> = {
      [traceIdForSession("ses_root")]: [
        generation({
          id: "g1",
          usageDetails: { input: 102, output: 51, cache_read_input_tokens: 0, cache_write_input_tokens: 0 },
        }),
      ],
      [traceIdForSession("ses_child_a")]: [],
    };
    const report = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root", "ses_child_a"]),
      observationsByTraceId,
    });
    expect(report.warnings.filter((w) => w.kind === "divergence")).toHaveLength(0);
  });

  test("zero-value sessions produce no divergence warnings", () => {
    const tree = buildTree({ ses_root: [], ses_child_a: [], ses_child_b: [] });
    const report = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root", "ses_child_a"]),
      observationsByTraceId: {
        [traceIdForSession("ses_root")]: [],
        [traceIdForSession("ses_child_a")]: [],
      },
    });
    expect(report.warnings).toHaveLength(0);
  });

  test("orphan traces tied to the root produce a warning", () => {
    const tree = buildTree({ ses_root: [], ses_child_a: [], ses_child_b: [] });
    const orphan = { id: "trc_orphan", sessionId: "ses_root", userId: "tester", metadata: {} };
    const report = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root"], [orphan]),
      observationsByTraceId: { [traceIdForSession("ses_root")]: [], trc_orphan: [] },
    });
    const orphanWarning = report.warnings.find((w) => w.kind === "orphan-traces");
    expect(orphanWarning).toBeDefined();
  });

  test("tool counts come from opencode final states including unknown", () => {
    const tree = buildTree({
      ses_root: [
        message(
          "msg_a2",
          "assistant",
          {},
          [
            toolPart("p1", "call_1", "read", "completed"),
            toolPart("p2", "call_2", "bash", "error", "bash exited with code 1"),
            toolPart("p3", "call_3", "edit", "pending"),
          ],
        ),
      ],
      ses_child_a: [],
      ses_child_b: [],
    });
    const report = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root"]),
      observationsByTraceId: {
        [traceIdForSession("ses_root")]: [toolSpan("span_1", "completed", "read")],
      },
    });

    const read = report.tools.find((t) => t.name === "read");
    const bash = report.tools.find((t) => t.name === "bash");
    const edit = report.tools.find((t) => t.name === "edit");
    expect(read).toMatchObject({ sessionId: "ses_root", success: 1, error: 0, unknown: 0 });
    expect(bash).toMatchObject({ sessionId: "ses_root", success: 0, error: 1, unknown: 0 });
    expect(edit).toMatchObject({ sessionId: "ses_root", success: 0, error: 0, unknown: 1 });
  });

  test("error digests group by normalization with up to three samples", () => {
    const tree = buildTree({
      ses_root: [
        message("msg_a2", "assistant", {}, [
          toolPart("p1", "call_1", "bash", "error", "cannot find /tmp/one.txt at line 3"),
          toolPart("p2", "call_2", "bash", "error", "cannot find /tmp/two.txt at line 4"),
          toolPart("p3", "call_3", "bash", "error", "cannot find /tmp/three.txt at line 5"),
          toolPart("p4", "call_4", "bash", "error", "cannot find /tmp/four.txt at line 6"),
          toolPart("p5", "call_5", "read", "error", "permission denied"),
        ]),
      ],
      ses_child_a: [],
      ses_child_b: [],
    });
    const report = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root"]),
      observationsByTraceId: { [traceIdForSession("ses_root")]: [] },
    });

    expect(report.errors).toHaveLength(2);
    const bashGroup = report.errors.find((g) => g.digest.includes("cannot find"));
    expect(bashGroup?.count).toBe(4);
    expect(bashGroup?.samples).toHaveLength(3);
    expect(report.errors[0].count).toBeGreaterThanOrEqual(report.errors[1].count);
  });

  test("hotspots sort by cost desc, then start time, then id, capped at 10", () => {
    const tree = buildTree({ ses_root: [], ses_child_a: [], ses_child_b: [] });
    const generations: UnknownObservation[] = [];
    for (let index = 0; index < 14; index += 1) {
      generations.push(
        generation({
          id: `g${String(index).padStart(2, "0")}`,
          startTime: `2026-09-08T10:00:${String(index).padStart(2, "0")}.000Z`,
          costDetails: { total: index === 0 ? 0.5 : 0.1 },
        }),
      );
    }
    const report = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root"]),
      observationsByTraceId: { [traceIdForSession("ses_root")]: generations },
    });

    expect(report.hotspots).toHaveLength(10);
    expect(report.hotspots[0].cost).toBe(0.5);
    const rest = report.hotspots.slice(1).map((h) => h.observationId);
    expect(rest).toEqual([...rest].sort());
  });

  test("subsession profile counts by agent and cost share renders null when root cost is zero", () => {
    const tree = buildTree({ ses_root: [], ses_child_a: [], ses_child_b: [] });
    const report = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root", "ses_child_a"]),
      observationsByTraceId: {
        [traceIdForSession("ses_root")]: [generation({ id: "g1", costDetails: { total: 0.8 } })],
        [traceIdForSession("ses_child_a")]: [
          generation({
            id: "g2",
            costDetails: { total: 0.2 },
            metadata: { attributes: { "opencode.session.id": "ses_child_a" } },
          }),
        ],
      },
    });

    expect(report.subsessionProfile).toEqual([
      { agent: "explore", count: 1 },
      { agent: "plan", count: 1 },
    ]);
    const childShare = report.subsessionCosts.find((entry) => entry.sessionId === "ses_child_a");
    expect(childShare?.shareOfRoot).toBeCloseTo(0.25);
  });

  test("cost share is null when root cost is zero", () => {
    const tree = buildTree({ ses_root: [], ses_child_a: [], ses_child_b: [] });
    const report = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root"]),
      observationsByTraceId: { [traceIdForSession("ses_root")]: [] },
    });
    expect(report.subsessionCosts.every((entry) => entry.shareOfRoot === null)).toBe(true);
  });

  test("cache hit rate arithmetic with zero denominator", () => {
    const tree = buildTree({ ses_root: [], ses_child_a: [], ses_child_b: [] });
    const report = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root"]),
      observationsByTraceId: {
        [traceIdForSession("ses_root")]: [
          generation({
            id: "g1",
            usageDetails: { input: 30, output: 0, cache_read_input_tokens: 30, cache_write_input_tokens: 0 },
          }),
        ],
      },
    });
    expect(report.cacheTotals).toEqual({ cacheRead: 30, input: 30 });
    expect(report.cacheHitRate).toBeCloseTo(0.5);
  });

  test("cache hit rate is null when denominator is zero", () => {
    const tree = buildTree({ ses_root: [], ses_child_a: [], ses_child_b: [] });
    const report = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root"]),
      observationsByTraceId: { [traceIdForSession("ses_root")]: [] },
    });
    expect(report.cacheHitRate).toBeNull();
  });

  test("context pressure uses the model limit and n/a when unknown", () => {
    const tree = buildTree({ ses_root: [], ses_child_a: [], ses_child_b: [] });
    const withLimits = buildReport({
      tree,
      modelLimits: { "p/fake-model": 100 },
      traces: tracesFor(["ses_root"]),
      observationsByTraceId: {
        [traceIdForSession("ses_root")]: [
          generation({ id: "g1", modelParameters: { provider: "p" }, usageDetails: { input: 40, output: 0, cache_read_input_tokens: 30, cache_write_input_tokens: 30 } }),
        ],
      },
    });
    expect(withLimits.contextPeak).toMatchObject({ tokens: 100, limit: 100, model: "fake-model" });
    expect(withLimits.contextPeak?.ratio).toBeCloseTo(1);

    const withoutLimits = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root"]),
      observationsByTraceId: {
        [traceIdForSession("ses_root")]: [generation({ id: "g1" })],
      },
    });
    expect(withoutLimits.contextPeak).toBeNull();
  });

  test("includes idle-session trace tail and uses last activity as end time", () => {
    const crashed = buildTree({ ses_root: [], ses_child_a: [], ses_child_b: [] });
    // crashed/abandoned session: last observed message stamp becomes endAt
    crashed.sessions[0].createdAt = 1000;
    crashed.sessions[0].lastActivityAt = 5000;
    crashed.sessions[0].endAt = 5000;
    const report = buildReport({
      tree: crashed,
      modelLimits: {},
      traces: tracesFor(["ses_root"]),
      observationsByTraceId: { [traceIdForSession("ses_root")]: [generation({ id: "g1" })] },
    });
    expect(report.root.endAt).toBe(5000);
    expect(report.tokensBySession["ses_root"].total).toBe(18);
  });

  test("session tree order is root-first, depth-first, deterministic", () => {
    const tree = buildTree({ ses_root: [], ses_child_a: [], ses_child_b: [] });
    const report = buildReport({
      tree,
      modelLimits: {},
      traces: tracesFor(["ses_root", "ses_child_a", "ses_child_b"]),
      observationsByTraceId: {
        [traceIdForSession("ses_root")]: [],
        [traceIdForSession("ses_child_a")]: [],
        [traceIdForSession("ses_child_b")]: [],
      },
    });
    expect(report.sessions.map((s) => s.id)).toEqual(["ses_root", "ses_child_a", "ses_child_b"]);
  });
});
