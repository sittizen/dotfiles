/**
 * Normalized internal types for the pytc-session-stats report.
 *
 * Source ownership (see docs/plans/pytc-session-stats.md):
 * - Langfuse is authoritative for tokens, cost, and models.
 * - OpenCode is authoritative for the session/subsession tree and tool final states.
 *
 * Verified runtime contract (opencode 1.18.29, recorded 2026-09-08 spike):
 * - TUI plugins are modules exporting `{ id?: string; tui: TuiPlugin }` and are
 *   registered through the `plugin` array in `tui.json`/`tui.jsonc`.
 * - `api.keymap.intercept("key", handler, { priority })` receives
 *   `{ event, consume, setData, getData }` and runs before every keymap
 *   binding. `consume()` stops the key event from reaching the prompt editor,
 *   which is the only zero-LM interception point for Enter (the editor handles
 *   `input.submit` internally; overriding the `prompt.submit` command does not
 *   run for typed submissions).
 * - Enter arrives as `event.name === "return"`.
 * - `api.renderer.currentFocusedEditor` is the prompt editor; prompt editors
 *   expose `plainText: string`, `clear()`, and `submit()`.
 * - `api.route.current` is `{ name: "session", params: { sessionID } }` for the
 *   current session.
 * - `api.client` is the v2 SDK client: flat parameters such as
 *   `client.session.promptAsync({ sessionID, noReply: true, parts })`,
 *   `client.session.get({ sessionID })`, `client.session.children({ sessionID })`,
 *   `client.session.messages({ sessionID })`, `client.provider.list()`.
 * - Output contract: `client.session.promptAsync` with `noReply: true` and a
 *   plain `{ type: "text", text }` part persists a user message that the TUI
 *   renders in chat with Markdown, without starting any model loop. Parts with
 *   `synthetic: true` or `ignored: true` are persisted but NOT rendered.
 * - A TUI plugin must be loadable without `@opentui/*` at runtime; structural
 *   types below describe the small API surface used.
 */

export type Millis = number;

export type NormalizedSession = {
  id: string;
  parentId: string | undefined;
  title: string;
  agent: string;
  projectId: string;
  createdAt: Millis;
  lastActivityAt: Millis;
  endAt: Millis;
  turnCount: number;
};

export type TokenSplit = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

export type NormalizedGeneration = {
  id: string;
  sessionId: string;
  messageId: string | undefined;
  startTime: string;
  model: string;
  provider: string | undefined;
  tokens: TokenSplit;
  cost: number;
};

export type NormalizedToolRecord = {
  id: string;
  sessionId: string;
  messageId: string | undefined;
  callId: string | undefined;
  name: string;
  startTime: string | undefined;
  status: "success" | "error" | "unknown";
  error: string | undefined;
};

export type NormalizedLangfuse = {
  rootSessionId: string;
  generations: NormalizedGeneration[];
  tools: NormalizedToolRecord[];
  orphanSessionIds: string[];
  traceCount: number;
};

export type OpenCodeMessage = {
  info: {
    id: string;
    role: string;
    agent?: string;
    modelID?: string;
    providerID?: string;
    time: { created: number; completed?: number };
    tokens?: {
      input: number;
      output: number;
      reasoning: number;
      cache: { read: number; write: number };
    };
    cost?: number;
    error?: unknown;
  };
  parts: Array<{
    id?: string;
    type: string;
    tool?: string;
    callID?: string;
    state?: {
      status?: string;
      error?: string;
      time?: { start?: number; end?: number };
    };
    text?: string;
  }>;
};

export type OpenCodeSessionData = {
  id: string;
  parentID?: string;
  title?: string;
  slug?: string;
  agent?: string;
  projectID: string;
  time: { created: number; updated?: number };
};

export type OpenCodeTree = {
  rootId: string;
  sessions: NormalizedSession[];
  messagesBySession: Record<string, OpenCodeMessage[]>;
};

export type ModelLimitIndex = Record<string, number>;

export type ModelGroup = {
  sessionId: string;
  model: string;
  calls: number;
  tokens: TokenSplit;
  cost: number;
};

export type HotSpot = {
  sessionId: string;
  messageId: string;
  observationId: string;
  model: string;
  cost: number;
  tokens: TokenSplit;
  startTime: string;
};

export type ToolStat = {
  sessionId: string;
  name: string;
  success: number;
  error: number;
  unknown: number;
};

export type ErrorGroup = {
  digest: string;
  count: number;
  samples: string[];
};

