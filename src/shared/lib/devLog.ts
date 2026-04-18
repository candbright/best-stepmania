/** True when Vite runs in development (`npm run dev` / `tauri dev`). Production bundles are always false. */
export const isDevLogEnabled = import.meta.env.DEV;

/** Logs in development only; uses `console.warn` to avoid noisy `log` in production tooling. */
export function devWarn(...args: unknown[]): void {
  if (isDevLogEnabled) {
    console.warn(...args);
  }
}

/** Namespaced dev-only warning (e.g. `[GameEngine] …`). */
export function devWarnNs(namespace: string, ...args: unknown[]): void {
  if (isDevLogEnabled) {
    console.warn(`[${namespace}]`, ...args);
  }
}

/** Verbose diagnostics (visible when DevTools shows Verbose / All levels). */
export function devDebug(namespace: string, ...args: unknown[]): void {
  if (!isDevLogEnabled) return;
  console.debug(`[${namespace}]`, ...args);
}

/** Lifecycle / milestone messages in development. */
export function devInfo(namespace: string, ...args: unknown[]): void {
  if (!isDevLogEnabled) return;
  console.info(`[${namespace}]`, ...args);
}

/**
 * Best-effort / fire-and-forget async: no user-facing error, but visible in dev for debugging.
 */
export function logOptionalRejection(context: string, err: unknown): void {
  if (isDevLogEnabled) {
    console.warn(`[optional:${context}]`, err);
  }
}
