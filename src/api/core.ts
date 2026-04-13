import { invoke, type InvokeArgs } from "@tauri-apps/api/core";

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

export { invoke };
