import { normalizeErrorText, sampleFromErrorText } from "./normalize";
import { traceIdForSession } from "./sources";
import type {
  ContextPeak,
  ErrorGroup,
  HotSpot,
  LangfuseSource,
  LangfuseTraceSummary,
  ModelGroup,
  ModelLimitIndex,
  NormalizedGeneration,
  NormalizedSession,
  NormalizedToolRecord,
  OpenCodeMessage,
  OpenCodeTree,
  ReportWarning,
  SessionStatsReport,
  SubsessionCost,
  SubsessionProfile,
  TokenSplit,
  UnknownObservation,
} from "./types";

export const DIVERGENCE_THRESHOLD = 0.05;

// ---------------------------------------------------------------------------
// Langfuse metadata extraction (Argo observation shape).
// ---------------------------------------------------------------------------

const attributesOf = (metadata: unknown): Record<string, unknown> => {
  if (!metadata || typeof metadata !== "object") return {};
  const record = metadata as Record<string, unknown>;
  if (record.attributes && typeof record.attributes === "object") {
    return record.attributes as Record<string, unknown>;
  }
  return {};
};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export const observationSessionId = (observation: UnknownObservation): string | undefined =>
  asString(attributesOf(observation.metadata)["opencode.session.id"]);

export const observationMessageId = (observation: UnknownObservation): string | undefined =>
  asString(attributesOf(observation.metadata)["opencode.message.id"]);

const observationToolName = (observation: UnknownObservation): string | undefined => {
  const attributes = attributesOf(observation.metadata);
  return (
    asString(attributes["gen_ai.tool.name"]) ??
    (typeof observation.name === "string" && observation.name.startsWith("tool ")
      ? observation.name.slice("tool ".length)
      : undefined)
  );
};

const observationToolStatus = (observation: UnknownObservation): NormalizedToolRecord["status"] => {
  const status = asString(attributesOf(observation.metadata)["opencode.tool.status"]);
  if (status === "completed") return "success";
  if (status === "error") return "error";
  return "unknown";
};

