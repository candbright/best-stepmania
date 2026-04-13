/** Matches persisted `windowDisplayPreset` / Rust `window_display_preset`. */
export const WINDOW_DISPLAY_PRESET_IDS = [
  "normal",
  "fixed16x9_1280x720",
  "fixed16x9_1600x900",
  "fixed16x9_1920x1080",
  "fixed16x10_1680x1050",
  "fixed16x10_1920x1200",
  "fixed4x3_1024x768",
  "fixed4x3_1600x1200",
  "fixed21x9_2560x1080",
  "borderless",
  "exclusiveFullscreen",
] as const;

export type WindowDisplayPresetId = (typeof WINDOW_DISPLAY_PRESET_IDS)[number];

const ID_SET: ReadonlySet<string> = new Set(WINDOW_DISPLAY_PRESET_IDS);

const FIXED_LOGICAL_SIZES: Partial<Record<WindowDisplayPresetId, { w: number; h: number }>> = {
  fixed16x9_1280x720: { w: 1280, h: 720 },
  fixed16x9_1600x900: { w: 1600, h: 900 },
  fixed16x9_1920x1080: { w: 1920, h: 1080 },
  fixed16x10_1680x1050: { w: 1680, h: 1050 },
  fixed16x10_1920x1200: { w: 1920, h: 1200 },
  fixed4x3_1024x768: { w: 1024, h: 768 },
  fixed4x3_1600x1200: { w: 1600, h: 1200 },
  fixed21x9_2560x1080: { w: 2560, h: 1080 },
};

export function fixedLogicalSizeForPreset(
  preset: WindowDisplayPresetId,
): { w: number; h: number } | null {
  const s = FIXED_LOGICAL_SIZES[preset];
  return s ?? null;
}

export function normalizeWindowDisplayPreset(
  raw: string | undefined,
  legacyFullscreen: boolean,
): WindowDisplayPresetId {
  if (raw && ID_SET.has(raw)) {
    return raw as WindowDisplayPresetId;
  }
  if (legacyFullscreen) {
    return "exclusiveFullscreen";
  }
  return "normal";
}
