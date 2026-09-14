/**
 * PyTC session-stats TUI plugin (zero-LM).
 *
 * Exposes exactly one command, `/pytc-session-stats`, reporting
 * deterministic Markdown statistics for the current OpenCode session and its
 * subsessions. Langfuse is authoritative for tokens, cost, and models;
 * OpenCode supplies tool final states and the session tree. No model/provider
 * request is ever made: Enter is intercepted before the prompt editor submits
 * (see session-stats/types.ts for the verified runtime contract), and report
 * output is posted with `session.promptAsync` + `noReply`, which persists a
 * chat message without running the session loop.
 */
import { matchesCommand, parseArguments, SESSION_STATS_COMMAND } from "./session-stats/command";
import { buildReport, collectLangfuse } from "./session-stats/aggregate";
import { FatalStatsError, UsageError, describeError } from "./session-stats/errors";
import { renderFatalError, renderReport, renderUsageError } from "./session-stats/render";
import { createLangfuseSource, createOpenCodeSource, loadArgoLangfuseConfig } from "./session-stats/sources";
import type {
  LangfuseSource,
  OpenCodeSource,
  TuiApi,
  TuiPluginModule,
  TuiPromptEditor,
} from "./session-stats/types";

const PART_METADATA = { source: "pytc-session-stats" } as const;

const asPromptEditor = (value: unknown): TuiPromptEditor | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<TuiPromptEditor>;
  if (typeof candidate.plainText !== "string") return undefined;
  if (typeof candidate.submit !== "function") return undefined;
  if (typeof candidate.clear !== "function") return undefined;
  return candidate as TuiPromptEditor;
};

const currentSessionId = (api: TuiApi): string | undefined => {
  const route = api.route?.current;
  if (!route || route.name !== "session") return undefined;
  const sessionID = (route.params as { sessionID?: unknown } | undefined)?.sessionID;
  return typeof sessionID === "string" && sessionID.startsWith("ses") ? sessionID : undefined;
};

export type SessionStatsDeps = {
  /** Injectable for tests; defaults to the Langfuse public-API adapter. */
  createLangfuse?: typeof createLangfuseSource;
  /** Injectable for tests; defaults to the OpenCode SDK adapter. */
  createOpenCode?: typeof createOpenCodeSource;
};

export const createTuiPlugin = (deps: SessionStatsDeps = {}): TuiPluginModule => ({
  id: "pytc.session-stats",
  tui: async (api) => {
    const createLangfuse = deps.createLangfuse ?? createLangfuseSource;
    const createOpenCode = deps.createOpenCode ?? createOpenCodeSource;

    let langfuseSource: (LangfuseSource & { dispose: () => Promise<void> }) | undefined;
    let langfuseConfig: ReturnType<typeof loadArgoLangfuseConfig> | undefined;
    let inFlight: Promise<void> = Promise.resolve();

    const getLangfuse = () => {
      langfuseConfig ??= loadArgoLangfuseConfig();
      langfuseSource ??= createLangfuse(langfuseConfig);
      return { source: langfuseSource, userId: langfuseConfig.userId };
    };

    const disposeLangfuse = () => {
      const source = langfuseSource;
      langfuseSource = undefined;
      return source?.dispose();
    };
    api.lifecycle.onDispose(() => void disposeLangfuse());

    const postMessage = async (markdown: string): Promise<boolean> => {
      const sessionID = currentSessionId(api);
      if (!sessionID) {
        api.ui.toast({
          variant: "error",
          message: "pytc-session-stats: no current session (open a session first)",
          duration: 5000,
        });
        return false;
      }
      try {
        const result = await api.client.session.promptAsync({
          sessionID,
          noReply: true,
          parts: [{ type: "text", text: markdown, metadata: { ...PART_METADATA } }],
        });
        if (result?.error) {
          api.ui.toast({
            variant: "error",
            message: `pytc-session-stats: posting report failed (${describeError(result.error)})`,
            duration: 5000,
          });
          return false;
        }
        return true;
      } catch (error) {
        api.ui.toast({
          variant: "error",
          message: `pytc-session-stats: posting report failed (${describeError(error)})`,
          duration: 5000,
        });
        return false;
      }
    };

    const runStatsCommand = async (): Promise<void> => {
      const sessionID = currentSessionId(api);
      if (!sessionID) {
        api.ui.toast({
          variant: "error",
          message: "pytc-session-stats: no current session (open a session first)",
          duration: 5000,
        });
        return;
      }
      try {
        const { source, userId } = getLangfuse();
        const openCodeSource: OpenCodeSource = createOpenCode(api.client);
        const [tree, modelLimits, langfuse] = await Promise.all([
          openCodeSource.getTree(sessionID),
          openCodeSource.getModelLimits(),
          collectLangfuse(source, sessionID, userId),
        ]);
        const report = buildReport({
          tree,
          modelLimits,
          traces: langfuse.traces,
          observationsByTraceId: langfuse.observationsByTraceId,
        });
        await postMessage(renderReport(report));
      } catch (error) {
        const message =
          error instanceof FatalStatsError || error instanceof UsageError
            ? error.message
            : describeError(error);
        await postMessage(renderFatalError(message));
      }
    };

    const handleInvocation = (rawText: string): void => {
      try {
        parseArguments(rawText);
      } catch (error) {
        if (error instanceof UsageError) {
          void postMessage(renderUsageError(error.message));
          return;
        }
        throw error;
      }
      // Serialize invocations so reports cannot interleave.
      inFlight = inFlight.then(() => runStatsCommand()).catch(() => undefined);
    };

    // Intercept Enter before the prompt editor submits. The editor handles
    // `input.submit` internally, so keymap command overrides never run for
    // typed text; only the raw key intercept is a zero-LM interception point.
    const disposeIntercept = api.keymap.intercept(
      "key",
      (info) => {
        const name = info?.event?.name ?? info?.event?.key;
        if (name !== "return" && name !== "enter") return;
        const editor = asPromptEditor(api.renderer?.currentFocusedEditor);
        if (!editor || editor.isDestroyed) return;
        const text = editor.plainText;
        if (!matchesCommand(text)) return;
        info.consume();
        editor.clear();
        handleInvocation(text);
      },
      { priority: 10000 },
    );

    // Discoverability: palette + slash popover entry.
    const disposePalette = api.keymap.registerLayer({
      commands: [
        {
          namespace: "palette",
          name: "pytc-session-stats",
          title: "PyTC session stats",
          desc: "report session statistics",
          category: "Session",
          slashName: "pytc-session-stats",
          slashAliases: [],
          run: () => {
            handleInvocation(SESSION_STATS_COMMAND);
            return true;
          },
        },
      ],
    });

    api.lifecycle.onDispose(() => {
      disposeIntercept();
      disposePalette();
    });
  },
});

export default createTuiPlugin();
