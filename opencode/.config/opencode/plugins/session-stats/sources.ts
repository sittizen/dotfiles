import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
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
// Argo configuration (same lookup rules as PytcSessionLog.ts, intentionally not
// imported from it — Argo must stay a telemetry-only module).
// ---------------------------------------------------------------------------

const argoConfigPath = (): string =>
  join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "argo", "config.json");

type ArgoConfigFile = {
  user?: string;
  langfuse?: {
    secret_key?: string;
    public_key?: string;
    base_url?: string;
  };
};

const resolveUserId = (): string | undefined => {
  try {
    const cfg = JSON.parse(readFileSync(argoConfigPath(), "utf-8")) as ArgoConfigFile;
    if (typeof cfg.user === "string" && cfg.user.length > 0) return cfg.user;
  } catch {
    // fall through
  }
  const envUser = process.env.ARGO_USER;
  if (typeof envUser === "string" && envUser.length > 0) return envUser;
  try {
    return execSync("whoami", { encoding: "utf-8" }).trim();
  } catch {
    return undefined;
  }
};

/**
 * Load Langfuse credentials exactly like the Argo producer does:
 * `~/.config/argo/config.json` first, then `ARGO_LANGFUSE_*` environment
 * variables. Missing credentials are fatal — Langfuse is required.
 */
export const loadArgoLangfuseConfig = (): LangfuseConfig => {
  let publicKey: string | undefined;
  let secretKey: string | undefined;
  let baseUrl: string | undefined;
  try {
    const cfg = JSON.parse(readFileSync(argoConfigPath(), "utf-8")) as ArgoConfigFile;
    publicKey = cfg.langfuse?.public_key;
    secretKey = cfg.langfuse?.secret_key;
    baseUrl = cfg.langfuse?.base_url;
  } catch {
    // fall through to environment
  }
  publicKey = publicKey ?? process.env.ARGO_LANGFUSE_PUBLIC_KEY;
  secretKey = secretKey ?? process.env.ARGO_LANGFUSE_SECRET_KEY;
  baseUrl = baseUrl ?? process.env.ARGO_LANGFUSE_BASE_URL;
  if (!publicKey || !secretKey || !baseUrl) {
    throw new FatalStatsError(
      "langfuse",
      "Langfuse is not configured: set langfuse keys in ~/.config/argo/config.json or ARGO_LANGFUSE_PUBLIC_KEY/ARGO_LANGFUSE_SECRET_KEY/ARGO_LANGFUSE_BASE_URL.",
    );
  }
  return { publicKey, secretKey, baseUrl, userId: resolveUserId() };
};

// ---------------------------------------------------------------------------
// Deterministic ids (same derivation Argo uses when filing telemetry).
// ---------------------------------------------------------------------------

export const stableId = (value: string): string => {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(
    (Number.parseInt(hex.slice(16, 18), 16) & 0x3f) |
    0x80
  ).toString(16)}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
};

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
// Langfuse source adapter (public API through the langfuse SDK).
// ---------------------------------------------------------------------------

type LangfuseApiClient = {
  traceList: (query: Record<string, unknown>) => Promise<{ data?: unknown; meta?: unknown }>;
  traceGet: (traceId: string) => Promise<{ observations?: unknown[] }>;
};

const PAGE_SIZE = 50;

const asTraceSummaries = (data: unknown): LangfuseTraceSummary[] => {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item): LangfuseTraceSummary[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string") return [];
    return [
      {
        id: record.id,
        sessionId: typeof record.sessionId === "string" ? record.sessionId : undefined,
        userId: typeof record.userId === "string" ? record.userId : undefined,
        metadata: record.metadata,
      },
    ];
  });
};

/**
 * The langfuse SDK dereferences `localStorage` inside its storage bootstrap
 * even when `persistence: "memory"` is requested (its `typeof window` guard is
 * broken and evaluates the identifier unconditionally when `window` exists).
 * The opencode TUI process defines `window` but no DOM storage, so an
 * in-memory shim must be installed before the SDK import.
 */
