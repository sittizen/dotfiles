/**
 * pi plugin mirror of the opencode ArgoPlugin.
 *
 * Logs token usage / costs to the on-premise Langfuse server.
 * Configuration is read from the SAME sources as the opencode plugin:
 *   - ~/.config/argo/config.json  (preferred when present)
 *   - environment variables: ARGO_TEAM, ARGO_LANGFUSE_SECRET_KEY,
 *     ARGO_LANGFUSE_PUBLIC_KEY, ARGO_LANGFUSE_BASE_URL
 *
 * Behaviour parity with ArgoPlugin.ts (opencode):
 *   - sends telemetry when the session idles (agent_settled) and on shutdown
 *   - one langfuse session per root session, one trace per session file
 *     (fork children join their root session's langfuse sessionId)
 *   - one generation per assistant message carrying token usage, one span per
 *     tool call, stable ids (upsert = idempotent re-sends)
 *   - text mode (config.text !== false) omits input/output parts and toolCalls
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import https from "node:https";
import Langfuse from "langfuse";
import {
  VERSION,
  type ExtensionAPI,
  type ExtensionContext,
  type SessionManager,
} from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// CA-aware transport
//
// The on-prem Langfuse server uses a Moltiply internal CA that node's default
// fetch does not trust (pi runs on node, unlike opencode which runs on Bun).
// We subclass Langfuse and override its `fetch` with an https-based transport
// that validates against the system CA store. The payload and config are
// unchanged — this only fixes TLS trust for the langfuse host.
// ---------------------------------------------------------------------------

type ArgoFetchOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH";
  headers: Record<string, string>;
  body?: string | Buffer;
  signal?: AbortSignal;
};

const CA_BUNDLE_CANDIDATES = [
  process.env.NODE_EXTRA_CA_CERTS,
  "/etc/ssl/certs/ca-certificates.crt", // Debian / Ubuntu
  "/etc/pki/tls/certs/ca-bundle.crt", // RHEL / Fedora
  "/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem", // RHEL alt
  "/etc/ssl/cert.pem", // macOS / others
].filter((path): path is string => Boolean(path));

let caBundle: Buffer | undefined;
for (const candidate of CA_BUNDLE_CANDIDATES) {
  try {
    const content = readFileSync(candidate, "utf-8");
    if (content.includes("BEGIN CERTIFICATE")) {
      caBundle = Buffer.from(content);
      break;
    }
  } catch {
    // try next candidate
  }
}

const caFetch = (
  url: string,
  options: ArgoFetchOptions,
): Promise<Response> =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: options.method ?? "GET",
        headers: {
          ...options.headers,
          "accept-encoding": "identity",
        },
        ca: caBundle,
        servername: target.hostname,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (value !== undefined) {
              headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
            }
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 500,
              statusText: res.statusMessage,
              headers,
            }),
          );
        });
      },
    );
    req.on("error", reject);
    if (options.signal) {
      if (options.signal.aborted) {
        req.destroy(new DOMException("The operation was aborted.", "AbortError"));
      } else {
        options.signal.addEventListener("abort", () =>
          req.destroy(new DOMException("The operation was aborted.", "AbortError")),
          { once: true },
        );
      }
    }
    if (options.body) req.write(options.body);
    req.end();
  });

class ArgoLangfuse extends Langfuse {
  fetch(url: string, options: ArgoFetchOptions): Promise<Response> {
    if (caBundle && url.startsWith("https://")) {
      return caFetch(url, options);
    }
    return super.fetch(url, options);
  }
}

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

type TokenUsage = {
  total?: number;
  input: number;
  output: number;
  reasoning: number;
  cache: {
    read: number;
    write: number;
  };
};

/** pi session summary (header + display name). */
type PiSessionInfo = {
  id: string;
  version?: number;
  cwd: string;
  createdAt?: string;
  parentSession?: string;
  parentSessionId?: string;
  name?: string;
};

