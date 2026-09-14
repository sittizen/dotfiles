import { describe, expect, test } from "bun:test";
import { FatalStatsError } from "./errors";
import {
  createLangfuseSource,
  createOpenCodeSource,
  installWebStorageShim,
  loadArgoLangfuseConfig,
  stableId,
  traceIdForSession,
} from "./sources";
import type { OpenCodeMessage, OpenCodeSessionData } from "./types";

// ---------------------------------------------------------------------------
// OpenCode source adapter
// ---------------------------------------------------------------------------

const fakeOpenCodeClient = (
  sessionsById: Record<string, OpenCodeSessionData>,
  childrenByParent: Record<string, string[]>,
  messagesBySession: Record<string, OpenCodeMessage[]>,
) => {
  const client = {
    session: {
      get: async (parameters: { sessionID: string }) => ({ data: sessionsById[parameters.sessionID] }),
      children: async (parameters: { sessionID: string }) => ({
        data: (childrenByParent[parameters.sessionID] ?? [])
          .sort((a, b) => a.localeCompare(b))
          .map((id) => sessionsById[id]),
      }),
      messages: async (parameters: { sessionID: string }) => ({ data: messagesBySession[parameters.sessionID] ?? [] }),
    },
    provider: {
      list: async () => ({
        data: {
          all: [
            {
              id: "p",
              models: { "m-a": { id: "m-a", limit: { context: 1000 } }, "m-b": { id: "m-b", limit: { context: 0 } } },
            },
          ],
        },
      }),
    },
  };
  return { client };
};

const sessionData = (id: string, parentID?: string, agent = "build"): OpenCodeSessionData => ({
  id,
  parentID,
  title: `title ${id}`,
  slug: `slug-${id}`,
  agent,
  projectID: "proj",
  time: { created: 1000, updated: 2000 },
});

