/** Fatal failures for the report pipeline. Fatal means: no partial report. */

export class FatalStatsError extends Error {
  readonly stage: "langfuse" | "opencode" | "output";

  constructor(stage: FatalStatsError["stage"], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FatalStatsError";
    this.stage = stage;
  }
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export const describeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};
