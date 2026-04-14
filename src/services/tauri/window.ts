import type { WindowDisplayPresetId } from "@/constants/windowDisplay";
import { applyWindowDisplayPreset } from "@/utils/applyWindowDisplay";

export interface WindowPresetSize {
  width: number;
  height: number;
}

export async function applyWindowPreset(
  preset: WindowDisplayPresetId,
  customSize: WindowPresetSize | null,
): Promise<void> {
  await applyWindowDisplayPreset(preset, customSize);
}