describe("createOpenCodeSource", () => {
  test("walks the tree root-first, depth-first, children sorted by id", async () => {
    const { client } = fakeOpenCodeClient(
      {
        ses_root: sessionData("ses_root"),
        ses_b: sessionData("ses_b", "ses_root", "explore"),
        ses_a: sessionData("ses_a", "ses_root", "explore"),
        ses_a1: sessionData("ses_a1", "ses_a", "plan"),
      },
      { ses_root: ["ses_b", "ses_a"], ses_a: ["ses_a1"] },
      {},
    );
    const tree = await createOpenCodeSource(client).getTree("ses_root");
    expect(tree.sessions.map((s) => s.id)).toEqual(["ses_root", "ses_a", "ses_a1", "ses_b"]);
  });

  test("derives turn count, last activity, and crash-safe end time", async () => {
    const messages: OpenCodeMessage[] = [
      { info: { id: "m1", role: "user", time: { created: 1500 } }, parts: [] },
      { info: { id: "m2", role: "assistant", time: { created: 1600, completed: 5000 } }, parts: [] },
      { info: { id: "m3", role: "assistant", time: { created: 6000 } }, parts: [] },
    ];
    const { client } = fakeOpenCodeClient({ ses_root: sessionData("ses_root") }, {}, { ses_root: messages });
    const tree = await createOpenCodeSource(client).getTree("ses_root");
    const root = tree.sessions[0];
    expect(root.turnCount).toBe(2);
    expect(root.lastActivityAt).toBe(6000);
    expect(root.endAt).toBe(6000);
  });

  test("uses session updated time when no messages exist", async () => {
    const { client } = fakeOpenCodeClient({ ses_root: sessionData("ses_root") }, {}, { ses_root: [] });
    const tree = await createOpenCodeSource(client).getTree("ses_root");
    expect(tree.sessions[0].lastActivityAt).toBe(2000);
  });

  test("fails fatally when the session is missing", async () => {
    const { client } = fakeOpenCodeClient({}, {}, {});
    try {
      await createOpenCodeSource(client).getTree("ses_missing");
      throw new Error("expected FatalStatsError");
    } catch (error) {
      expect(error).toBeInstanceOf(FatalStatsError);
      expect((error as FatalStatsError).stage).toBe("opencode");
    }
  });

  test("model limits index by provider/model and drop non-positive limits", async () => {
    const { client } = fakeOpenCodeClient({}, {}, {});
    const limits = await createOpenCodeSource(client).getModelLimits();
    expect(limits).toEqual({ "p/m-a": 1000 });
  });

  test("model limits degrade to empty when provider list is unavailable", async () => {
    const { client } = fakeOpenCodeClient({}, {}, {}) as unknown as { client: Record<string, unknown> };
    delete client.provider;
    const limits = await createOpenCodeSource(client as never).getModelLimits();
    expect(limits).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Langfuse source adapter (hermetic: fake module injected through the loader)
// ---------------------------------------------------------------------------

const fakeLangfuseModule = (api: {
  traceList: (query: Record<string, unknown>) => Promise<{ data?: unknown; meta?: unknown }>;
  traceGet: (traceId: string) => Promise<{ observations?: unknown[] }>;
}) => ({
  default: class {
    api = api;
    shutdownAsync = async (): Promise<void> => undefined;
  },
});

const sourceWith = (api: Parameters<typeof fakeLangfuseModule>[0]) =>
  createLangfuseSource(
    { publicKey: "pk", secretKey: "sk", baseUrl: "http://lf", userId: "u" },
    { loadModule: async () => fakeLangfuseModule(api) },
  );

describe("createLangfuseSource", () => {
  test("paginates traces by session id and user", async () => {
    const requested: Array<Record<string, unknown>> = [];
    const source = sourceWith({
      traceList: async (query) => {
        requested.push(query);
        if ((query.page as number) === 1) {
          return {
            data: [{ id: "trc_1", sessionId: "ses_root", userId: "u" }, { junk: true }],
            meta: { page: 1, limit: 50, totalItems: 1, totalPages: 2 },
          };
        }
        return { data: [], meta: { page: 2, limit: 50, totalItems: 1, totalPages: 2 } };
      },
      traceGet: async () => ({ observations: [] }),
    });
    const traces = await source.getTraces("ses_root", "u");
    expect(traces).toEqual([{ id: "trc_1", sessionId: "ses_root", userId: "u", metadata: undefined }]);
    expect(requested[0]).toMatchObject({ sessionId: "ses_root", userId: "u", page: 1, limit: 50 });
    expect(requested).toHaveLength(2);
  });

  test("stops on a short page when pagination metadata is absent", async () => {
    const requested: Array<Record<string, unknown>> = [];
    const source = sourceWith({
      traceList: async (query) => {
        requested.push(query);
        return { data: [{ id: `trc_${query.page}`, sessionId: "ses_root", userId: "u" }] };
      },
      traceGet: async () => ({ observations: [] }),
    });
    const traces = await source.getTraces("ses_root", "u");
    expect(requested).toHaveLength(1);
    expect(traces).toEqual([{ id: "trc_1", sessionId: "ses_root", userId: "u", metadata: undefined }]);
  });

  test("reads observations for a trace", async () => {
    const source = sourceWith({
      traceList: async () => ({ data: [] }),
      traceGet: async (traceId) => ({
        observations: [{ id: `obs_${traceId}`, type: "GENERATION" }, { broken: true }],
      }),
    });
    const observations = await source.getObservations("trc_1");
    expect(observations).toEqual([{ id: "obs_trc_1", type: "GENERATION" }]);
  });

  test("trace query failures are fatal", async () => {
    const source = sourceWith({
      traceList: async () => {
        throw new Error("ECONNREFUSED");
      },
      traceGet: async () => ({ observations: [] }),
    });
    try {
      await source.getTraces("ses_root", "u");
      throw new Error("expected FatalStatsError");
    } catch (error) {
      expect(error).toBeInstanceOf(FatalStatsError);
      expect((error as FatalStatsError).stage).toBe("langfuse");
      expect((error as FatalStatsError).message).toContain("ECONNREFUSED");
    }
  });

  test("observation query failures are fatal", async () => {
    const source = sourceWith({
      traceList: async () => ({ data: [] }),
      traceGet: async () => {
        throw new Error("timeout");
      },
    });
    try {
      await source.getObservations("trc_1");
      throw new Error("expected FatalStatsError");
    } catch (error) {
      expect(error).toBeInstanceOf(FatalStatsError);
      expect((error as FatalStatsError).stage).toBe("langfuse");
    }
  });

  test("dispose is safe to call repeatedly", async () => {
    const source = sourceWith({
      traceList: async () => ({ data: [] }),
      traceGet: async () => ({ observations: [] }),
    });
    await source.dispose();
    await source.dispose();
  });
});

describe("stableId", () => {
  test("matches the Argo derivation", () => {
    expect(traceIdForSession("ses_1")).toBe(stableId("trace:ses_1"));
    expect(traceIdForSession("ses_1")).toHaveLength(36);
    expect(traceIdForSession("ses_1")).toBe(traceIdForSession("ses_1"));
    expect(traceIdForSession("ses_1")).not.toBe(traceIdForSession("ses_2"));
  });
});

describe("loadArgoLangfuseConfig", () => {
  test("fails fatally when nothing is configured", () => {
    const originals = {
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      ARGO_LANGFUSE_PUBLIC_KEY: process.env.ARGO_LANGFUSE_PUBLIC_KEY,
      ARGO_LANGFUSE_SECRET_KEY: process.env.ARGO_LANGFUSE_SECRET_KEY,
      ARGO_LANGFUSE_BASE_URL: process.env.ARGO_LANGFUSE_BASE_URL,
      ARGO_USER: process.env.ARGO_USER,
    };
    // Point the config lookup at a guaranteed-empty directory so the host's
    // real ~/.config/argo/config.json cannot leak in.
    process.env.XDG_CONFIG_HOME = "/tmp/pytc-session-stats-test-empty";
    delete process.env.ARGO_LANGFUSE_PUBLIC_KEY;
    delete process.env.ARGO_LANGFUSE_SECRET_KEY;
    delete process.env.ARGO_LANGFUSE_BASE_URL;
    delete process.env.ARGO_USER;
    try {
      loadArgoLangfuseConfig();
      throw new Error("expected FatalStatsError");
    } catch (error) {
      expect(error).toBeInstanceOf(FatalStatsError);
      expect((error as FatalStatsError).stage).toBe("langfuse");
    } finally {
      if (originals.XDG_CONFIG_HOME === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = originals.XDG_CONFIG_HOME;
      for (const [key, value] of Object.entries(originals)) {
        if (key === "XDG_CONFIG_HOME" || value === undefined) continue;
        process.env[key] = value;
      }
    }
  });
});

describe("installWebStorageShim", () => {
  test("installs a working in-memory localStorage when missing", () => {
    const globalScope = globalThis as { localStorage?: unknown };
    const original = globalScope.localStorage;
    delete globalScope.localStorage;
    try {
      expect(globalScope.localStorage).toBeUndefined();
      installWebStorageShim();
      const shim = globalScope.localStorage as Storage;
      expect(typeof shim?.setItem).toBe("function");
      shim.setItem("k", "v");
      expect(shim.getItem("k")).toBe("v");
      shim.removeItem("k");
      expect(shim.getItem("k")).toBeNull();
    } finally {
      if (original === undefined) delete globalScope.localStorage;
      else globalScope.localStorage = original;
    }
  });

  test("leaves an existing localStorage untouched", () => {
    const globalScope = globalThis as { localStorage?: unknown };
    installWebStorageShim();
    expect(globalScope.localStorage).toBeDefined();
  });
});
