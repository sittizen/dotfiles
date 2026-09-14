/**
 * Deterministic error-text normalization for grouping.
 *
 * Rules (docs/plans/pytc-session-stats.md):
 * - absolute and relative file paths -> `<PATH>`
 * - line/column locations -> `<LINE>`
 * - UUIDs, hex hashes, numeric IDs, long numeric sequences -> `<ID>`
 * - collapse whitespace, trim, cap at 512 characters
 *
 * Everything uses standard string/regex operations only.
 */

export const DIGEST_MAX_LENGTH = 512;
export const SAMPLE_MAX_LENGTH = 256;

// UUIDs: 8-4-4-4-12 hex.
const UUID_PATTERN = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
// Hex hashes: runs of at least 7 hex characters (covers sha fragments, git oids).
const HEX_HASH_PATTERN = /\b[0-9a-fA-F]{7,}\b/g;
// Line/column locations: `file.ts:12:34`, `line 12`, `column 34`, `#L12`, `row 3-4`.
const LINE_LOCATION_PATTERN = /\b(?:lines?|cols?|columns?|rows?)\s+\d+(?:\s*-\s*\d+)?/gi;
const POSITION_SUFFIX_PATTERN = /(?<=[\w."'`)\]])(?:[:#]L?\d+(?::\d+)*)/g;
// Long numeric sequences: timestamps, big ids, long numbers (>= 5 digits).
const LONG_NUMBER_PATTERN = /\b\d{5,}\b/g;
// Numeric ids attached to id-like words: `id=9`, `msg 404`, `ses_123`, `code: 12`.
const NUMERIC_ID_PATTERN = /\b((?:id|no|nr|code|status|err(?:or)?|msg|message|part|call|pid|exit)(?:[ _-]?\w{0,8})?[_#=:\s]+)(\d+)(?=\b)/gi;
// Absolute paths: /foo/bar, ~/foo, C:\foo\bar, \\server\share (not mid-word, so
// the slash inside `src/file.ts` is left to the relative-path rule).
const ABSOLUTE_PATH_PATTERN = /(?<![\w.\\-])(?:~\/|\/|(?:[A-Za-z]:\\|\\\\))\S*/g;
// Relative paths: ./x, ../y, src/foo.ts, a\b.txt (must contain a separator).
const RELATIVE_PATH_PATTERN = /(?<![\w@:.\\/-])(?:\.{1,2}[\/\\]|\w[\w.-]*[\/\\])\S*/g;
// Filename with line/column suffix: file.ts:9, app.py:12:34.
const FILE_LINE_PATTERN = /(?<![\w@:.\\/-])[\w.-]+\.[A-Za-z0-9]+(?::\d+){1,2}\b/g;

/**
 * Normalize a raw error text into a digest key.
 * Order matters: paths first (a path may embed line numbers), then UUIDs,
 * then line/column locations, then numeric ids.
 */
export const normalizeErrorText = (raw: string): string => {
  let text = String(raw ?? "");
  text = text.replace(ABSOLUTE_PATH_PATTERN, "<PATH>");
  text = text.replace(RELATIVE_PATH_PATTERN, "<PATH>");
  text = text.replace(FILE_LINE_PATTERN, "<PATH>");
  text = text.replace(UUID_PATTERN, "<ID>");
  text = text.replace(LINE_LOCATION_PATTERN, "<LINE>");
  text = text.replace(POSITION_SUFFIX_PATTERN, (match) => (match.startsWith(":") || match.startsWith("#") ? `<LINE>` : match));
  text = text.replace(NUMERIC_ID_PATTERN, (_match, prefix: string) => `${prefix}<ID>`);
  text = text.replace(LONG_NUMBER_PATTERN, "<ID>");
  text = text.replace(HEX_HASH_PATTERN, "<ID>");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > DIGEST_MAX_LENGTH) {
    text = `${text.slice(0, DIGEST_MAX_LENGTH - 1)}…`;
  }
  return text;
};

/** Source-text sample for a digest; never summarized, only truncated. */
export const sampleFromErrorText = (raw: string): string => {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (text.length > SAMPLE_MAX_LENGTH) {
    return `${text.slice(0, SAMPLE_MAX_LENGTH - 1)}…`;
  }
  return text;
};