/** One session file worth of collected data. */
type CollectedSession = {
  session: PiSessionInfo;
  /** assistant messages carrying token usage (mirrors opencode's filtered list) */
  messages: CollectedMessage[];
  /** every assistant + toolResult message entry (needed for turn end times / tool spans) */
  allMessages: CollectedMessage[];
};

type CollectedMessage = {
  entryId: string;
  parentId: string | null;
  timestamp: string;
  message: PiAssistantMessage | PiToolResultMessage;
};

type PiAssistantMessage = {
  role: "assistant";
  provider: string;
  model: string;
  stopReason?: string;
  errorMessage?: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    reasoning?: number;
    totalTokens: number;
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    };
  };
  content: Array<{
    type: string;
    text?: string;
    thinking?: string;
    id?: string;
    name?: string;
    arguments?: Record<string, unknown>;
  }>;
};

type PiToolResultMessage = {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: Array<{ type: string; text?: string }>;
  isError: boolean;
};

// ---------------------------------------------------------------------------
// identity / environment
// ---------------------------------------------------------------------------

let team = "unknown";
let userId: string;
let projectId: string;

const getUserId = (): string => {
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), ".config", "argo", "config.json"), "utf-8"),
    );
    if (typeof cfg.user === "string" && cfg.user.length > 0) return cfg.user;
  } catch {
    // ignore — fall through to environment or whoami
  }
  const envUser = process.env.ARGO_USER;
  if (typeof envUser === "string" && envUser.length > 0) return envUser;
  try {
    return execSync("whoami", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
};

const getProjectId = (): string => {
  try {
    const output = execSync("uv version 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
    const name = output.split(/\s+/)[0];
    if (name) return name;
  } catch {
    // not an uv project
  }
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
    const dirName = gitRoot.split("/").pop();
    if (dirName) return dirName;
  } catch {
    // not in a git project
  }
  try {
    return process.cwd().split("/").pop() ?? "unknown";
  } catch {
    return "unknown";
  }
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const hasTokenUsage = (message: unknown): message is CollectedMessage => {
  const candidate = message as Partial<CollectedMessage> | undefined;
  const msg = candidate?.message as Partial<PiAssistantMessage> | undefined;
  return Boolean(
    candidate &&
      msg &&
      msg.role === "assistant" &&
      msg.usage &&
      msg.usage.totalTokens > 0 &&
      candidate.entryId,
  );
};

const toDate = (timestamp?: string | number) =>
  timestamp ? new Date(timestamp) : undefined;

const stableId = (value: string) => {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(
    (Number.parseInt(hex.slice(16, 18), 16) & 0x3f) |
    0x80
  ).toString(16)}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
};

const getTextOutput = (content: PiAssistantMessage["content"]) =>
  content
    .filter((part) => part.type === "text" && part.text)
    .map((part) => ({ type: "text", content: part.text }))
    .filter((part) => (part.content ?? "").length > 0);

const getReasoningOutput = (content: PiAssistantMessage["content"]) =>
  content
    .filter((part) => part.type === "thinking" && part.thinking)
    .map((part) => ({ type: "reasoning", content: part.thinking }));

const getToolTextOutput = (result: PiToolResultMessage) =>
  result.content
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n");

/** pi usage -> opencode-shaped TokenUsage (pi's output includes reasoning). */
const getTokenUsage = (usage: PiAssistantMessage["usage"]): TokenUsage => {
  const reasoning = usage.reasoning ?? 0;
  return {
    total: usage.totalTokens,
    input: usage.input,
    output: usage.output - reasoning,
    reasoning,
    cache: {
      read: usage.cacheRead,
      write: usage.cacheWrite,
    },
  };
};

const getTokenTotal = (tokens: TokenUsage) =>
  tokens.total ??
  tokens.input +
    tokens.output +
    tokens.reasoning +
    tokens.cache.read +
    tokens.cache.write;

const getUsageDetails = (tokens?: TokenUsage) => {
  if (!tokens) return undefined;

  return {
    input: tokens.input,
    output: tokens.output,
    total: getTokenTotal(tokens),
    reasoning: tokens.reasoning,
    cache_read_input_tokens: tokens.cache.read,
    cache_write_input_tokens: tokens.cache.write,
  };
};

const getCostDetails = (cost?: number) =>
  typeof cost === "number" && cost > 0 ? { total: cost } : undefined;

const getOtelTokenAttributes = (tokens: TokenUsage) => ({
  "gen_ai.usage.input_tokens":
    tokens.input + tokens.cache.read + tokens.cache.write,
  "gen_ai.usage.output_tokens": tokens.output + tokens.reasoning,
  "gen_ai.usage.reasoning_tokens": tokens.reasoning,
  "gen_ai.usage.cache_read.input_tokens": tokens.cache.read,
  "gen_ai.usage.cache_creation.input_tokens": tokens.cache.write,
  "gen_ai.usage.total_tokens": getTokenTotal(tokens),
});

const getCommits = (since: unknown, until: unknown): string[] => {
  try {
    const after = new Date(since as string | number).toISOString();
    const before = new Date(until as string | number).toISOString();
    const output = execSync(
      `git log --format=%H --after="${after}" --before="${before}" --no-merges 2>/dev/null`,
      { encoding: "utf-8" },
    ).trim();
    return output ? output.split("\n") : [];
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// session collection
// ---------------------------------------------------------------------------

const collectSession = (sm: SessionManager): CollectedSession => {
  const header = sm.getHeader();
  const entries = sm.getEntries();
  const allMessages: CollectedMessage[] = [];

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const msg = entry.message as unknown as PiAssistantMessage | PiToolResultMessage;
    if (msg.role !== "assistant" && msg.role !== "toolResult") continue;
    allMessages.push({
      entryId: entry.id,
      parentId: entry.parentId,
      timestamp: entry.timestamp,
      message: msg,
    });
  }

  return {
    session: {
      id: header?.id ?? sm.getSessionId(),
      version: header?.version,
      cwd: header?.cwd ?? sm.getCwd(),
      createdAt: header?.timestamp,
      parentSession: header?.parentSession,
      name: sm.getSessionName(),
    },
    messages: allMessages.filter(hasTokenUsage),
    allMessages,
  };
};

/** Read a persisted session file (ancestor sessions of a fork). */
const readSessionFile = (file: string): CollectedSession | undefined => {
  try {
    const lines = readFileSync(file, "utf-8").split("\n");
    const allMessages: CollectedMessage[] = [];
    let header: {
      id?: string;
      version?: number;
      cwd?: string;
      timestamp?: string;
      parentSession?: string;
    } = {};
    let name: string | undefined;

    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.type === "session") {
        header = entry as typeof header;
        continue;
      }
      if (entry.type === "session_info") {
        if (typeof entry.name === "string") name = entry.name;
        continue;
      }
      if (entry.type !== "message") continue;
      const msg = entry.message as PiAssistantMessage | PiToolResultMessage;
      if (!msg || (msg.role !== "assistant" && msg.role !== "toolResult")) {
        continue;
      }
      allMessages.push({
        entryId: entry.id as string,
        parentId: (entry.parentId as string | null) ?? null,
        timestamp: entry.timestamp as string,
        message: msg,
      });
    }

    return {
      session: {
        id: header.id ?? "",
        version: header.version,
        cwd: header.cwd ?? "",
        createdAt: header.timestamp,
        parentSession: header.parentSession,
        name,
      },
      messages: allMessages.filter(hasTokenUsage),
      allMessages,
    };
  } catch {
    return undefined;
  }
};

