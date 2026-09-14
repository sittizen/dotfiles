import { describe, expect, test } from "bun:test";
import { matchesCommand, parseArguments, SESSION_STATS_COMMAND, SESSION_STATS_USAGE } from "./command";
import { UsageError } from "./errors";

describe("matchesCommand", () => {
  test("accepts exact command with argument", () => {
    expect(matchesCommand("/pytc-session-stats info")).toBe(true);
  });

  test("accepts bare command", () => {
    expect(matchesCommand("/pytc-session-stats")).toBe(true);
  });

  test("accepts command with trailing newline argument", () => {
    expect(matchesCommand("/pytc-session-stats\ninfo")).toBe(true);
  });

  test("rejects longer command names", () => {
    expect(matchesCommand("/pytc-session-statsx info")).toBe(false);
  });

  test("rejects unrelated text", () => {
    expect(matchesCommand("hello world")).toBe(false);
    expect(matchesCommand("/other info")).toBe(false);
    expect(matchesCommand("use /pytc-session-stats later")).toBe(false);
  });

  test("rejects empty and shell mode", () => {
    expect(matchesCommand("")).toBe(false);
    expect(matchesCommand("!/pytc-session-stats info")).toBe(false);
  });
});

describe("parseArguments", () => {
  test("accepts bare command", () => {
    expect(() => parseArguments("/pytc-session-stats")).not.toThrow();
  });

  test("normalizes whitespace and trailing newline", () => {
    expect(() => parseArguments("/pytc-session-stats   ")).not.toThrow();
    expect(() => parseArguments("/pytc-session-stats\n")).not.toThrow();
  });

  test("rejects the former info argument", () => {
    expect(() => parseArguments("/pytc-session-stats info")).toThrow(UsageError);
    expect(() => parseArguments("/pytc-session-stats   info  ")).toThrow(UsageError);
    expect(() => parseArguments("/pytc-session-stats\ninfo\n")).toThrow(UsageError);
  });

  test("rejects unknown argument", () => {
    expect(() => parseArguments("/pytc-session-stats list")).toThrow(UsageError);
    expect(() => parseArguments("/pytc-session-stats json")).toThrow(UsageError);
  });

  test("rejects extra arguments", () => {
    expect(() => parseArguments("/pytc-session-stats info --json")).toThrow(UsageError);
  });

  test("unknown argument message carries the usage text", () => {
    try {
      parseArguments("/pytc-session-stats list");
      throw new Error("expected UsageError");
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).message).toBe(`unknown argument \`list\`. ${SESSION_STATS_USAGE}`);
    }
  });

  test("escaped backticks in unknown arguments cannot break the message", () => {
    try {
      parseArguments("/pytc-session-stats `code`");
      throw new Error("expected UsageError");
    } catch (error) {
      expect((error as UsageError).message).not.toContain("`code`");
    }
  });
});

describe("SESSION_STATS_COMMAND", () => {
  test("is the documented command", () => {
    expect(SESSION_STATS_COMMAND).toBe("/pytc-session-stats");
  });
});