const numberFrom = (details: Record<string, number> | null | undefined, key: string): number => {
  const value = details?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const tokenSplitFromUsage = (usageDetails: Record<string, number> | null | undefined): TokenSplit => {
  const input = numberFrom(usageDetails, "input");
  const output = numberFrom(usageDetails, "output");
  const cacheRead = numberFrom(usageDetails, "cache_read_input_tokens");
  const cacheWrite = numberFrom(usageDetails, "cache_write_input_tokens");
  return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
};

const reasoningFromUsage = (usageDetails: Record<string, number> | null | undefined): number =>
  numberFrom(usageDetails, "reasoning");

// ---------------------------------------------------------------------------
// Trace -> session reconciliation.
// ---------------------------------------------------------------------------

type TraceSessionResolution = {
  sessionIdByTraceId: Record<string, string>;
  orphanTraceIds: string[];
};

const resolveTraceSessions = (
  traces: LangfuseTraceSummary[],
  treeSessions: NormalizedSession[],
): TraceSessionResolution => {
  // Argo files exactly one trace per session with a stable id and sets
  // `sessionId` to the ROOT session id on every trace, so a trace belongs to
  // a tree session only when its id is that session's stable trace id.
  // Anything else in the root's trace list is an orphan.
  const sessionIds = new Set(treeSessions.map((session) => session.id));
  const sessionIdByTraceId: Record<string, string> = {};
  const orphanTraceIds: string[] = [];
  for (const trace of traces) {
    const sessionId = [...sessionIds].find((id) => traceIdForSession(id) === trace.id);
    if (sessionId) {
      sessionIdByTraceId[trace.id] = sessionId;
    } else {
      orphanTraceIds.push(trace.id);
    }
  }
  return { sessionIdByTraceId, orphanTraceIds };
};

// ---------------------------------------------------------------------------
// OpenCode tool records (final states).
// ---------------------------------------------------------------------------

const messageTokenTotal = (message: OpenCodeMessage): number => {
  const tokens = message.info.tokens;
  if (!tokens) return 0;
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
};

const openCodeToolRecords = (tree: OpenCodeTree): NormalizedToolRecord[] => {
  const records: NormalizedToolRecord[] = [];
  for (const session of tree.sessions) {
    const messages = tree.messagesBySession[session.id] ?? [];
    for (const message of messages) {
      for (const part of message.parts ?? []) {
        if (part.type !== "tool") continue;
        const status = part.state?.status;
        const finalState: NormalizedToolRecord["status"] =
          status === "completed" ? "success" : status === "error" ? "error" : "unknown";
        const start = part.state?.time?.start;
        records.push({
          id: `oc:${session.id}:${message.info.id}:${part.id ?? part.callID ?? ""}`,
          sessionId: session.id,
          messageId: message.info.id,
          callId: part.callID,
          name: part.tool ?? "unknown",
          startTime: typeof start === "number" ? new Date(start).toISOString() : undefined,
          status: finalState,
          error: finalState === "error" && typeof part.state?.error === "string" ? part.state.error : undefined,
        });
      }
    }
  }
  return records;
};

// ---------------------------------------------------------------------------
// Aggregation.
// ---------------------------------------------------------------------------

export type AggregationInput = {
  tree: OpenCodeTree;
  modelLimits: ModelLimitIndex;
  traces: LangfuseTraceSummary[];
  observationsByTraceId: Record<string, UnknownObservation[]>;
};

export const buildReport = (input: AggregationInput): SessionStatsReport => {
  const { tree, modelLimits, traces, observationsByTraceId } = input;
  const sessions = tree.sessions;
  const root = sessions[0];
  if (!root) throw new Error("session tree is empty");
  const sessionOrder = new Map(sessions.map((session, index) => [session.id, index]));

  const { sessionIdByTraceId, orphanTraceIds } = resolveTraceSessions(traces, sessions);

  // --- normalize langfuse generations + tool spans -------------------------
  const generations: NormalizedGeneration[] = [];
  const langfuseTools: NormalizedToolRecord[] = [];
  const reasoningBySession: Record<string, number> = {};

  for (const trace of traces) {
    const traceSessionId = sessionIdByTraceId[trace.id];
    if (!traceSessionId) continue; // orphan traces are never aggregated
    for (const observation of observationsByTraceId[trace.id] ?? []) {
      const sessionId = observationSessionId(observation) ?? traceSessionId;
      if (!sessionId || !sessionOrder.has(sessionId)) continue;
      if (observation.type === "GENERATION") {
        const tokens = tokenSplitFromUsage(observation.usageDetails);
        generations.push({
          id: observation.id,
          sessionId,
          messageId: observationMessageId(observation),
          startTime: observation.startTime ?? "",
          model:
            observation.model ??
            asString(attributesOf(observation.metadata)["gen_ai.response.model"]) ??
            "unknown",
          provider: asString(observation.modelParameters?.provider as unknown as string | undefined),
          tokens,
          cost: numberFrom(observation.costDetails, "total"),
        });
        reasoningBySession[sessionId] =
          (reasoningBySession[sessionId] ?? 0) + reasoningFromUsage(observation.usageDetails);
      } else if (observation.type === "SPAN") {
        langfuseTools.push({
          id: observation.id,
          sessionId,
          messageId: observationMessageId(observation),
          callId: asString(attributesOf(observation.metadata)["gen_ai.tool.call.id"]),
          name: observationToolName(observation) ?? "unknown",
          startTime: observation.startTime ?? undefined,
          status: observationToolStatus(observation),
          error:
            observationToolStatus(observation) === "error" && typeof observation.statusMessage === "string"
              ? observation.statusMessage
              : undefined,
        });
      }
    }
  }

  // --- per-session token/cost totals (langfuse authoritative) ---------------
  const tokensBySession: Record<string, TokenSplit> = {};
  const costBySession: Record<string, number> = {};
  for (const session of sessions) {
    tokensBySession[session.id] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
    costBySession[session.id] = 0;
  }
  for (const generation of generations) {
    const totals = tokensBySession[generation.sessionId];
    if (!totals) continue;
    totals.input += generation.tokens.input;
    totals.output += generation.tokens.output;
    totals.cacheRead += generation.tokens.cacheRead;
    totals.cacheWrite += generation.tokens.cacheWrite;
    totals.total = totals.input + totals.output + totals.cacheRead + totals.cacheWrite;
    costBySession[generation.sessionId] += generation.cost;
  }

  // --- divergence warnings (opencode message tokens vs langfuse) ------------
  const warnings: ReportWarning[] = [];
  for (const session of sessions) {
    const openCodeTotal = (tree.messagesBySession[session.id] ?? [])
      .filter((message) => message.info.role === "assistant" && message.info.tokens)
      .reduce((sum, message) => sum + messageTokenTotal(message), 0);
    const langfuseTotal =
      tokensBySession[session.id].total + (reasoningBySession[session.id] ?? 0);
    const denominator = Math.max(openCodeTotal, langfuseTotal);
    if (denominator === 0) continue;
    const relativeDifference = Math.abs(langfuseTotal - openCodeTotal) / denominator;
    if (relativeDifference >= DIVERGENCE_THRESHOLD) {
      warnings.push({
        kind: "divergence",
        sessionId: session.id,
        langfuseTotal,
        openCodeTotal,
        relativeDifference,
      });
    }
  }

  if (orphanTraceIds.length > 0) {
    warnings.push({
      kind: "orphan-traces",
      traceCount: orphanTraceIds.length,
      sessionIds: [...new Set(orphanTraceIds.map((id) => id))].sort(),
    });
  }

  // --- models ---------------------------------------------------------------
  const modelGroups = new Map<string, ModelGroup>();
  for (const generation of generations) {
    const key = `${generation.sessionId}\u0000${generation.model}`;
    const group = modelGroups.get(key) ?? {
      sessionId: generation.sessionId,
      model: generation.model,
      calls: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      cost: 0,
    };
    group.calls += 1;
    group.tokens.input += generation.tokens.input;
    group.tokens.output += generation.tokens.output;
    group.tokens.cacheRead += generation.tokens.cacheRead;
    group.tokens.cacheWrite += generation.tokens.cacheWrite;
    group.tokens.total = group.tokens.input + group.tokens.output + group.tokens.cacheRead + group.tokens.cacheWrite;
    group.cost += generation.cost;
    modelGroups.set(key, group);
  }
  const models = [...modelGroups.values()].sort((a, b) => {
    const sessionDelta = (sessionOrder.get(a.sessionId) ?? 0) - (sessionOrder.get(b.sessionId) ?? 0);
    if (sessionDelta !== 0) return sessionDelta;
    return a.model.localeCompare(b.model);
  });

  // --- hotspots (top 10 by cost, then start time, then id) -------------------
  const hotspots: HotSpot[] = generations
    .filter((generation) => generation.cost > 0)
    .map((generation) => ({
      sessionId: generation.sessionId,
      messageId: generation.messageId ?? generation.id,
      observationId: generation.id,
      model: generation.model,
      cost: generation.cost,
      tokens: generation.tokens,
      startTime: generation.startTime,
    }))
    .sort((a, b) => {
      if (a.cost !== b.cost) return b.cost - a.cost;
      if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
      if (a.sessionId !== b.sessionId) return a.sessionId.localeCompare(b.sessionId);
      return a.observationId.localeCompare(b.observationId);
    })
    .slice(0, 10);

  // --- tool calls (opencode final states, langfuse join for extras) ---------
  const toolRecords = openCodeToolRecords(tree);
  const joinedLangfuseTools = langfuseTools.filter(
    (record) =>
      !toolRecords.some(
        (openCodeRecord) =>
          openCodeRecord.sessionId === record.sessionId &&
          (record.callId !== undefined && openCodeRecord.callId === record.callId ||
            (record.messageId !== undefined && openCodeRecord.messageId === record.messageId && record.name === openCodeRecord.name)),
      ),
  );
  const allToolRecords = [...toolRecords, ...joinedLangfuseTools];

  const toolGroups = new Map<string, { sessionId: string; name: string; success: number; error: number; unknown: number }>();
  for (const record of allToolRecords) {
    const key = `${record.sessionId}\u0000${record.name}`;
    const group = toolGroups.get(key) ?? {
      sessionId: record.sessionId,
      name: record.name,
      success: 0,
      error: 0,
      unknown: 0,
    };
    group[record.status] += 1;
    toolGroups.set(key, group);
  }
  const tools = [...toolGroups.values()].sort((a, b) => {
    const sessionDelta = (sessionOrder.get(a.sessionId) ?? 0) - (sessionOrder.get(b.sessionId) ?? 0);
    if (sessionDelta !== 0) return sessionDelta;
    return a.name.localeCompare(b.name);
  });

  // --- error digests (tool errors, opencode payloads) ------------------------
  const errorSamples = new Map<string, string[]>();
  const errorCounts = new Map<string, number>();
  for (const record of toolRecords) {
    if (record.status !== "error" || record.error === undefined) continue;
    const digest = normalizeErrorText(record.error);
    errorCounts.set(digest, (errorCounts.get(digest) ?? 0) + 1);
    const samples = errorSamples.get(digest) ?? [];
    if (samples.length < 3) samples.push(sampleFromErrorText(record.error));
    errorSamples.set(digest, samples);
  }
  const errors: ErrorGroup[] = [...errorCounts.entries()]
    .map(([digest, count]) => ({ digest, count, samples: errorSamples.get(digest) ?? [] }))
    .sort((a, b) => b.count - a.count || a.digest.localeCompare(b.digest));

  // --- subsession profile + cost share --------------------------------------
  const subsessions = sessions.filter((session) => session.parentId !== undefined);
  const agentCounts = new Map<string, number>();
  for (const session of subsessions) {
    agentCounts.set(session.agent, (agentCounts.get(session.agent) ?? 0) + 1);
  }
  const subsessionProfile: SubsessionProfile[] = [...agentCounts.entries()]
    .map(([agent, count]) => ({ agent, count }))
    .sort((a, b) => b.count - a.count || a.agent.localeCompare(b.agent));

  const rootCost = costBySession[root.id] ?? 0;
  const subsessionCosts: SubsessionCost[] = subsessions.map((session) => ({
    sessionId: session.id,
    agent: session.agent,
    cost: costBySession[session.id] ?? 0,
    shareOfRoot: rootCost > 0 ? (costBySession[session.id] ?? 0) / rootCost : null,
  }));

  // --- cache hit rate --------------------------------------------------------
  const cacheReadTotal = sessions.reduce((sum, session) => sum + tokensBySession[session.id].cacheRead, 0);
  const inputTotal = sessions.reduce((sum, session) => sum + tokensBySession[session.id].input, 0);
  const cacheDenominator = inputTotal + cacheReadTotal;
  const cacheHitRate = cacheDenominator > 0 ? cacheReadTotal / cacheDenominator : null;

  // --- context window peak ----------------------------------------------------
  let contextPeak: ContextPeak | null = null;
  for (const generation of generations) {
    const limitKey = generation.provider
      ? `${generation.provider}/${generation.model}`
      : undefined;
    const directLimit = limitKey !== undefined ? modelLimits[limitKey] : undefined;
    const limit = directLimit ?? findLimitByModelSuffix(modelLimits, generation.model);
    if (limit === undefined || limit <= 0) continue;
    const occupied = generation.tokens.input + generation.tokens.cacheRead + generation.tokens.cacheWrite;
    const ratio = occupied / limit;
    if (!contextPeak || ratio > contextPeak.ratio) {
      contextPeak = { tokens: occupied, limit, ratio, model: generation.model };
    }
  }

  return {
    root,
    sessions,
    tokensBySession,
    costBySession,
    models,
    hotspots,
    tools,
    errors,
    subsessionProfile,
    subsessionCosts,
    cacheHitRate,
    cacheTotals: { cacheRead: cacheReadTotal, input: inputTotal },
    contextPeak,
    warnings,
    generatedAt: Date.now(),
  };
};

const findLimitByModelSuffix = (limits: ModelLimitIndex, model: string): number | undefined => {
  const key = Object.keys(limits).find((candidate) => candidate.endsWith(`/${model}`));
  return key !== undefined ? limits[key] : undefined;
};

/** Collect langfuse traces + observations for the given root session. */
export const collectLangfuse = async (
  source: LangfuseSource,
  rootSessionId: string,
  userId: string | undefined,
): Promise<{ traces: LangfuseTraceSummary[]; observationsByTraceId: Record<string, UnknownObservation[]> }> => {
  const traces = await source.getTraces(rootSessionId, userId);
  const observationsByTraceId: Record<string, UnknownObservation[]> = {};
  for (const trace of [...traces].sort((a, b) => a.id.localeCompare(b.id))) {
    observationsByTraceId[trace.id] = await source.getObservations(trace.id);
  }
  return { traces, observationsByTraceId };
};

export type { OpenCodeMessage, OpenCodeTree };