/**
 * Build the session tree: current session + every ancestor (via header
 * parentSession chain). Root first. Resolves each child's parentSessionId.
 */
const getSessionTree = (current: CollectedSession): CollectedSession[] => {
  const chain: CollectedSession[] = [];
  const seen = new Set<string>();
  let node: CollectedSession | undefined = current;
  let guard = 0;

  while (node && guard++ < 64) {
    if (!node.session.id || seen.has(node.session.id)) break;
    seen.add(node.session.id);
    chain.push(node);

    const parentPath = node.session.parentSession;
    if (!parentPath) break;

    const parent = readSessionFile(parentPath);
    if (parent) node.session.parentSessionId = parent.session.id;
    node = parent;
  }

  return chain.reverse();
};

/** Map assistant entryId -> end time (last toolResult of the turn). */
const getTurnEndTimes = (
  messages: CollectedMessage[],
): Map<string, string> => {
  const endTimes = new Map<string, string>();
  for (let i = 0; i < messages.length; i++) {
    const current = messages[i];
    if (current.message.role !== "assistant") continue;
    let end = current.timestamp;
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].message.role === "toolResult") end = messages[j].timestamp;
      else break;
    }
    endTimes.set(current.entryId, end);
  }
  return endTimes;
};

const getToolResults = (messages: CollectedMessage[]) => {
  const map = new Map<string, PiToolResultMessage & { timestamp: string }>();
  for (const m of messages) {
    if (m.message.role === "toolResult") {
      map.set(m.message.toolCallId, { ...m.message, timestamp: m.timestamp });
    }
  }
  return map;
};

