/**
 * Dedupes rapid preview / control SFX triggers (e.g. double event paths).
 */
export function useSfxPreviewGate(cooldownMs = 120) {
  let lastAt = 0;

  function tryRun(fn: () => void) {
    const now = performance.now();
    if (now - lastAt < cooldownMs) return;
    lastAt = now;
    fn();
  }

  return { tryRun };
}
