import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  GetObservationsV2Request,
  ObservationV2,
  ObservationsV2Response,
} from "@langfuse/core";
import { FatalStatsError, describeError } from "./errors";
import type {
  LangfuseConfig,
  LangfuseSource,
  LangfuseTraceSummary,
  ModelLimitIndex,
  OpenCodeMessage,
  OpenCodeSessionData,
  OpenCodeSource,
  OpenCodeTree,
  UnknownObservation,
} from "./types";

// ---------------------------------------------------------------------------
// PyTC configuration (same lookup rules as PytcSessionLog.ts, intentionally not
// imported from it — the telemetry producer must stay a separate module).
// ---------------------------------------------------------------------------

const pytcConfigPath = (): string =>
  join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "pytc", "config.json");

type PytcConfigFile = {
  user?: string;
  langfuse?: {
    secret_key?: string;
    public_key?: string;
    base_url?: string;
  };
};

const resolveUserId = (): string | undefined => {
  try {
    const cfg = JSON.parse(readFileSync(pytcConfigPath(), "utf-8")) as PytcConfigFile;
    if (typeof cfg.user === "string" && cfg.user.length > 0) return cfg.user;
  } catch {
    // fall through
  }
  const envUser = process.env.PYTC_USER;
  if (typeof envUser === "string" && envUser.length > 0) return envUser;
  try {
    return execSync("whoami", { encoding: "utf-8" }).trim();
  } catch {
    return undefined;
  }
};

/**
 * Load Langfuse credentials exactly like the PyTC telemetry producer does:
 * `~/.config/pytc/config.json` first, then `PYTC_LANGFUSE_*` environment
 * variables. Missing credentials are fatal — Langfuse is required.
 */
export const loadPytcLangfuseConfig = (): LangfuseConfig => {
  let publicKey: string | undefined;
  let secretKey: string | undefined;
  let baseUrl: string | undefined;
  try {
    const cfg = JSON.parse(readFileSync(pytcConfigPath(), "utf-8")) as PytcConfigFile;
    publicKey = cfg.langfuse?.public_key;
    secretKey = cfg.langfuse?.secret_key;
    baseUrl = cfg.langfuse?.base_url;
  } catch {
    // fall through to environment
  }
  publicKey = publicKey ?? process.env.PYTC_LANGFUSE_PUBLIC_KEY;
  secretKey = secretKey ?? process.env.PYTC_LANGFUSE_SECRET_KEY;
  baseUrl = baseUrl ?? process.env.PYTC_LANGFUSE_BASE_URL;
  if (!publicKey || !secretKey || !baseUrl) {
    throw new FatalStatsError(
      "langfuse",
      "Langfuse is not configured: set langfuse keys in ~/.config/pytc/config.json or PYTC_LANGFUSE_PUBLIC_KEY/PYTC_LANGFUSE_SECRET_KEY/PYTC_LANGFUSE_BASE_URL.",
    );
  }
  return { publicKey, secretKey, baseUrl, userId: resolveUserId() };
};

// ---------------------------------------------------------------------------
// Deterministic ids (same derivation the PyTC producer uses when filing
// telemetry). Trace ids are 32-hex OpenTelemetry trace ids.
// ---------------------------------------------------------------------------

export const stableId = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 32);

export const traceIdForSession = (sessionId: string): string => stableId(`trace:${sessionId}`);

// ---------------------------------------------------------------------------
// OpenCode source adapter (v2 SDK client, flat parameters).
// ---------------------------------------------------------------------------

type V2Client = {
  session: {
    get: (parameters: { sessionID: string }) => Promise<{ data?: OpenCodeSessionData; error?: unknown }>;
    children: (parameters: { sessionID: string }) => Promise<{ data?: OpenCodeSessionData[]; error?: unknown }>;
    messages: (parameters: { sessionID: string }) => Promise<{ data?: OpenCodeMessage[]; error?: unknown }>;
  };
  provider?: {
    list: (parameters?: Record<string, unknown>) => Promise<{
      data?: {
        all?: Array<{
          id: string;
          models?: Record<string, { id: string; limit?: { context?: number } }>;
        }>;
      };
      error?: unknown;
    }>;
  };
};