// ---------------------------------------------------------------------------
// langfuse payloads
// ---------------------------------------------------------------------------

const getSessionMetadata = (entry: CollectedSession) => {
  const lastMessage = entry.allMessages.at(-1);
  const endTime = lastMessage?.timestamp ?? entry.session.createdAt;
  const commits = getCommits(entry.session.createdAt, endTime);

  return {
    pi: {
      session: entry.session,
      messageCount: entry.messages.length,
    },
    resourceAttributes: {
      user: userId,
      team,
      organization: "Moltiply",
      project: projectId,
      commits: commits,
      "service.name": "pi",
      "service.version": VERSION,
      "gen_ai.system": "pi",
      "gen_ai.operation.name": "chat",
      "gen_ai.conversation.id": entry.session.id,
      "session.id": entry.session.id,
      "session.parent_id": entry.session.parentSessionId ?? null,
      "pi.session.cwd": entry.session.cwd,
    },
  };
};

const getMessageMetadata = (
  entry: CollectedSession,
  message: CollectedMessage,
  tokens: TokenUsage,
  endTime: string | undefined,
) => ({
  pi: {
    session: entry.session,
    message: {
      id: message.entryId,
      parentID: message.parentId,
      time: {
        created: message.timestamp,
        completed: endTime ?? message.timestamp,
      },
      providerID: message.message.role === "assistant" ? message.message.provider : undefined,
      modelID: message.message.role === "assistant" ? message.message.model : undefined,
      finish: message.message.role === "assistant" ? message.message.stopReason : undefined,
      error: message.message.role === "assistant" ? message.message.errorMessage : undefined,
      tokens,
      cost:
        message.message.role === "assistant"
          ? message.message.usage.cost.total
          : undefined,
    },
    parts: message.message.content,
  },
  attributes: {
    "service.name": "pi",
    "gen_ai.system": "pi",
    "gen_ai.operation.name": "chat",
    "gen_ai.conversation.id": entry.session.parentSessionId ?? entry.session.id,
    "gen_ai.provider.name":
      message.message.role === "assistant" ? message.message.provider : undefined,
    "gen_ai.request.model":
      message.message.role === "assistant" ? message.message.model : undefined,
    "gen_ai.response.model":
      message.message.role === "assistant" ? message.message.model : undefined,
    ...getOtelTokenAttributes(tokens),
    "pi.session.id": entry.session.id,
    "pi.session.parent_id": entry.session.parentSessionId ?? null,
    "pi.message.id": message.entryId,
    "pi.message.parent_id": message.parentId,
    "pi.message.finish":
      message.message.role === "assistant" ? message.message.stopReason : undefined,
  },
  resourceAttributes: {
    "service.name": "pi",
    "service.version": VERSION,
    organization: "Moltiply",
    team: team,
  },
});

