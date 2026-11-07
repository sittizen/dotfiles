import { describe, expect, test } from "bun:test";
import type { Part } from "@opencode-ai/sdk";
import type { PluginInput } from "@opencode-ai/plugin";
import { createRetroStatsHooks, prependStatsPart, RETRO_COMMAND } from "./retro";
import type { LangfuseConfig, LangfuseSource } from "./types";

const sessionID = "ses_root";

const fakeClient = () =>
  ({
    session: {
      get: async ({ path }: { path: { id: string } }) => ({
        data: {
          id: path.id,
          title: "root session",
          agent: "build",
          projectID: "proj",
          time: { created: 1000, updated: 2000 },
        },
      }),
      children: async () => ({ data: [] }),
      messages: async () => ({ data: [] }),
    },
    provider: {
      list: async () => ({ data: { all: [] } }),
    },
  }) as unknown as PluginInput["client"];

const fakeLangfuse = (options: { fail?: boolean } = {}) => {
  let disposed = 0;
  const source: LangfuseSource & { dispose: () => Promise<void> } = {
    getTraces: async () => {
      if (options.fail) throw new Error("langfuse unavailable");
      return [];
    },
    getObservations: async () => [],
    dispose: async () => {
      disposed += 1;
    },
  };
  return {
    create: () => source,
    disposed: () => disposed,
  };
};

const config = (): LangfuseConfig => ({
  publicKey: "pk",
  secretKey: "sk",
  baseUrl: "http://langfuse",
  userId: "user",
});

const textPart = (text: string): Part => ({ type: "text", text }) as Part;

describe("prependStatsPart", () => {
  test("prepends before the first text part", () => {
    const parts = [textPart("retro body")];
    prependStatsPart(parts, "# Session Stats\n\nreport");
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      type: "text",
      text: "# Session Stats\n\nreport\n\n---\n\nretro body",
    });
  });

  test("adds a text part when the prompt has none", () => {
    const parts: Part[] = [];
    prependStatsPart(parts, "# Session Stats\n\nreport");
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: "text", text: "# Session Stats\n\nreport\n\n---\n\n" });
  });
});

describe("command.execute.before", () => {
  test("only handles retro", async () => {
    const langfuse = fakeLangfuse();
    const hooks = createRetroStatsHooks({
      client: fakeClient(),
      createLangfuse: langfuse.create,
      loadConfig: config,
    });
    const parts = [textPart("original")];
    await hooks["command.execute.before"]!(
      { command: "other", sessionID, arguments: "" },
      { parts },
    );
    expect((parts[0] as { text: string }).text).toBe("original");
  });

  test("prepends the stats report to retro", async () => {
    const langfuse = fakeLangfuse();
    const hooks = createRetroStatsHooks({
      client: fakeClient(),
      createLangfuse: langfuse.create,
      loadConfig: config,
    });
    const parts = [textPart("retro body")];
    await hooks["command.execute.before"]!(
      { command: `/${RETRO_COMMAND}`, sessionID, arguments: "" },
      { parts },
    );
    const text = (parts[0] as { text: string }).text;
    expect(text.startsWith("# Session Stats\n")).toBe(true);
    expect(text).toContain("## Session tree");
    expect(text.endsWith("---\n\nretro body")).toBe(true);
  });

  test("keeps retro running when stats fail", async () => {
    const langfuse = fakeLangfuse({ fail: true });
    const hooks = createRetroStatsHooks({
      client: fakeClient(),
      createLangfuse: langfuse.create,
      loadConfig: config,
    });
    const parts = [textPart("retro body")];
    await hooks["command.execute.before"]!(
      { command: RETRO_COMMAND, sessionID, arguments: "" },
      { parts },
    );
    const text = (parts[0] as { text: string }).text;
    expect(text).toContain("# Session Stats");
    expect(text).toContain("Report failed: langfuse unavailable");
    expect(text.endsWith("---\n\nretro body")).toBe(true);
  });

  test("disposes the cached langfuse source", async () => {
    const langfuse = fakeLangfuse();
    const hooks = createRetroStatsHooks({
      client: fakeClient(),
      createLangfuse: langfuse.create,
      loadConfig: config,
    });
    await hooks["command.execute.before"]!(
      { command: RETRO_COMMAND, sessionID, arguments: "" },
      { parts: [textPart("retro body")] },
    );
    await hooks.dispose?.();
    expect(langfuse.disposed()).toBe(1);
  });
});