export type SubsessionProfile = {
  agent: string;
  count: number;
};

export type SubsessionCost = {
  sessionId: string;
  agent: string;
  cost: number;
  shareOfRoot: number | null;
};

export type ContextPeak = {
  tokens: number;
  limit: number;
  ratio: number;
  model: string;
};

export type ReportWarning =
  | {
      kind: "divergence";
      sessionId: string;
      langfuseTotal: number;
      openCodeTotal: number;
      relativeDifference: number;
    }
  | { kind: "orphan-traces"; sessionIds: string[]; traceCount: number };

export type SessionStatsReport = {
  root: NormalizedSession;
  sessions: NormalizedSession[];
  tokensBySession: Record<string, TokenSplit>;
  costBySession: Record<string, number>;
  models: ModelGroup[];
  hotspots: HotSpot[];
  tools: ToolStat[];
  errors: ErrorGroup[];
  subsessionProfile: SubsessionProfile[];
  subsessionCosts: SubsessionCost[];
  cacheHitRate: number | null;
  cacheTotals: { cacheRead: number; input: number };
  contextPeak: ContextPeak | null;
  warnings: ReportWarning[];
  generatedAt: Millis;
};

export type OpenCodeSource = {
  /** Root session plus all descendants, in deterministic tree order (root first, depth-first). */
  getTree(rootSessionId: string): Promise<OpenCodeTree>;
  /** Context-window limits indexed by `${providerID}/${modelID}`. Missing entries render as n/a. */
  getModelLimits(): Promise<ModelLimitIndex>;
};

export type LangfuseTraceSummary = {
  id: string;
  sessionId: string | undefined;
  userId: string | undefined;
  metadata: unknown;
};

export type LangfuseSource = {
  /** All traces Argo filed under the root session id, filtered by user when known. */
  getTraces(rootSessionId: string, userId: string | undefined): Promise<LangfuseTraceSummary[]>;
  /** Full observation set for one trace. */
  getObservations(traceId: string): Promise<UnknownObservation[]>;
};

/** Raw Langfuse observation as returned by the public API; normalized by `sources.ts`. */
export type UnknownObservation = {
  id: string;
  type: string;
  name?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  model?: string | null;
  modelParameters?: Record<string, unknown> | null;
  usageDetails?: Record<string, number> | null;
  costDetails?: Record<string, number> | null;
  metadata?: unknown;
  level?: string | null;
  statusMessage?: string | null;
};

export type LangfuseConfig = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  userId: string | undefined;
};

// ---------------------------------------------------------------------------
// Verified TUI runtime adapter (structural types; see the header note).
// ---------------------------------------------------------------------------

export type TuiKeyEvent = {
  name?: string;
  key?: string;
};

export type TuiKeyInterceptInfo = {
  event: TuiKeyEvent;
  consume: (options?: { preventDefault?: boolean; stopPropagation?: boolean }) => void;
};

export type TuiKeymap = {
  intercept: (
    kind: "key",
    handler: (info: TuiKeyInterceptInfo) => void,
    options?: { priority?: number },
  ) => () => void;
  registerLayer: (layer: Record<string, unknown>) => () => void;
};

export type TuiRoute = {
  current:
    | { name: string; params?: Record<string, unknown> }
    | { name: "session"; params: { sessionID: string } }
    | { name: "home" };
};

export type TuiPromptEditor = {
  plainText: string;
  focused: boolean;
  isDestroyed?: boolean;
  clear: () => void;
  submit: () => unknown;
};

export type TuiRenderer = {
  currentFocusedEditor: unknown;
};

export type TuiToastInput = {
  message: string;
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  duration?: number;
};

export type TuiUi = {
  toast: (input: TuiToastInput) => void;
};

export type TuiClient = {
  session: {
    promptAsync: (parameters: {
      sessionID: string;
      noReply?: boolean;
      parts?: Array<{ type: "text"; text: string; metadata?: Record<string, unknown> }>;
    }) => Promise<{ error?: unknown }>;
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

export type TuiLifecycle = {
  signal: AbortSignal;
  onDispose: (fn: () => void | Promise<void>) => () => void;
};

export type TuiApi = {
  keymap: TuiKeymap;
  route: TuiRoute;
  renderer: TuiRenderer;
  ui: TuiUi;
  client: TuiClient;
  lifecycle: TuiLifecycle;
};

export type TuiPluginModule = {
  id?: string;
  tui: (api: TuiApi) => Promise<void>;
};