const getToolCallState = (
  part: PiAssistantMessage["content"][number],
  result: (PiToolResultMessage & { timestamp: string }) | undefined,
) => {
  if (!result) return { status: "pending", input: part.arguments };
  const text = getToolTextOutput(result);
  return {
    status: result.isError ? "error" : "completed",
    input: part.arguments,
    output: result.isError ? undefined : text,
    error: result.isError ? text : undefined,
  };
};

const createLangfuseSession = async (
  langfuse: Langfuse,
  sessions: CollectedSession[],
  idleSessionID: string,
  textMode: boolean,
) => {
  // langfuse sessionId = the root (parent-less) session, like opencode groups
  // child sessions under the main session.
  const root =
    sessions.find((entry) => !entry.session.parentSession) ?? sessions[0];
  const sessionId = root?.session.id ?? idleSessionID;

  for (const entry of sessions) {
    const trace = langfuse.trace({
      id: stableId(`trace:${entry.session.id}`),
      name: entry.session.name,
      sessionId,
      userId,
      timestamp: toDate(entry.session.createdAt),
      version: VERSION,
      input: {}, // leave empty to save space, we are just interested in costs
      output: {}, // same
      metadata: getSessionMetadata(entry),
      tags: [userId, projectId].filter((tag): tag is string => Boolean(tag)),
    });

    const endTimes = getTurnEndTimes(entry.allMessages);
    const toolResults = getToolResults(entry.allMessages);

    for (const message of entry.messages) {
      const info = message.message as PiAssistantMessage;
      const tokens = getTokenUsage(info.usage);
      const endTime = endTimes.get(message.entryId) ?? message.timestamp;

      const generation = trace.generation({
        id: stableId(`generation:${message.entryId}`),
        name: `${info.provider}/${info.model}`,
        startTime: toDate(message.timestamp),
        endTime: toDate(endTime),
        model: info.model,
        modelParameters: {
          provider: info.provider,
        },
        // omit input.parts / output.parts / output.toolCalls when textMode is true
        input: {
          role: info.role,
          parentMessageId: message.parentId,
          parts: [], // pi has no opencode step-start/file parts
        },
        output: {
          role: info.role,
          parts: textMode
            ? []
            : [
                ...getReasoningOutput(info.content),
                ...getTextOutput(info.content),
              ],
          toolCalls: textMode
            ? []
            : info.content
                .filter((part) => part.type === "toolCall" && part.id)
                .map((part) => ({
                  id: part.id,
                  name: part.name,
                  state: getToolCallState(part, toolResults.get(part.id!)),
                })),
          finishReason: info.stopReason,
        },
        usage: {
          promptTokens: tokens.input,
          completionTokens: tokens.output,
          totalTokens: getTokenTotal(tokens),
        },
        usageDetails: getUsageDetails(tokens),
        costDetails: getCostDetails(info.usage.cost?.total),
        metadata: getMessageMetadata(entry, message, tokens, endTime),
        level: info.errorMessage ? "ERROR" : "DEFAULT",
        statusMessage: info.errorMessage
          ? JSON.stringify(info.errorMessage)
          : info.stopReason,
      });

      for (const part of info.content) {
        if (part.type !== "toolCall" || !part.id) continue;

        const result = toolResults.get(part.id);
        const status = result
          ? result.isError
            ? "error"
            : "completed"
          : "pending";

        generation.span({
          id: stableId(`tool:${part.id}`),
          name: `tool ${part.name ?? ""}`,
          startTime: toDate(message.timestamp),
          endTime: result ? toDate(result.timestamp) : undefined,
          input: part.arguments,
          output: result ? getToolTextOutput(result) : undefined,
          metadata: {
            pi: {
              part: {
                id: part.id,
                callID: part.id,
                tool: part.name,
                state: getToolCallState(part, result),
              },
            },
            attributes: {
              "service.name": "pi",
              "gen_ai.operation.name": "execute_tool",
              "gen_ai.tool.name": part.name,
              "gen_ai.tool.call.id": part.id,
              "pi.session.id": entry.session.id,
              "pi.message.id": message.entryId,
              "pi.part.id": part.id,
              "pi.tool.status": status,
            },
          },
          level: status === "error" ? "ERROR" : "DEFAULT",
          statusMessage: status,
        });
      }
    }
  }

  await langfuse.flushAsync();
};

