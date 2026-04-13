/** Logs in development only; uses `console.warn` to avoid noisy `log` in production tooling. */
export function devWarn(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
}

/**
 * Best-effort / fire-and-forget async: no user-facing error, but visible in dev for debugging.
 */
export function logOptionalRejection(context: string, err: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[optional:${context}]`, err);
  }
}
