import { invoke as tauriInvoke, type InvokeArgs } from "@tauri-apps/api/core";
import { devDebug } from "@/shared/lib/devLog";

/** Dev-only IPC invoke counts (per command). */
const ipcInvokeCounts = new Map<string, number>();
let ipcInvokeTotal = 0;

function recordIpcInvoke(cmd: string): void {
  ipcInvokeCounts.set(cmd, (ipcInvokeCounts.get(cmd) ?? 0) + 1);
  ipcInvokeTotal += 1;
}

/** Snapshot for dev HUD / Performance tooling. */
export function getIpcInvokeSnapshot(): { total: number; byCommand: Record<string, number> } {
  return { total: ipcInvokeTotal, byCommand: Object.fromEntries(ipcInvokeCounts) };
}

export function resetIpcInvokeStats(): void {
  ipcInvokeCounts.clear();
  ipcInvokeTotal = 0;
}

/** Dev-only: log IPC calls slower than this (ms) to spot hot-path stalls without per-invoke spam. */
const IPC_SLOW_MS = 300;

export async function invoke<T>(cmd: string, args: InvokeArgs = {}): Promise<T> {
  if (import.meta.env.DEV) {
    recordIpcInvoke(cmd);
    const t0 = performance.now();
    try {
      return await tauriInvoke<T>(cmd, args);
    } finally {
      const dt = performance.now() - t0;
      if (dt > IPC_SLOW_MS) {
        devDebug("IPC", cmd, `${dt.toFixed(0)}ms`);
      }
    }
  }
  return tauriInvoke<T>(cmd, args);
}

export interface CommandError {
  code: string;
  message: string;
}

export function isCommandError(err: unknown): err is CommandError {
  if (typeof err !== "object" || err === null) return false;
  const o = err as Record<string, unknown>;
  return typeof o.code === "string" && typeof o.message === "string";
}

export function getErrorMessage(err: unknown): string {
  if (isCommandError(err)) return err.message;
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function getErrorCode(err: unknown): string {
  if (isCommandError(err)) return err.code;
  return "UNKNOWN";
}

const IPC_TIMEOUT = 15000;
const IPC_RETRY_COUNT = 2;

function invokeWithTimeout<T>(cmd: string, args: InvokeArgs, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const invokePromise = invoke<T>(cmd, args);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("IPC timeout")), ms);
  });
  return Promise.race([invokePromise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

export async function invokeWithRetry<T>(
  cmd: string,
  args: InvokeArgs = {},
  retries = IPC_RETRY_COUNT,
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await invokeWithTimeout<T>(cmd, args, IPC_TIMEOUT);
    } catch (e: unknown) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 100 * (i + 1)));
    }
  }
  throw new Error("IPC failed after retries");
}
