import type { WindowDisplayPresetId } from "@/shared/constants/windowDisplay";
import { applyWindowDisplayPreset } from "@/shared/services/tauri/applyWindowDisplay";
import { logOptionalRejection } from "@/shared/lib/devLog";

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

/** Close the current Tauri window (main app window). */
export async function closeTauriMainWindow(): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}

/**
 * Browser / non-Tauri: attempt to close the tab; if blocked, show an alert.
 */
export function tryCloseWebTab(webExitUnavailableMessage: string): void {
  try {
    window.close();
    if (!window.closed) {
      alert(webExitUnavailableMessage);
    }
  } catch {
    alert(webExitUnavailableMessage);
  }
}

export function logCloseMainWindowFailure(scope: string, err: unknown): void {
  logOptionalRejection(scope, err);
}