const asSessionData = (input: unknown, sessionID: string): OpenCodeSessionData => {
  if (!input || typeof input !== "object") {
    throw new FatalStatsError("opencode", `OpenCode session not found: ${sessionID}`);
  }
  return input as OpenCodeSessionData;
};

const normalizeSession = (
  raw: OpenCodeSessionData,
  messages: OpenCodeMessage[],
): import("./types").NormalizedSession => {
  const created = raw.time?.created ?? 0;
  let lastActivity = created;
  for (const message of messages) {
    const time = message.info.time;
    const stamp = time?.completed ?? time?.created ?? 0;
    if (stamp > lastActivity) lastActivity = stamp;
  }
  const updated = raw.time?.updated ?? 0;
  if (updated > lastActivity) lastActivity = updated;
  return {
    id: raw.id,
    parentId: raw.parentID,
    title: raw.title || raw.slug || raw.id,
    agent: raw.agent ?? "unknown",
    projectId: raw.projectID,
    createdAt: created,
    lastActivityAt: lastActivity,
    endAt: lastActivity,
    turnCount: messages.filter((message) => message.info?.role === "assistant").length,
  };
};

export const createOpenCodeSource = (client: V2Client): OpenCodeSource => ({
  getTree: async (rootSessionId) => {
    const rootResult = await client.session.get({ sessionID: rootSessionId });
    if (rootResult.error) {
      throw new FatalStatsError("opencode", `OpenCode session query failed: ${String(rootResult.error)}`);
    }
    const root = asSessionData(rootResult.data, rootSessionId);

    const seen = new Set<string>();
    const sessions: OpenTreeSession[] = [];

    const visit = async (session: OpenCodeSessionData): Promise<void> => {
      if (seen.has(session.id)) return;
      seen.add(session.id);
      const messagesResult = await client.session.messages({ sessionID: session.id });
      if (messagesResult.error) {
        throw new FatalStatsError("opencode", `OpenCode message query failed for ${session.id}: ${String(messagesResult.error)}`);
      }
      const messages = messagesResult.data ?? [];
      sessions.push({ raw: session, normalized: normalizeSession(session, messages), messages });
      const childrenResult = await client.session.children({ sessionID: session.id });
      if (childrenResult.error) {
        throw new FatalStatsError("opencode", `OpenCode children query failed for ${session.id}: ${String(childrenResult.error)}`);
      }
      const children = (childrenResult.data ?? [])
        .filter((child) => child && typeof child.id === "string")
        .sort((a, b) => a.id.localeCompare(b.id));
      for (const child of children) {
        await visit(child);
      }
    };

    type OpenTreeSession = { raw: OpenCodeSessionData; normalized: import("./types").NormalizedSession; messages: OpenCodeMessage[] };
    await visit(root);

    const messagesBySession: Record<string, OpenCodeMessage[]> = {};
    for (const entry of sessions) {
      messagesBySession[entry.raw.id] = entry.messages;
    }
    return {
      rootId: root.id,
      sessions: sessions.map((entry) => entry.normalized),
      messagesBySession,
    };
  },

  getModelLimits: async () => {
    const limits: ModelLimitIndex = {};
    if (!client.provider?.list) return limits;
    try {
      const result = await client.provider.list();
      for (const provider of result.data?.all ?? []) {
        for (const model of Object.values(provider.models ?? {})) {
          const context = model?.limit?.context;
          if (typeof context === "number" && context > 0) {
            limits[`${provider.id}/${model.id}`] = context;
          }
        }
      }
    } catch {
      // limits are optional; report renders n/a when missing
    }
    return limits;
  },
});

// ---------------------------------------------------------------------------
// Langfuse source adapter (public API through the @langfuse/client SDK).
// Reads use the observations v2 endpoint (the only read path in JS SDK v5+).
// ---------------------------------------------------------------------------

type LangfuseObservationsApi = {
  getMany: (query?: GetObservationsV2Request) => Promise<ObservationsV2Response>;
};

type LangfuseInstance = {
  api: { observations: LangfuseObservationsApi };
  shutdown?: () => Promise<void>;
};

type LangfuseConstructor = new (options: {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}) => LangfuseInstance;

