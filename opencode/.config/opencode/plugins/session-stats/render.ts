import type { NormalizedSession, SessionStatsReport, TokenSplit } from "./types";

const CELL_TEXT_LIMIT = 80;

/** Escape untrusted text for a Markdown table cell and cap its length. */
export const cell = (value: string): string => {
  const capped = value.length > CELL_TEXT_LIMIT ? `${value.slice(0, CELL_TEXT_LIMIT - 1)}…` : value;
  return capped.replace(/\|/g, "\\|").replace(/\n+/g, " ");
};

export const numberCell = (value: number): string => {
  const rounded = Math.round(value);
  return rounded.toLocaleString("en-US");
};

export const costCell = (value: number): string => `$${value.toFixed(2)}`;

export const percentCell = (ratio: number | null): string =>
  ratio === null ? "n/a" : `${(ratio * 100).toFixed(1)}%`;

export const durationCell = (millis: number): string => {
  if (millis < 0) return "n/a";
  const totalSeconds = Math.floor(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const timestamp = (millis: number): string => new Date(millis).toISOString();

const treeLines = (report: SessionStatsReport): string[] => {
  const byParent = new Map<string | undefined, NormalizedSession[]>();
  for (const session of report.sessions) {
    const siblings = byParent.get(session.parentId) ?? [];
    siblings.push(session);
    byParent.set(session.parentId, siblings);
  }
  const lines: string[] = [];
  const render = (session: NormalizedSession, depth: number): void => {
    const indent = "  ".repeat(depth);
    const cost = report.costBySession[session.id] ?? 0;
    const parent = session.parentId ? "" : " (root)";
    lines.push(
      `${indent}- ${cell(session.title)} \`${session.id}\`${parent} — agent ${cell(session.agent)}, ${session.turnCount} turns, ${costCell(cost)}`,
    );
    for (const child of byParent.get(session.id) ?? []) {
      render(child, depth + 1);
    }
  };
  const root = report.sessions[0];
  if (root) render(root, 0);
  return lines;
};

const tokenCells = (tokens: TokenSplit): string[] => [
  numberCell(tokens.input),
  numberCell(tokens.output),
  numberCell(tokens.cacheRead),
  numberCell(tokens.cacheWrite),
  numberCell(tokens.total),
];

const section = (title: string, rows: string[], emptyNote: string): string[] => [
  `## ${title}`,
  ...(rows.length > 0 ? rows : [emptyNote]),
  "",
];

export const renderReport = (report: SessionStatsReport): string => {
  const { root, sessions, tokensBySession, costBySession } = report;
  const lines: string[] = [];

  // 1. header
  lines.push("# Session Stats");
  lines.push("");

  // 2. session identity
  const duration = root.lastActivityAt - root.createdAt;
  lines.push(`- Root session: \`${root.id}\``);
  lines.push(`- Title: ${cell(root.title)}`);
  lines.push(`- Project: ${cell(root.projectId)}`);
  lines.push(`- Created: ${timestamp(root.createdAt)}`);
  lines.push(`- Last activity: ${timestamp(root.lastActivityAt)}`);
  lines.push(`- End: ${timestamp(root.endAt)}`);
  lines.push(`- Duration: ${durationCell(duration)}`);
  lines.push(`- Turns: ${root.turnCount}`);
  lines.push("");

  // 3. session tree
  lines.push("## Session tree");
  lines.push(...treeLines(report));
  lines.push("");

  // 4. token usage
  const tokenRows = sessions.map((session) => {
    const tokens = tokensBySession[session.id];
    return `| ${cell(session.id)} | ${tokenCells(tokens).join(" | ")} |`;
  });
  lines.push(...section("Token usage", [
    "| Session | Input | Output | Cache read | Cache write | Total |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...tokenRows,
  ], "_No token usage recorded._"));

  // 5. cost
  const costRows = sessions.map(
    (session) => `| ${cell(session.id)} | ${costCell(costBySession[session.id] ?? 0)} |`,
  );
  lines.push(...section("Cost", [
    "| Session | Cost (USD) |",
    "| --- | ---: |",
    ...costRows,
  ], "_No cost recorded._"));

  // 6. models
  const modelRows = report.models.map(
    (group) =>
      `| ${cell(group.sessionId)} | ${cell(group.model)} | ${group.calls} | ${tokenCells(group.tokens).join(" | ")} | ${costCell(group.cost)} |`,
  );
  lines.push(...section("Models", [
    "| Session | Model | Calls | Input | Output | Cache read | Cache write | Total | Cost (USD) |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...modelRows,
  ], "_No model usage recorded._"));

  // 7. top-10 hotspots
  const hotspotRows = report.hotspots.map(
    (spot) =>
      `| ${cell(spot.sessionId)} | \`${cell(spot.messageId)}\` | ${cell(spot.model)} | ${costCell(spot.cost)} | ${numberCell(spot.tokens.input)} | ${numberCell(spot.tokens.output)} | ${numberCell(spot.tokens.cacheRead)} | ${numberCell(spot.tokens.cacheWrite)} |`,
  );
  lines.push(...section("Top 10 cost hot spots", [
    "| Session | Message | Model | Cost (USD) | Input | Output | Cache read | Cache write |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...hotspotRows,
  ], "_No cost recorded._"));

  // 8. tool calls
  const toolRows = report.tools.map(
    (tool) =>
      `| ${cell(tool.sessionId)} | ${cell(tool.name)} | ${tool.success} | ${tool.error} | ${tool.unknown} |`,
  );
  lines.push(...section("Tool calls", [
    "| Session | Tool | Success | Error | Unknown |",
    "| --- | --- | ---: | ---: | ---: |",
    ...toolRows,
  ], "_No tool calls recorded._"));

  // 9. error digests
  const errorRows = report.errors.map(
    (group) =>
      `| ${group.count} | ${cell(group.digest)} | ${group.samples.map((sample) => `\`${cell(sample)}\``).join("<br>")} |`,
  );
  lines.push(...section("Error digests", [
    "| Count | Normalized digest | Samples |",
    "| ---: | --- | --- |",
    ...errorRows,
  ], "_No tool errors recorded._"));

  // 10. subsession profile + cost share
  const profileRows = report.subsessionProfile.map(
    (profile) => `| ${cell(profile.agent)} | ${profile.count} |`,
  );
  lines.push(...section("Subsession spawn profile", [
    "| Agent | Subsessions |",
    "| --- | ---: |",
    ...profileRows,
  ], "_No subsessions._"));

  const shareRows = report.subsessionCosts.map(
    (entry) => `| ${cell(entry.sessionId)} | ${cell(entry.agent)} | ${costCell(entry.cost)} | ${percentCell(entry.shareOfRoot)} |`,
  );
  lines.push(...section("Subsession cost share", [
    "| Subsession | Agent | Cost (USD) | Share of root |",
    "| --- | --- | ---: | ---: |",
    ...shareRows,
  ], "_No subsessions._"));

  // 11. cache + context
  lines.push("## Cache and context");
  lines.push(
    `- Cache hit rate: ${percentCell(report.cacheHitRate)} (cache read ${numberCell(report.cacheTotals.cacheRead)} / (input ${numberCell(report.cacheTotals.input)} + cache read))`,
  );
  if (report.contextPeak) {
    lines.push(
      `- Context peak: ${numberCell(report.contextPeak.tokens)} / ${numberCell(report.contextPeak.limit)} tokens (${percentCell(report.contextPeak.ratio)}) on ${cell(report.contextPeak.model)}`,
    );
  } else {
    lines.push("- Context peak: n/a (model context limit not available)");
  }
  lines.push("");

  // 12. warnings
  if (report.warnings.length > 0) {
    lines.push("## Warnings");
    for (const warning of report.warnings) {
      if (warning.kind === "divergence") {
        lines.push(
          `- Token divergence for \`${cell(warning.sessionId)}\`: Langfuse ${numberCell(warning.langfuseTotal)} vs OpenCode ${numberCell(warning.openCodeTotal)} (${percentCell(warning.relativeDifference)}). Langfuse values are shown.`,
        );
      } else {
        lines.push(
          `- ${warning.traceCount} Langfuse trace(s) reference sessions outside the current tree (\`${warning.sessionIds.map((id) => cell(id)).join("`, `")}\`).`,
        );
      }
    }
    lines.push("");
  }

  // 13. footnote
  lines.push("## Data sources");
  lines.push(
    "- Tokens, cost, and models are read from Langfuse (Argo telemetry); tool final states and the session tree are read from OpenCode.",
  );
  lines.push(
    `- Turns = number of assistant messages recorded by OpenCode for the session. Token totals are input + output + cache read + cache write (reasoning tokens are not displayed). Cache/context ratios render n/a when the denominator is 0 or the model limit is unknown.`,
  );
  lines.push(`- Report generated ${timestamp(report.generatedAt)} for the current session and its descendants only.`);
  lines.push("");

  return lines.join("\n");
};

/** Render the fatal-error message (no partial report). */
export const renderFatalError = (message: string): string =>
  ["# Session Stats", "", `Report failed: ${cell(message)}`, ""].join("\n");

/** Render the usage error (no partial report). */
export const renderUsageError = (message: string): string =>
  ["# Session Stats", "", cell(message), ""].join("\n");
