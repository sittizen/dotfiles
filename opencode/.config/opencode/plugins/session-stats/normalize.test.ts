import { describe, expect, test } from "bun:test";
import { DIGEST_MAX_LENGTH, normalizeErrorText, SAMPLE_MAX_LENGTH, sampleFromErrorText } from "./normalize";

describe("normalizeErrorText", () => {
  test("collapses absolute paths", () => {
    expect(normalizeErrorText("failed to read /home/user/project/src/main.py")).toBe(
      "failed to read <PATH>",
    );
    expect(normalizeErrorText("cannot open ~/notes/todo.txt")).toBe("cannot open <PATH>");
    expect(normalizeErrorText("missing C:\\Users\\me\\file.ts")).not.toContain("C:");
  });

  test("collapses relative paths", () => {
    expect(normalizeErrorText("no such file src/lib/util.ts")).toBe("no such file <PATH>");
    expect(normalizeErrorText("cannot load ./config.json")).toBe("cannot load <PATH>");
    expect(normalizeErrorText("missing ../parent/dir/file.py")).toBe("missing <PATH>");
  });

  test("collapses line and column locations", () => {
    expect(normalizeErrorText("parse error at src/file.py:12:34")).toBe("parse error at <PATH>");
    expect(normalizeErrorText("syntax error on line 42")).toBe("syntax error on <LINE>");
    expect(normalizeErrorText("bad indent in column 7")).toBe("bad indent in <LINE>");
    expect(normalizeErrorText("problem in file.ts:9")).toBe("problem in <PATH>");
  });

  test("collapses uuids", () => {
    const digest = normalizeErrorText("request 6f9619ff-8b86-d011-b42d-00c04fc964ff failed");
    expect(digest).toBe("request <ID> failed");
  });

  test("collapses hex hashes", () => {
    expect(normalizeErrorText("commit 0db7df2f95a0b0c2aa9e53a26fc00c6a failed")).toBe("commit <ID> failed");
  });

  test("collapses long numeric sequences and numeric ids", () => {
    expect(normalizeErrorText("timeout after 1725907200000 ms")).toBe("timeout after <ID> ms");
    expect(normalizeErrorText("error code: 404 not found")).toBe("error code: <ID> not found");
  });

  test("changing ids only keeps digests equal", () => {
    const first = normalizeErrorText("upload of /tmp/a/b.png with id 9931 failed");
    const second = normalizeErrorText("upload of /tmp/x/y.png with id 1042 failed");
    expect(first).toBe(second);
  });

  test("distinct messages stay distinct", () => {
    const first = normalizeErrorText("connection refused by host");
    const second = normalizeErrorText("connection reset by peer");
    expect(first).not.toBe(second);
  });

  test("distinct line numbers group together, distinct reasons do not", () => {
    const l10 = normalizeErrorText("assertion failed at line 10");
    const l20 = normalizeErrorText("assertion failed at line 20");
    expect(l10).toBe(l20);

    const other = normalizeErrorText("assertion missing at line 10");
    expect(other).not.toBe(l10);
  });

  test("collapses whitespace and trims", () => {
    expect(normalizeErrorText("  lots   of\n\nwhitespace\t here  ")).toBe("lots of whitespace here");
  });

  test("caps digest length", () => {
    const digest = normalizeErrorText("x".repeat(DIGEST_MAX_LENGTH + 100));
    expect(digest.length).toBe(DIGEST_MAX_LENGTH);
    expect(digest.endsWith("…")).toBe(true);
  });

  test("never returns non-string input crashes", () => {
    expect(() => normalizeErrorText(undefined as unknown as string)).not.toThrow();
    expect(normalizeErrorText(undefined as unknown as string)).toBe("");
  });
});

describe("sampleFromErrorText", () => {
  test("keeps source text untouched when short", () => {
    expect(sampleFromErrorText("raw failure text")).toBe("raw failure text");
  });

  test("truncates to the cap without summarizing", () => {
    const sample = sampleFromErrorText("y".repeat(SAMPLE_MAX_LENGTH + 40));
    expect(sample.length).toBe(SAMPLE_MAX_LENGTH);
    expect(sample.endsWith("…")).toBe(true);
    expect(sample.startsWith("y")).toBe(true);
  });
});