/** Injectable module loader so tests can supply a fake Langfuse SDK. */
export type LangfuseModuleLoader = () => Promise<{ LangfuseClient: LangfuseConstructor }>;

const defaultModuleLoader: LangfuseModuleLoader = async () => import("@langfuse/client");

const PAGE_SIZE = 1000;

// Field groups needed to satisfy `UnknownObservation` and the reconciliation
// metadata keys (`metadata`, `model`, `usage`, `time`).
const OBSERVATION_FIELDS = "core,basic,time,io,metadata,model,usage,trace_context";

// The `attributes` metadata object carries the OpenCode ids used to reconcile
// observations; ask the API not to truncate it (values over 200 chars).
const EXPAND_METADATA = "attributes";

const asObservation = (observation: ObservationV2): UnknownObservation => ({
  id: observation.id,
  type: typeof observation.type === "string" ? observation.type : "UNKNOWN",
  name: observation.name ?? null,
  startTime: observation.startTime ?? null,
  endTime: observation.endTime ?? null,
  model: observation.model ?? null,
  modelParameters: (observation.modelParameters ?? null) as Record<string, unknown> | null,
  usageDetails: observation.usageDetails ?? null,
  costDetails: observation.costDetails ?? null,
  metadata: observation.metadata,
  level: observation.level ?? null,
  statusMessage: observation.statusMessage ?? null,
});

export const createLangfuseSource = (
  config: LangfuseConfig,
  options?: { loadModule?: LangfuseModuleLoader },
): LangfuseSource & { dispose: () => Promise<void> } => {
  const loadModule = options?.loadModule ?? defaultModuleLoader;
  let instancePromise: Promise<LangfuseInstance> | undefined;

  const instance = async (): Promise<LangfuseInstance> => {
    if (!instancePromise) {
      instancePromise = (async () => {
        const module = await loadModule();
        const instance = new module.LangfuseClient({
          publicKey: config.publicKey,
          secretKey: config.secretKey,
          baseUrl: config.baseUrl,
        });
        if (!instance.api?.observations) {
          throw new FatalStatsError("langfuse", "Langfuse SDK did not expose its API client.");
        }
        return instance;
      })();
    }
    return instancePromise;
  };

  /** Page through the observations v2 endpoint with cursor pagination. */
  const fetchObservations = async (query: GetObservationsV2Request): Promise<ObservationV2[]> => {
    const api = (await instance()).api.observations;
    const observations: ObservationV2[] = [];
    let cursor: string | undefined;
    try {
      do {
        const result = await api.getMany({
          ...query,
          fields: OBSERVATION_FIELDS,
          expandMetadata: EXPAND_METADATA,
          limit: PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        });
        observations.push(...(result.data ?? []));
        cursor = result.meta?.cursor;
      } while (cursor);
    } catch (error) {
      throw new FatalStatsError("langfuse", `Langfuse observation query failed: ${describeError(error)}`);
    }
    return observations;
  };

  return {
    getTraces: async (rootSessionId, userId) => {
      const observations = await fetchObservations({
        sessionId: rootSessionId,
        ...(userId ? { userId } : {}),
      });
      // The producer files one trace per session and sets `sessionId` to the
      // root session id, so distinct trace ids in the session are the traces.
      const byTraceId = new Map<string, LangfuseTraceSummary>();
      for (const observation of observations) {
        const traceId = observation.traceId;
        if (typeof traceId !== "string" || byTraceId.has(traceId)) continue;
        byTraceId.set(traceId, {
          id: traceId,
          sessionId: typeof observation.sessionId === "string" ? observation.sessionId : undefined,
          userId: typeof observation.userId === "string" ? observation.userId : undefined,
          metadata: observation.metadata,
        });
      }
      return [...byTraceId.values()];
    },

    getObservations: async (traceId) => {
      const observations = await fetchObservations({ traceId });
      return observations
        .filter((observation): observation is ObservationV2 => typeof observation.id === "string")
        .map(asObservation);
    },

    dispose: async () => {
      try {
        const instance = await instancePromise;
        await instance?.shutdown?.();
      } catch {
        // shutdown errors are not fatal for the report
      }
    },
  };
};
