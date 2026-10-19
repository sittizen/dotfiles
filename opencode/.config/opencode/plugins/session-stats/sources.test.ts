import { describe, expect, test } from "bun:test";
import type { GetObservationsV2Request, ObservationsV2Response } from "@langfuse/core";
import { FatalStatsError } from "./errors";
import {
  createLangfuseSource,
  createOpenCodeSource,
  loadPytcLangfuseConfig,
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

type FakeGetMany = (query?: GetObservationsV2Request) => Promise<ObservationsV2Response>;

const fakeLangfuseModule = (getMany: FakeGetMany) => ({
  LangfuseClient: class {
    api = { observations: { getMany } };
    shutdown = async (): Promise<void> => undefined;
  },
});

const sourceWith = (getMany: FakeGetMany) =>
  createLangfuseSource(
    { publicKey: "pk", secretKey: "sk", baseUrl: "http://lf", userId: "u" },
    { loadModule: async () => fakeLangfuseModule(getMany) },
  );

const response = (data: unknown[], meta: Record<string, unknown> = {}): ObservationsV2Response =>
  ({ data, meta }) as unknown as ObservationsV2Response;

describe("createLangfuseSource", () => {
  test("paginates observations by session id and user, deriving traces", async () => {
    const requested: Array<GetObservationsV2Request | undefined> = [];
    const source = sourceWith(async (query) => {
      requested.push(query);
      if (!query?.cursor) {
        return response(
          [
            { id: "obs_1", traceId: "trc_1", sessionId: "ses_root", userId: "u" },
            { id: "obs_2", traceId: "trc_1", sessionId: "ses_root", userId: "u" },
            { id: "obs_3", traceId: "trc_2", sessionId: "ses_root", userId: "u" },
            { junk: true },
          ],
          { cursor: "next" },
        );
      }
      return response([]);
    });
    const traces = await source.getTraces("ses_root", "u");
    expect(traces).toEqual([
      { id: "trc_1", sessionId: "ses_root", userId: "u", metadata: undefined },
      { id: "trc_2", sessionId: "ses_root", userId: "u", metadata: undefined },
    ]);
    expect(requested[0]).toMatchObject({ sessionId: "ses_root", userId: "u", limit: 1000 });
    expect(requested[1]).toMatchObject({ cursor: "next" });
    expect(requested).toHaveLength(2);
  });

  test("stops when the response carries no cursor", async () => {
    const requested: Array<GetObservationsV2Request | undefined> = [];
    const source = sourceWith(async (query) => {
      requested.push(query);
      return response([{ id: "obs_1", traceId: "trc_1", sessionId: "ses_root", userId: "u" }]);
    });
    const traces = await source.getTraces("ses_root", "u");
    expect(requested).toHaveLength(1);
    expect(traces).toEqual([{ id: "trc_1", sessionId: "ses_root", userId: "u", metadata: undefined }]);
  });

  test("reads observations for a trace and drops records without an id", async () => {
    const source = sourceWith(async () =>
      response([
        {
          id: "obs_trc_1",
          type: "GENERATION",
          metadata: { attributes: { "opencode.session.id": "ses_root" } },
        },
        { broken: true },
      ]),
    );
    const observations = await source.getObservations("trc_1");
    expect(observations).toEqual([
      {
        id: "obs_trc_1",
        type: "GENERATION",
        name: null,
        startTime: null,
        endTime: null,
        model: null,
        modelParameters: null,
        usageDetails: null,
        costDetails: null,
        metadata: { attributes: { "opencode.session.id": "ses_root" } },
        level: null,
        statusMessage: null,
      },
    ]);
  });

  test("trace query failures are fatal", async () => {
    const source = sourceWith(async () => {
      throw new Error("ECONNREFUSED");
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
    const source = sourceWith(async () => {
      throw new Error("timeout");
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
    const source = sourceWith(async () => response([]));
    await source.dispose();
    await source.dispose();
  });
});

describe("stableId", () => {
  test("matches the PyTC derivation", () => {
    expect(traceIdForSession("ses_1")).toBe(stableId("trace:ses_1"));
    expect(traceIdForSession("ses_1")).toHaveLength(32);
    expect(traceIdForSession("ses_1")).toBe(traceIdForSession("ses_1"));
    expect(traceIdForSession("ses_1")).not.toBe(traceIdForSession("ses_2"));
  });
});

describe("loadPytcLangfuseConfig", () => {
  test("fails fatally when nothing is configured", () => {
    const originals = {
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      PYTC_LANGFUSE_PUBLIC_KEY: process.env.PYTC_LANGFUSE_PUBLIC_KEY,
      PYTC_LANGFUSE_SECRET_KEY: process.env.PYTC_LANGFUSE_SECRET_KEY,
      PYTC_LANGFUSE_BASE_URL: process.env.PYTC_LANGFUSE_BASE_URL,
      PYTC_USER: process.env.PYTC_USER,
    };
    // Point the config lookup at a guaranteed-empty directory so the host's
    // real ~/.config/pytc/config.json cannot leak in.
    process.env.XDG_CONFIG_HOME = "/tmp/pytc-session-stats-test-empty";
    delete process.env.PYTC_LANGFUSE_PUBLIC_KEY;
    delete process.env.PYTC_LANGFUSE_SECRET_KEY;
    delete process.env.PYTC_LANGFUSE_BASE_URL;
    delete process.env.PYTC_USER;
    try {
      loadPytcLangfuseConfig();
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
