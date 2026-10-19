import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { LangfuseClient } from "@langfuse/client";
import {
  LANGFUSE_SDK_VERSION,
  LANGFUSE_TRACER_NAME,
  LangfuseOtelSpanAttributes,
  serializeValue,
  type OtelAttribute,
  type OtelAttributeValue,
  type OtelSpan,
  type OtelTraceRequest,
} from "@langfuse/core";
import { createObservationAttributes } from "@langfuse/tracing";
import type { Hooks, Plugin } from "@opencode-ai/plugin";
import type { AssistantMessage, Part, Session } from "@opencode-ai/sdk";

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

type pytcSession = Session & {
  slug?: string;
  path?: string;
  cost?: number;
  tokens?: TokenUsage;
  agent?: string;
  model?: {
    id: string;
    providerID: string;
    variant?: string;
  };
  permission?: unknown;
  metadata?: Record<string, unknown>;
};

type pytcAssistantMessage = AssistantMessage & {
  tokens: TokenUsage;
  agent?: string;
  variant?: string;
};

type SessionMessage = {
  info: pytcAssistantMessage;
  parts: Part[];
};

type SessionMessages = {
  session: pytcSession;
  messages: SessionMessage[];
};

const getpytcConfigPath = () =>
  join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "pytc",
    "config.json",
  );

const getUserId = (): string => {
  try {
    const cfg = JSON.parse(readFileSync(getpytcConfigPath(), "utf-8"));
    if (typeof cfg.user === "string" && cfg.user.length > 0) return cfg.user;
  } catch {
    // ignore — fall through to environment or whoami
  }
  const envUser = process.env.PYTC_USER;
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

const LANGFUSE_UNREACHABLE =
  "\x1b[31m[pytc] Logging Impossible due to Langfuse server unreachable\x1b[0m";

const isLangfuseReachable = async (langfuse: LangfuseClient): Promise<boolean> => {
  try {
    await langfuse.api.health.health();
    return true;
  } catch {
    return false;
  }
};

let team = "unknown";
let userId: string;
let projectId: string;

const collectedSessions: SessionMessages[] = [];

const upsertSession = (session: pytcSession) => {
  const existing = collectedSessions.find(
    (entry) => entry.session.id === session.id,
  );
  if (existing) existing.session = session;
  else collectedSessions.push({ session, messages: [] });
};

const getSessionTree = (rootSessionID: string) => {
  const selected = new Map<string, SessionMessages>();
  const visit = (sessionID: string) => {
    const entry = collectedSessions.find(
      (candidate) => candidate.session.id === sessionID,
    );
    if (!entry || selected.has(sessionID)) return;

    selected.set(sessionID, entry);
    for (const child of collectedSessions.filter(
      (candidate) => candidate.session.parentID === sessionID,
    )) {
      visit(child.session.id);
    }
  };

  visit(rootSessionID);
  return [...selected.values()];
};

const hasTokenUsage = (message: unknown): message is SessionMessage => {
  const candidate = message as Partial<SessionMessage> | undefined;
  return Boolean(
    candidate?.info &&
    candidate.info.role === "assistant" &&
    "tokens" in candidate.info &&
    candidate.info.tokens &&
    candidate.parts,
  );
};

const stableHex = (value: string, length: number) =>
  createHash("sha256").update(value).digest("hex").slice(0, length);

const stableTraceId = (value: string) => stableHex(value, 32);

const stableSpanId = (value: string) => stableHex(value, 16);

const toUnixNano = (timestamp?: number) =>
  timestamp !== undefined
    ? (BigInt(Math.trunc(timestamp)) * 1_000_000n).toString()
    : undefined;

const toAttributeValue = (value: unknown): OtelAttributeValue | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { intValue: value }
      : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  return { stringValue: serializeValue(value) ?? String(value) };
};

const toOtelAttributes = (
  attributes: Record<string, unknown>,
): OtelAttribute[] =>
  Object.entries(attributes).flatMap(([key, value]) => {
    const converted = toAttributeValue(value);
    return converted ? [{ key, value: converted }] : [];
  });

