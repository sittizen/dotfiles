/**
 * PyTC retro-stats server plugin entrypoint.
 *
 * Only the default export is exported: the pinned OpenCode runtime falls back
 * to iterating every module export as a legacy plugin when `default` is not a
 * plugin object, so implementation symbols must live in `session-stats/retro`.
 */
import type { Plugin, PluginModule } from "@opencode-ai/plugin";
import { createRetroStatsHooks } from "./session-stats/retro";

const plugin: Plugin = async (input) => createRetroStatsHooks({ client: input.client });

const pluginModule: PluginModule = {
  id: "pytc.retro-stats",
  server: plugin,
};

export default pluginModule;
