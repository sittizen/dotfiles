import { UsageError } from "./errors";

export const SESSION_STATS_COMMAND = "/pytc-session-stats";
export const SESSION_STATS_USAGE = "usage: /pytc-session-stats";

const COMMAND_PATTERN = /^\/pytc-session-stats(?:$|\s)/;

/**
 * Match the raw prompt text against the command.
 * Returns false when the text is not this command (fall through to normal submit).
 */
export const matchesCommand = (text: string): boolean => {
  const firstLine = text.split("\n")[0] ?? "";
  return COMMAND_PATTERN.test(firstLine);
};

/**
 * Parse and validate arguments. The command takes no arguments; any argument
 * (unknown or extra) is rejected with a usage error.
 */
export const parseArguments = (text: string): void => {
  const stripped = text.slice(SESSION_STATS_COMMAND.length);
  const argument = stripped.replace(/\s+/g, " ").trim();
  if (argument === "") return;
  throw new UsageError(`unknown argument${argument.includes(" ") ? "s" : ""} \`${escapeBackticks(argument)}\`. ${SESSION_STATS_USAGE}`);
};

const escapeBackticks = (value: string): string => value.replace(/`/g, "'").slice(0, 60);