export const installWebStorageShim = (): void => {
  const globalScope = globalThis as { localStorage?: unknown };
  if (typeof globalScope.localStorage === "undefined") {
    const cache = new Map<string, string>();
    globalScope.localStorage = {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => void cache.set(key, String(value)),
      removeItem: (key: string) => void cache.delete(key),
      clear: () => cache.clear(),
      key: () => null,
      length: 0,
    };
  }
};

type LangfuseInstance = {
  api: LangfuseApiClient;
  shutdownAsync?: () => Promise<void>;
};

type LangfuseConstructor = new (options: {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  /** The TUI process has no DOM storage; the SDK defaults to localStorage. */
  persistence: "memory";
}) => LangfuseInstance;

/** Injectable module loader so tests can supply a fake langfuse SDK. */
export type LangfuseModuleLoader = () => Promise<{ default: LangfuseConstructor }>;

const defaultModuleLoader: LangfuseModuleLoader = async () => import("langfuse");

const asPagination = (meta: unknown): { page: number; totalPages: number } => {
  const record = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  return {
    page: typeof record.page === "number" ? record.page : 1,
    totalPages: typeof record.totalPages === "number" ? record.totalPages : 1,
  };
};

export const createLangfuseSource = (
  config: LangfuseConfig,
  options?: { loadModule?: LangfuseModuleLoader },
): LangfuseSource & { dispose: () => Promise<void> } => {
  const loadModule = options?.loadModule ?? defaultModuleLoader;
  let instancePromise: Promise<LangfuseInstance> | undefined;

  const instance = async (): Promise<LangfuseInstance> => {
    if (!instancePromise) {
      instancePromise = (async () => {
        installWebStorageShim();
        const module = await loadModule();
        const instance = new module.default({
          publicKey: config.publicKey,
          secretKey: config.secretKey,
          baseUrl: config.baseUrl,
          persistence: "memory",
        });
        if (!instance.api) {
          throw new FatalStatsError("langfuse", "Langfuse SDK did not expose its API client.");
        }
        return instance;
      })();
    }
    return instancePromise;
  };

  return {
    getTraces: async (rootSessionId, userId) => {
      const api = (await instance()).api;
      const traces: LangfuseTraceSummary[] = [];
      let page = 1;
      let totalPages = 1;
      try {
        do {
          const result = await api.traceList({ sessionId: rootSessionId, ...(userId ? { userId } : {}), page, limit: PAGE_SIZE });
          const pageTraces = asTraceSummaries(result.data);
          traces.push(...pageTraces);
          if (result.meta === undefined || result.meta === null) {
            // no pagination metadata: keep fetching while pages come back full
            totalPages = pageTraces.length >= PAGE_SIZE ? page + 1 : page;
          } else {
            totalPages = asPagination(result.meta).totalPages;
          }
          page += 1;
        } while (page <= totalPages);
      } catch (error) {
        throw new FatalStatsError("langfuse", `Langfuse trace query failed: ${describeError(error)}`);
      }
      return traces;
    },

    getObservations: async (traceId) => {
      const api = (await instance()).api;
      let result: { observations?: unknown[] };
      try {
        result = await api.traceGet(traceId);
      } catch (error) {
        throw new FatalStatsError("langfuse", `Langfuse observation query failed for trace ${traceId}: ${describeError(error)}`);
      }
      return (result.observations ?? []).filter((observation): observation is UnknownObservation => {
        if (!observation || typeof observation !== "object") return false;
        return typeof (observation as { id?: unknown }).id === "string";
      });
    },

    dispose: async () => {
      try {
        const instance = await instancePromise;
        await instance?.shutdownAsync?.();
      } catch {
        // shutdown errors are not fatal for the report
      }
    },
  };
};
