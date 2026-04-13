/** Ensures at least `minMs` ms have passed since `startedMs` (performance.now()). */
export async function ensureMinElapsed(startedMs: number, minMs: number): Promise<void> {
  const elapsed = performance.now() - startedMs;
  const remain = minMs - elapsed;
  if (remain > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remain));
  }
}
