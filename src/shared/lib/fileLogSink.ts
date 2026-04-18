import { appendFrontendLogLines } from "@/shared/api/logging";
import type { LogSink, LogSinkLevel } from "@/shared/lib/devLog";

const MAX_BUFFER = 48;
const FLUSH_MS = 400;
const MAX_LINE_CHARS = 16_000;

let buffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushTail: Promise<void> = Promise.resolve();
let unloadInstalled = false;

function formatArg(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (typeof value === "symbol") {
    return value.description ?? String(value);
  }
  return String(value);
}

function formatLine(level: LogSinkLevel, namespace: string, args: readonly unknown[]): string {
  const ts = new Date().toISOString();
  const payload = args.map(formatArg).join(" ");
  let line = `${ts}\t${level}\t[${namespace}]\t${payload}`;
  if (line.length > MAX_LINE_CHARS) {
    line = `${line.slice(0, MAX_LINE_CHARS)}…`;
  }
  return line;
}

function runFlush(): Promise<void> {
  const batch = buffer.splice(0, buffer.length);
  if (batch.length === 0) return Promise.resolve();
  return appendFrontendLogLines(batch).catch(() => {
    /* File sink must not break the app */
  });
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushTail = flushTail.then(runFlush);
  }, FLUSH_MS);
}

/**
 * Buffers log lines and appends them via Tauri (`data_dir/logs/frontend.log`).
 * Use only in the desktop app ({@link initLogging}).
 */
export function createTauriFileLogSink(): LogSink {
  return (level, namespace, args) => {
    buffer.push(formatLine(level, namespace, args));
    if (buffer.length >= MAX_BUFFER) {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushTail = flushTail.then(runFlush);
    } else {
      scheduleFlush();
    }
  };
}

/** Best-effort flush before exit (still async; may not finish on hard kill). */
export function flushPendingFileLogSink(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushTail = flushTail.then(runFlush);
  return flushTail;
}

/** Register one `beforeunload` listener to drain the file log buffer. */
export function installFileLogSinkFlushOnUnload(): void {
  if (unloadInstalled || typeof window === "undefined") return;
  unloadInstalled = true;
  window.addEventListener("beforeunload", () => {
    void flushPendingFileLogSink();
  });
}
