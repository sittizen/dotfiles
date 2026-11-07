/**
 * PyTC retro-stats server hook implementation.
 *
 * Hooks `command.execute.before` so the `retro` command prompt starts with the
 * deterministic `/pytc-session-stats` report. Reuses the same aggregation,
 * rendering, and sources as the TUI plugin; makes no model request of its own.
 */
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";
import { collectReport } from "./aggregate";
import { describeError } from "./errors";
import { renderFatalError, renderReport } from "./render";
import {
  createLangfuseSource,
  createServerOpenCodeSource,
  loadPytcLangfuseConfig,
} from "./sources";
import type { LangfuseSource } from "./types";

export const RETRO_COMMAND = "retro";

const STATS_SEPARATOR = "\n\n---\n\n";

type LangfuseSourceWithDispose = LangfuseSource & { dispose: () => Promise<void> };

export type RetroStatsDeps = {
  client: PluginInput["client"];
  /** Injectable for tests; defaults to the Langfuse public-API adapter. */
  createLangfuse?: typeof createLangfuseSource;
  /** Injectable for tests; defaults to the PyTC config loader. */
  loadConfig?: typeof loadPytcLangfuseConfig;
};

const normalizeCommand = (command: string): string => command.trim().replace(/^\//, "");

/** Prepend the rendered report to the command prompt without needing part ids. */
export const prependStatsPart = (parts: Part[], stats: string): void => {
  const firstText = parts.find((part) => part.type === "text");
  if (firstText && firstText.type === "text") {
    firstText.text = `${stats}${STATS_SEPARATOR}${firstText.text}`;
    return;
  }
  parts.unshift({ type: "text", text: `${stats}${STATS_SEPARATOR}` } as Part);
};

export const createRetroStatsHooks = (deps: RetroStatsDeps): Hooks => {
  const createLangfuse = deps.createLangfuse ?? createLangfuseSource;
  const loadConfig = deps.loadConfig ?? loadPytcLangfuseConfig;

  let langfuseSource: LangfuseSourceWithDispose | undefined;
  let langfuseConfig: ReturnType<typeof loadPytcLangfuseConfig> | undefined;

  const getLangfuse = () => {
    langfuseConfig ??= loadConfig();
    langfuseSource ??= createLangfuse(langfuseConfig);
    return { source: langfuseSource, userId: langfuseConfig.userId };
  };

  const buildStats = async (sessionID: string): Promise<string> => {
    try {
      const { source, userId } = getLangfuse();
      const report = await collectReport({
        openCodeSource: createServerOpenCodeSource(deps.client),
        langfuseSource: source,
        userId,
        sessionId: sessionID,
      });
      return renderReport(report);
    } catch (error) {
      // Never block the retro: surface the failure in the header instead.
      return renderFatalError(describeError(error));
    }
  };

  return {
    "command.execute.before": async (input, output) => {
      if (normalizeCommand(input.command) !== RETRO_COMMAND) return;
      const stats = await buildStats(input.sessionID);
      prependStatsPart(output.parts, stats);
    },
    dispose: async () => {
      const source = langfuseSource;
      langfuseSource = undefined;
      await source?.dispose();
    },
  };
};
