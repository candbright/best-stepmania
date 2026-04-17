import type { WindowDisplayPresetId } from "@/shared/constants/windowDisplay";
import { fixedLogicalSizeForPreset } from "@/shared/constants/windowDisplay";
import { isTauri } from "@/shared/lib/platform";
import { logOptionalRejection } from "@/shared/lib/devLog";

export interface CustomWindowSize {
  width: number;
  height: number;
}

/**
 * Applies window decorations, fullscreen, and size for the persisted display preset.
 * No-op outside Tauri (e.g. Vite dev in browser).
 */
export async function applyWindowDisplayPreset(
  preset: WindowDisplayPresetId,
  customSize?: CustomWindowSize | null,
): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow, LogicalSize, currentMonitor } = await import("@tauri-apps/api/window");

    const win = getCurrentWindow();

    if (preset === "normal") {
      await win.setFullscreen(false);
      await win.setDecorations(true);
      await win.setResizable(true);
      const width = customSize?.width;
      const height = customSize?.height;
      if (width && height && width > 0 && height > 0) {
        await win.setSize(new LogicalSize(width, height));
      }
      return;
    }

    if (preset === "exclusiveFullscreen") {
      await win.setFullscreen(false);
      await win.setDecorations(true);
      await win.setResizable(false);
      await win.setFullscreen(true);
      return;
    }

    await win.setFullscreen(false);

    if (preset === "borderless") {
      const mon = await currentMonitor();
      if (!mon) {
        await win.setDecorations(false);
        await win.setResizable(false);
        return;
      }
      await win.setDecorations(false);
      await win.setResizable(false);
      await win.setPosition(mon.workArea.position);
      await win.setSize(mon.workArea.size);
      return;
    }

    await win.setDecorations(true);

    const dim = fixedLogicalSizeForPreset(preset);
    if (dim) {
      await win.setResizable(false);
      await win.setSize(new LogicalSize(dim.w, dim.h));
      await win.center();
    }
  } catch (e: unknown) {
    logOptionalRejection("applyWindowDisplayPreset", e);
  }
}
