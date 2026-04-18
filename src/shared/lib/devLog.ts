/**
 * Frontend logging — **levels only** (no separate dev/release APIs).
 *
 * - **logDebug** — development builds (`import.meta.env.DEV`) only. Diagnostics, ignored `.catch`, etc.
 *   Use namespace `"Optional"` plus a dot-separated scope as the first message arg when logging fire-and-forget failures
 *   (e.g. `logDebug("Optional", "editor.togglePlayback.pause", err)`).
 * - **logInfo** / **logWarn** / **logError** — all environments (production included).
 *
 * **Namespace** (first argument): PascalCase, e.g. `Gameplay`, `GameEngine`, `Router`.
 * Console prefix: `[Namespace]`.
 *
 * **Sinks** — Call {@link initLogSinks} once at app bootstrap (e.g. from `initLogging.ts`) with your chain,
 * typically `[{@link consoleLogSink}]`. Use {@link registerLogSink} to append. {@link setLogSinks} replaces the whole chain (e.g. tests).
 */

/** True when `logDebug` emits output. Exposed for hot-path guards (e.g. skip debug-only work). */
export const isDebugLogLevelEnabled = import.meta.env.DEV;

export type LogSinkLevel = "debug" | "info" | "warn" | "error";

/**
 * Receives each log event after `logDebug` / `logInfo` / `logWarn` / `logError` is called.
 * Implementations must not throw (callers wrap in try/catch). A browser default is {@link consoleLogSink}.
 */
export type LogSink = (level: LogSinkLevel, namespace: string, args: readonly unknown[]) => void;

/** Writes to `console` using the level-appropriate method and `[namespace]` prefix. */
export function consoleLogSink(level: LogSinkLevel, namespace: string, args: readonly unknown[]): void {
  const tag = `[${namespace}]`;
  switch (level) {
    case "debug":
      console.debug(tag, ...args);
      break;
    case "info":
      console.info(tag, ...args);
      break;
    case "warn":
      console.warn(tag, ...args);
      break;
    case "error":
      console.error(tag, ...args);
      break;
  }
}

let logSinks: LogSink[] = [];

/**
 * Install the sink chain — call **once** from app entry (`initLogging.ts`) before other application code logs.
 */
export function initLogSinks(sinks: ReadonlyArray<LogSink>): void {
  logSinks = [...sinks];
}

/**
 * Replace the entire sink chain (e.g. tests). Use `[{@link consoleLogSink}]` to restore console-only output.
 */
export function setLogSinks(sinks: LogSink[]): void {
  logSinks = [...sinks];
}

/**
 * Append a sink **after** existing ones. Returns an unregister function.
 */
export function registerLogSink(sink: LogSink): () => void {
  logSinks.push(sink);
  return () => {
    const i = logSinks.indexOf(sink);
    if (i >= 0) logSinks.splice(i, 1);
  };
}

function emitToSinks(level: LogSinkLevel, namespace: string, args: unknown[]): void {
  if (logSinks.length === 0) return;
  const frozen = args as readonly unknown[];
  for (const sink of logSinks) {
    try {
      sink(level, namespace, frozen);
    } catch {
      // Sinks must not break application logging.
    }
  }
}

/** Development only — verbose diagnostics (`console.debug` via sink chain). */
export function logDebug(namespace: string, ...args: unknown[]): void {
  if (!isDebugLogLevelEnabled) return;
  emitToSinks("debug", namespace, args);
}

/** Lifecycle and milestones (`console.info` via sink chain). */
export function logInfo(namespace: string, ...args: unknown[]): void {
  emitToSinks("info", namespace, args);
}

/** Recoverable issues (`console.warn` via sink chain). */
export function logWarn(namespace: string, ...args: unknown[]): void {
  emitToSinks("warn", namespace, args);
}

/** Failures that matter in production (`console.error` via sink chain). */
export function logError(namespace: string, ...args: unknown[]): void {
  emitToSinks("error", namespace, args);
}
