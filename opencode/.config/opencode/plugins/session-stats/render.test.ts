import { describe, expect, test } from "bun:test";
import { cell, costCell, numberCell, percentCell, renderFatalError, renderReport, renderUsageError } from "./render";
import type { SessionStatsReport } from "./types";

const baseReport = (): SessionStatsReport => ({
  root: {
    id: "ses_root",
    parentId: undefined,
    title: "root | title",
    agent: "build",
    projectId: "proj",
    createdAt: 0,
    lastActivityAt: 65000,
    endAt: 65000,
    turnCount: 3,
  },
  sessions: [
    {
      id: "ses_root",
      parentId: undefined,
      title: "root | title",
      agent: "build",
      projectId: "proj",
      createdAt: 0,
      lastActivityAt: 65000,
      endAt: 65000,
      turnCount: 3,
    },
    {
      id: "ses_child",
      parentId: "ses_root",
      title: "child",
      agent: "explore",
      projectId: "proj",
      createdAt: 1000,
      lastActivityAt: 50000,
      endAt: 50000,
      turnCount: 1,
    },
  ],
  tokensBySession: {
    ses_root: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, total: 165 },
    ses_child: { input: 20, output: 10, cacheRead: 0, cacheWrite: 0, total: 30 },
  },
  costBySession: { ses_root: 1.5, ses_child: 0.25 },
  models: [
    { sessionId: "ses_root", model: "provider/model-a", calls: 3, tokens: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, total: 165 }, cost: 1.5 },
  ],
  hotspots: [
    { sessionId: "ses_root", messageId: "msg_1", observationId: "obs_1", model: "provider/model-a", cost: 0.75, tokens: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, total: 165 }, startTime: "2026-09-08T10:00:01.000Z" },
  ],
  tools: [{ sessionId: "ses_root", name: "bash", success: 2, error: 1, unknown: 1 }],
  errors: [{ digest: "command failed with <PATH> at <LINE>", count: 2, samples: ["command failed with /tmp/x at line 3"] }],
  subsessionProfile: [{ agent: "explore", count: 1 }],
  subsessionCosts: [{ sessionId: "ses_child", agent: "explore", cost: 0.25, shareOfRoot: 1 / 6 }],
  cacheHitRate: 0.25,
  cacheTotals: { cacheRead: 10, input: 30 },
  contextPeak: { tokens: 120, limit: 200, ratio: 0.6, model: "provider/model-a" },
  warnings: [],
  generatedAt: Date.parse("2026-09-08T12:00:00.000Z"),
});

describe("renderReport", () => {
  test("renders the fixed section order", () => {
    const markdown = renderReport(baseReport());
    const titles = markdown
      .split("\n")
      .filter((line) => line.startsWith("# "))
      .map((line) => line.trim());
    expect(titles).toEqual(["# Session Stats"]);
    const sectionHeaders = markdown
      .split("\n")
      .filter((line) => line.startsWith("## "))
      .map((line) => line.slice(3));
    expect(sectionHeaders).toEqual([
      "Session tree",
      "Token usage",
      "Cost",
      "Models",
      "Top 10 cost hot spots",
      "Tool calls",
      "Error digests",
      "Subsession spawn profile",
      "Subsession cost share",
      "Cache and context",
      "Data sources",
    ]);
  });

  test("omits the warnings section when there are no warnings", () => {
    expect(renderReport(baseReport())).not.toContain("## Warnings");
  });

  test("renders warnings section only when warnings exist", () => {
    const report = baseReport();
    report.warnings = [
      { kind: "divergence", sessionId: "ses_root", langfuseTotal: 200, openCodeTotal: 100, relativeDifference: 0.5 },
      { kind: "orphan-traces", sessionIds: ["trc_x"], traceCount: 1 },
    ];
    const markdown = renderReport(report);
    expect(markdown).toContain("## Warnings");
    expect(markdown).toContain("Token divergence");
    expect(markdown).toContain("outside the current tree");
  });

  test("escapes pipe characters in untrusted cell content", () => {
    const report = baseReport();
    report.root.title = "weird | title";
    const markdown = renderReport(report);
    expect(markdown).toContain("weird \\| title");
    expect(markdown).not.toMatch(/weird \| title/);
  });

  test("caps untrusted cell content", () => {
    const report = baseReport();
    report.errors = [{ digest: "d".repeat(300), count: 1, samples: ["s".repeat(400)] }];
    const markdown = renderReport(report);
    const digestCell = markdown.split("\n").find((line) => line.includes("ddd"));
    expect(digestCell?.length ?? 0).toBeLessThan(200);
  });

  test("renders n/a for zero-denominator ratios", () => {
    const report = baseReport();
    report.cacheHitRate = null;
    report.subsessionCosts = [{ sessionId: "ses_child", agent: "explore", cost: 0, shareOfRoot: null }];
    report.contextPeak = null;
    const markdown = renderReport(report);
    expect(markdown).toContain("Cache hit rate: n/a");
    expect(markdown).toContain("n/a (model context limit not available)");
    expect(markdown).toMatch(/Share of root[\s\S]*?\| n\/a \|/);
  });

  test("excludes tool inputs and full payloads", () => {
    const markdown = renderReport(baseReport());
    expect(markdown).not.toContain("command: ");
    // samples are truncated source text, never tool outputs
    expect(markdown).not.toContain("```");
  });

  test("formats numbers, costs, and durations deterministically", () => {
    const markdown = renderReport(baseReport());
    expect(markdown).toContain("$1.50");
    expect(markdown).toContain("$0.25");
    expect(markdown).toContain("1m 5s"); // 65000ms duration
    expect(numberCell(1234567)).toBe("1,234,567");
    expect(costCell(0)).toBe("$0.00");
    expect(percentCell(null)).toBe("n/a");
    expect(percentCell(0.0523)).toBe("5.2%");
  });

  test("states the turn counting rule in the footnote", () => {
    expect(renderReport(baseReport())).toContain("Turns = number of assistant messages");
  });
});

describe("error rendering", () => {
  test("fatal error renders a concise message with no report sections", () => {
    const markdown = renderFatalError("Langfuse is unreachable | down");
    expect(markdown).toContain("# Session Stats");
    expect(markdown).toContain("Langfuse is unreachable \\| down");
    expect(markdown).not.toContain("## Token usage");
  });

  test("usage error renders the usage text", () => {
    const markdown = renderUsageError("unknown argument. usage: /pytc-session-stats");
    expect(markdown).toContain("usage: /pytc-session-stats");
    expect(markdown).not.toContain("## Token usage");
  });
});

describe("cell", () => {
  test("escapes pipes and collapses newlines", () => {
    expect(cell("a|b\nc")).toBe("a\\|b c");
  });

  test("caps length at the limit", () => {
    expect(cell("z".repeat(200)).length).toBeLessThanOrEqual(81);
  });
});
