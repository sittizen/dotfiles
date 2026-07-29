import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import Langfuse from "langfuse";
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

type ArgoSession = Session & {
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

type ArgoAssistantMessage = AssistantMessage & {
  tokens: TokenUsage;
  agent?: string;
  variant?: string;
};

type SessionMessage = {
  info: ArgoAssistantMessage;
  parts: Part[];
};

type SessionMessages = {
  session: ArgoSession;
  messages: SessionMessage[];
};

const getUserId = (): string => {
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), ".config", "argo", "config.json"), "utf-8"),
    );
    if (typeof cfg.user === "string" && cfg.user.length > 0) return cfg.user;
  } catch {
    // ignore — fall through to whoami
  }
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

let team = "unknown";
let userId: string;
let projectId: string;

const collectedSessions: SessionMessages[] = [];

const upsertSession = (session: ArgoSession) => {
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

const toDate = (timestamp?: number) =>
  timestamp ? new Date(timestamp) : undefined;

const stableId = (value: string) => {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(
    (Number.parseInt(hex.slice(16, 18), 16) & 0x3f) |
    0x80
  ).toString(16)}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
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
  },
});

const createLangfuseSession = async (
  langfuse: Langfuse,
  entries: SessionMessages[],
  idleSessionID: string,
  textMode: boolean,
) => {
  const root = entries.find((entry) => entry.session.id === idleSessionID);
  const rootSession =
    root?.session ?? entries.find((entry) => !entry.session.parentID)?.session;
  const sessionId = rootSession?.id ?? idleSessionID;

  for (const entry of entries) {
    const trace = langfuse.trace({
      id: stableId(`trace:${entry.session.id}`),
      name: entry.session.title || entry.session.slug,
      sessionId,
      userId,
      timestamp: toDate(entry.session.time.created),
      version: entry.session.version,
      input: {}, // leave empty to save space, we are just interested in costs
      output: {}, // same
      metadata: getSessionMetadata(entry),
      tags: [entry.session.agent, userId, projectId].filter(
        (tag): tag is string => Boolean(tag),
      ),
    });

    for (const message of entry.messages) {
      const generation = trace.generation({
        id: stableId(`generation:${message.info.id}`),
        name: `${message.info.providerID}/${message.info.modelID}`,
        startTime: toDate(message.info.time.created),
        endTime: toDate(message.info.time.completed),
        model: message.info.modelID,
        modelParameters: {
          provider: message.info.providerID,
          mode: message.info.mode,
          ...((message.info.agent ?? entry.session.agent)
            ? { agent: message.info.agent ?? entry.session.agent }
            : {}),
          ...((message.info.variant ?? entry.session.model?.variant)
            ? { variant: message.info.variant ?? entry.session.model?.variant }
            : {}),
        },
        // omit input.parts, output.parts, output.toolCalls when textMode is true
        input: {
          role: message.info.role,
          parentMessageId: message.info.parentID,
          parts: textMode
            ? []
            : message.parts.filter(
                (part) => part.type === "step-start" || part.type === "file",
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
        usage: {
          promptTokens: message.info.tokens.input,
          completionTokens: message.info.tokens.output,
          totalTokens: getTokenTotal(message.info.tokens),
        },
        usageDetails: getUsageDetails(message.info.tokens),
        costDetails: getCostDetails(message.info.cost),
        metadata: getMessageMetadata(entry, message),
        level: message.info.error ? "ERROR" : "DEFAULT",
        statusMessage: message.info.error
          ? JSON.stringify(message.info.error)
          : message.info.finish,
      });

      for (const part of message.parts) {
        if (part.type !== "tool") continue;

        const state = part.state;
        const hasTime = "time" in state;
        const endTime =
          hasTime && "end" in state.time ? state.time.end : undefined;
        generation.span({
          id: stableId(`tool:${part.id}`),
          name: `tool ${part.tool}`,
          startTime: hasTime ? toDate(state.time.start) : undefined,
          endTime: toDate(endTime),
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
        });
      }
    }
  }

  await langfuse.flushAsync();
};

export const ArgoPlugin: Plugin = async ({ client }) => {
  // load valid config or exit
  let config: {
    team?: string;
    user?: string;
    text?: boolean;
    langfuse?: { secret_key?: string; public_key?: string; base_url?: string };
  } = {};
  try {
    config = JSON.parse(
      readFileSync(join(homedir(), ".config", "argo", "config.json"), "utf-8"),
    );
  } catch {
    console.error(
      "[argo] Failed to read ~/.config/argo/config.json — plugin disabled",
    );
    return {};
  }

  team =
    typeof config.team === "string" && config.team.length > 0
      ? config.team
      : "unknown";
  const textMode = config.text !== false;
  userId = getUserId();
  projectId = getProjectId();

  const secretKey = config.langfuse?.secret_key;
  const publicKey = config.langfuse?.public_key;
  const baseUrl = config.langfuse?.base_url;

  if (!secretKey || !publicKey || !baseUrl) {
    console.error(
      "[argo] langfuse.secret_key, langfuse.public_key, langfuse.base_url must be set in ~/.config/argo/config.json — plugin disabled",
    );
    return {};
  }
  console.info("[argo] config loaded\n");

  const langfuse = new Langfuse({
    secretKey,
    publicKey,
    baseUrl,
    sdkIntegration: "opencode-argo-plugin",
  });
  langfuse.on("error", () => {
    console.warn("[argo] langfuse server unreachable — telemetry degraded");
  });

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
        const sessionData = session.data as ArgoSession;

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

            try {
              await createLangfuseSession(
                langfuse,
                sessionEntries,
                sessionID,
                textMode,
              );
            } catch {
              console.warn(
                "[argo] langfuse server unreachable — telemetry skipped",
              );
            }
          }
        }
      }
    },
    dispose: async () => {
      try {
        await langfuse.shutdownAsync();
      } catch {
        console.warn(
          "[argo] langfuse server unreachable during shutdown — ignored",
        );
      }
    },
  };

  return hooks;
};

export default ArgoPlugin;
