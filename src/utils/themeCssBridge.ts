/**
 * Theme colors for Canvas / TS that cannot use CSS variables directly.
 * Themes apply `data-theme` on document.body; variables are read from body.
 */

let cachedPrimaryHex = "#7360ff";
let cachedBgHex = "#08080f";
let cachedBgGradientEndHex = "#06060c";

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const t = hex.trim();
  if (!t.startsWith("#")) return null;
  const h = t.slice(1);
  if (h.length === 3) {
    const r = parseInt(h[0]! + h[0]!, 16);
    const g = parseInt(h[1]! + h[1]!, 16);
    const b = parseInt(h[2]! + h[2]!, 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b };
  }
  if (h.length === 6) {
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return null;
}

export function syncThemePrimaryColorFromDocument(): void {
  const cs = getComputedStyle(document.body);
  const primary = cs.getPropertyValue("--primary-color").trim();
  if (primary) cachedPrimaryHex = primary;
  const bg = cs.getPropertyValue("--bg-color").trim();
  if (bg) cachedBgHex = bg;
  const bgEnd = cs.getPropertyValue("--bg-gradient-end").trim();
  if (bgEnd) cachedBgGradientEndHex = bgEnd;
}

export function getThemePrimaryHex(): string {
  return cachedPrimaryHex;
}

/** Main app background (--bg-color); use for editor field / empty canvas. */
export function getThemeBgHex(): string {
  return cachedBgHex;
}

/** Darker page gradient stop (--bg-gradient-end); use for waveform strip / contrast. */
export function getThemeBgGradientEndHex(): string {
  return cachedBgGradientEndHex;
}

export function getThemePrimaryRgba(alpha: number): string {
  const rgb = parseHexRgb(cachedPrimaryHex);
  if (!rgb) return `rgba(115, 96, 255, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** Call once after app mount; keeps canvas colors in sync with theme changes. */
export function installThemeCssBridge(): void {
  syncThemePrimaryColorFromDocument();
  const obs = new MutationObserver(() => {
    syncThemePrimaryColorFromDocument();
  });
  obs.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
}
