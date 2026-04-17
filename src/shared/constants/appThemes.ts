/**
 * Built-in UI themes (`data-theme` on `document.body`).
 * Palettes follow widely used open-source / design-system dark themes (approximate accents).
 */
export const APP_THEME_IDS = [
  "default",
  "oled",
  "purple",
  "retro",
  "dracula",
  "nord",
  "tokyo-night",
  "catppuccin-mocha",
  "gruvbox-dark",
  "solarized-dark",
  "rose-pine",
  "one-dark-pro",
  "everforest-dark",
  "ayu-dark",
  "kanagawa",
] as const;

export type AppThemeId = (typeof APP_THEME_IDS)[number];

const KNOWN = new Set<string>(APP_THEME_IDS);

export function normalizeAppThemeId(id: string): AppThemeId {
  return KNOWN.has(id) ? (id as AppThemeId) : "default";
}