// ---------------------------------------------------------------------------
// plugin
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // load valid config from file or environment variables (same sources as
  // the opencode ArgoPlugin)
  let config: {
    team?: string;
    user?: string;
    text?: boolean;
    langfuse?: {
      secret_key?: string;
      public_key?: string;
      base_url?: string;
    };
  } | undefined;
  try {
    config = JSON.parse(
      readFileSync(join(homedir(), ".config", "argo", "config.json"), "utf-8"),
    );
  } catch {
    config = undefined;
  }

  const textMode = config?.text !== false;
  userId = getUserId();
  projectId = getProjectId();

  let secretKey: string | undefined;
  let publicKey: string | undefined;
  let baseUrl: string | undefined;

  if (config) {
    team =
      typeof config.team === "string" && config.team.length > 0
        ? config.team
        : "unknown";
    secretKey = config.langfuse?.secret_key;
    publicKey = config.langfuse?.public_key;
    baseUrl = config.langfuse?.base_url;

    if (!secretKey || !publicKey || !baseUrl) {
      console.error(
        "[argo] langfuse.secret_key, langfuse.public_key, langfuse.base_url must be set in ~/.config/argo/config.json — plugin disabled",
      );
      return;
    }
    console.info("[argo] config loaded\n");
  } else {
    team = process.env.ARGO_TEAM || "unknown";
    secretKey = process.env.ARGO_LANGFUSE_SECRET_KEY;
    publicKey = process.env.ARGO_LANGFUSE_PUBLIC_KEY;
    baseUrl = process.env.ARGO_LANGFUSE_BASE_URL;

    if (!secretKey || !publicKey || !baseUrl) {
      console.warn(
        "[argo] No ~/.config/argo/config.json found and required environment variables (ARGO_LANGFUSE_SECRET_KEY, ARGO_LANGFUSE_PUBLIC_KEY, ARGO_LANGFUSE_BASE_URL) not set — plugin disabled",
      );
      return;
    }
    console.info("[argo] config loaded from environment variables\n");
  }

  const langfuse = new ArgoLangfuse({
    secretKey,
    publicKey,
    baseUrl,
    sdkIntegration: "pi-argo-plugin",
  });
  langfuse.on("error", () => {
    console.warn("[argo] langfuse server unreachable — telemetry degraded");
  });

  const sendSessionTelemetry = async (ctx: ExtensionContext) => {
    try {
      const current = collectSession(ctx.sessionManager);
      const sessionEntries = getSessionTree(current);
      await createLangfuseSession(
        langfuse,
        sessionEntries,
        current.session.id,
        textMode,
      );
    } catch {
      console.warn(
        "[argo] langfuse server unreachable — telemetry skipped",
      );
    }
  };

  pi.on("agent_settled", async (_event, ctx) => {
    await sendSessionTelemetry(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await sendSessionTelemetry(ctx);
    try {
      await langfuse.shutdownAsync();
    } catch {
      console.warn(
        "[argo] langfuse server unreachable during shutdown — ignored",
      );
    }
  });
}