const flattenTraceMetadata = (metadata?: Record<string, unknown>) => {
  const attributes: Record<string, unknown> = {};
  if (!metadata) return attributes;
  for (const [key, value] of Object.entries(metadata)) {
    const serialized = serializeValue(value);
    if (serialized !== undefined) {
      attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.${key}`] =
        serialized;
    }
  }
  return attributes;
};

const getTextOutput = (parts: Part[]) =>
  parts
    .filter((part) => part.type === "text")
    .map((part) => ({ type: "text", content: part.text }))
    .filter((part) => part.content.length > 0);

const getReasoningOutput = (parts: Part[]) =>
  parts
    .filter((part) => part.type === "reasoning")
    .map((part) => ({ type: "reasoning", content: part.text }));

const getToolCalls = (parts: Part[]) =>
  parts
    .filter((part) => part.type === "tool")
    .map((part) => ({
      id: part.callID,
      name: part.tool,
      state: part.state,
    }));

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

const getCommits = (since: number, until: number): string[] => {
  try {
    const after = new Date(since).toISOString();
    const before = new Date(until).toISOString();
    const output = execSync(
      `git log --format=%H --after="${after}" --before="${before}" --no-merges 2>/dev/null`,
      { encoding: "utf-8" },
    ).trim();
    return output ? output.split("\n") : [];
  } catch {
    return [];
  }
};

const getSessionMetadata = (entry: SessionMessages) => {
  const lastMessage = entry.messages.at(-1);
  const endTime =
    lastMessage?.info.time.completed ?? entry.session.time.created;
  const commits = getCommits(entry.session.time.created, endTime);

  return {
    opencode: {
      session: entry.session,
      messageCount: entry.messages.length,
    },
    resourceAttributes: {
      user: userId,
      team,
      organization: "Moltiply",
      project: projectId,
      commits: commits,
      "service.name": "opencode",
      "service.version": entry.session.version,
      "gen_ai.system": "opencode",
      "gen_ai.operation.name": "chat",
      "gen_ai.conversation.id": entry.session.id,
      "gen_ai.agent.name": entry.session.agent,
      "gen_ai.request.model": entry.session.model?.id,
      "gen_ai.provider.name": entry.session.model?.providerID,
      "session.id": entry.session.id,
      "session.slug": entry.session.slug,
      "session.parent_id": entry.session.parentID,
      "opencode.project.id": entry.session.projectID,
    },
  };
};

const getMessageMetadata = (
  entry: SessionMessages,
  message: SessionMessage,
) => ({
  opencode: {
    session: entry.session,
    message: message.info,
    parts: message.parts,
  },
  attributes: {
    "service.name": "opencode",
    "gen_ai.system": "opencode",
    "gen_ai.operation.name": "chat",
    "gen_ai.conversation.id": entry.session.parentID ?? entry.session.id,
    "gen_ai.provider.name": message.info.providerID,
    "gen_ai.request.model": message.info.modelID,
    "gen_ai.response.model": message.info.modelID,
    "gen_ai.agent.name": message.info.agent ?? entry.session.agent,
    ...getOtelTokenAttributes(message.info.tokens),
    "opencode.session.id": entry.session.id,
    "opencode.session.parent_id": entry.session.parentID,
    "opencode.message.id": message.info.id,
    "opencode.message.parent_id": message.info.parentID,
    "opencode.message.finish": message.info.finish,
    "opencode.message.mode": message.info.mode,
  },
  resourceAttributes: {
    "service.name": "opencode",
    "service.version": entry.session.version,
    organization: "Moltiply",
    team: team,
    user: userId,
  },
});

const createLangfuseSession = async (
  langfuse: LangfuseClient,
  entries: SessionMessages[],
  idleSessionID: string,
  textMode: boolean,
) => {
  const root = entries.find((entry) => entry.session.id === idleSessionID);
  const rootSession =
    root?.session ?? entries.find((entry) => !entry.session.parentID)?.session;
  const sessionId = rootSession?.id ?? idleSessionID;

  const resourceSpans: OtelTraceRequest["resourceSpans"] = entries.map(
    (entry) => {
      const traceId = stableTraceId(`trace:${entry.session.id}`);
      const rootSpanId = stableSpanId(`session:${entry.session.id}`);
      const lastMessage = entry.messages.at(-1);
      const endTime =
        lastMessage?.info.time.completed ?? entry.session.time.created;

      const rootAttributes: Record<string, unknown> = {
        [LangfuseOtelSpanAttributes.OBSERVATION_TYPE]: "span",
        [LangfuseOtelSpanAttributes.TRACE_NAME]:
          entry.session.title || entry.session.slug,
        [LangfuseOtelSpanAttributes.TRACE_SESSION_ID]: sessionId,
        [LangfuseOtelSpanAttributes.TRACE_USER_ID]: userId,
        [LangfuseOtelSpanAttributes.VERSION]: entry.session.version,
        // leave input/output empty to save space, we are just interested in costs
        [LangfuseOtelSpanAttributes.TRACE_INPUT]: "{}",
        [LangfuseOtelSpanAttributes.TRACE_OUTPUT]: "{}",
        [LangfuseOtelSpanAttributes.TRACE_TAGS]: serializeValue(
          [entry.session.agent, userId, projectId].filter(
            (tag): tag is string => Boolean(tag),
          ),
        ),
        ...flattenTraceMetadata(getSessionMetadata(entry)),
      };

      const spans: OtelSpan[] = [
        {
          traceId,
          spanId: rootSpanId,
          name: entry.session.title || entry.session.slug || "session",
          kind: 1,
          startTimeUnixNano: toUnixNano(entry.session.time.created),
          endTimeUnixNano: toUnixNano(endTime),
          attributes: toOtelAttributes(rootAttributes),
          status: {},
        },
      ];

      for (const message of entry.messages) {
        const generationSpanId = stableSpanId(`generation:${message.info.id}`);
        spans.push({
          traceId,
          spanId: generationSpanId,
          parentSpanId: rootSpanId,
          name: `${message.info.providerID}/${message.info.modelID}`,
          kind: 1,
          startTimeUnixNano: toUnixNano(message.info.time.created),
          endTimeUnixNano: toUnixNano(message.info.time.completed),
          attributes: toOtelAttributes(
            createObservationAttributes("generation", {
              model: message.info.modelID,
              modelParameters: {
                provider: message.info.providerID,
                mode: message.info.mode,
                ...((message.info.agent ?? entry.session.agent)
                  ? { agent: message.info.agent ?? entry.session.agent }
                  : {}),
                ...((message.info.variant ?? entry.session.model?.variant)
                  ? {
                      variant:
                        message.info.variant ?? entry.session.model?.variant,
                    }
                  : {}),
              },
              // omit input.parts, output.parts, output.toolCalls when textMode is true
              input: {
                role: message.info.role,
                parentMessageId: message.info.parentID,
                parts: textMode
                  ? []
                  : message.parts.filter(
                      (part) =>
                        part.type === "step-start" || part.type === "file",
                    ),
              },
              output: {
                role: message.info.role,
                parts: textMode
                  ? []
                  : [
                      ...getReasoningOutput(message.parts),
                      ...getTextOutput(message.parts),
                    ],
                toolCalls: textMode ? [] : getToolCalls(message.parts),
                finishReason: message.info.finish,
              },
              usageDetails: getUsageDetails(message.info.tokens),
              costDetails: getCostDetails(message.info.cost),
              metadata: getMessageMetadata(entry, message),
              level: message.info.error ? "ERROR" : "DEFAULT",
              statusMessage: message.info.error
                ? JSON.stringify(message.info.error)
                : message.info.finish,
            }),
          ),
          status: message.info.error ? { code: 2 } : {},
        });

        for (const part of message.parts) {
          if (part.type !== "tool") continue;

          const state = part.state;
          const hasTime = "time" in state;
          const toolEndTime =
            hasTime && "end" in state.time ? state.time.end : undefined;
          spans.push({
            traceId,
            spanId: stableSpanId(`tool:${part.id}`),
            parentSpanId: generationSpanId,
            name: `tool ${part.tool}`,
            kind: 1,
            startTimeUnixNano: hasTime
              ? toUnixNano(state.time.start)
              : undefined,
            endTimeUnixNano: toUnixNano(toolEndTime),
            attributes: toOtelAttributes(
              createObservationAttributes("span", {
                input: "input" in state ? state.input : undefined,
                output:
                  state.status === "completed"
                    ? state.output
                    : state.status === "error"
                      ? state.error
                      : undefined,
                metadata: {
                  opencode: { part },
                  attributes: {
                    "service.name": "opencode",
                    "gen_ai.operation.name": "execute_tool",
                    "gen_ai.tool.name": part.tool,
                    "gen_ai.tool.call.id": part.callID,
                    "opencode.session.id": entry.session.id,
                    "opencode.message.id": message.info.id,
                    "opencode.part.id": part.id,
                    "opencode.tool.status": state.status,
                  },
                },
                level: state.status === "error" ? "ERROR" : "DEFAULT",
                statusMessage: state.status,
              }),
            ),
            status: state.status === "error" ? { code: 2 } : {},
          });
        }
      }

      return {
        resource: {
          attributes: toOtelAttributes({
            "service.name": "opencode",
            "service.version": entry.session.version,
          }),
        },
        scopeSpans: [
          {
            scope: { name: LANGFUSE_TRACER_NAME, version: LANGFUSE_SDK_VERSION },
            spans,
          },
        ],
      };
    },
  );

  await langfuse.api.opentelemetry.exportTraces(
    { resourceSpans },
    { headers: { "x-langfuse-ingestion-version": "4" } },
  );
};

export const PytcSessionLog: Plugin = async ({ client }) => {
  // load valid config from file or environment variables
  let config:
    | {
        team?: string;
        user?: string;
        text?: boolean;
        langfuse?: {
          secret_key?: string;
          public_key?: string;
          base_url?: string;
        };
      }
    | undefined;
  try {
    config = JSON.parse(readFileSync(getpytcConfigPath(), "utf-8"));
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
        "[pytc] langfuse.secret_key, langfuse.public_key, langfuse.base_url must be set in ~/.config/pytc/config.json — plugin disabled",
      );
      return {};
    }
  } else {
    team = process.env.PYTC_TEAM || "unknown";
    secretKey = process.env.PYTC_LANGFUSE_SECRET_KEY;
    publicKey = process.env.PYTC_LANGFUSE_PUBLIC_KEY;
    baseUrl = process.env.PYTC_LANGFUSE_BASE_URL;

    if (!secretKey || !publicKey || !baseUrl) {
      console.warn(
        "[pytc] No ~/.config/pytc/config.json found and required environment variables (PYTC_LANGFUSE_SECRET_KEY, PYTC_LANGFUSE_PUBLIC_KEY, PYTC_LANGFUSE_BASE_URL) not set — plugin disabled",
      );
      return {};
    }
  }

  const langfuse = new LangfuseClient({
    secretKey,
    publicKey,
    baseUrl,
  });

  if (await isLangfuseReachable(langfuse)) {
    console.info("[pytc] config loaded\n");
  } else {
    console.error(LANGFUSE_UNREACHABLE);
  }

  const hooks: Hooks = {
    event: async ({ event }) => {
      const eventType = event.type as string;
      if (!eventType.startsWith("session.")) return;

      const sessionID = (event.properties as { sessionID?: string }).sessionID;
      if (!sessionID) return;

      if (
        // if we need to collect data from this kind of event start retrieving the whole session
        eventType === "session.next.agent.switched" ||
        eventType === "session.idle"
      ) {
        const session = await client.session.get({
          path: { id: sessionID },
        });

        if (!session.data) return;
        const sessionData = session.data as pytcSession;

        // we collect immediatly session data
        if (eventType === "session.next.agent.switched") {
          upsertSession(sessionData);
        }

        // when the main session idles, we collect messages data (only the ones using tokens)
        if (eventType === "session.idle") {
          if (!sessionData.parentID) {
            upsertSession(sessionData);
            const sessionEntries = getSessionTree(sessionID);

            await Promise.all(
              sessionEntries.map(async (entry) => {
                const msgs = await client.session.messages({
                  path: { id: entry.session.id },
                });
                entry.messages = (msgs.data ?? []).filter(hasTokenUsage);
              }),
            );

            if (!(await isLangfuseReachable(langfuse))) {
              console.error(LANGFUSE_UNREACHABLE);
              return;
            }

            try {
              await createLangfuseSession(
                langfuse,
                sessionEntries,
                sessionID,
                textMode,
              );
            } catch {
              console.error(LANGFUSE_UNREACHABLE);
            }
          }
        }
      }
    },
    dispose: async () => {
      try {
        if (!(await isLangfuseReachable(langfuse))) {
          console.error(LANGFUSE_UNREACHABLE);
          return;
        }
        await langfuse.shutdown();
      } catch {
        console.error(LANGFUSE_UNREACHABLE);
      }
    },
  };

  return hooks;
};

export default PytcSessionLog;
