import type { WindowDisplayPresetId } from "@/shared/constants/windowDisplay";
import { fixedLogicalSizeForPreset } from "@/shared/constants/windowDisplay";
import { isTauri } from "@/shared/lib/platform";
import { logDebug } from "@/shared/lib/devLog";

export interface CustomWindowSize {
  width: number;
  height: number;
}

/** Sync `html[data-window-borderless]` so WebView drag regions are off in borderless mode. */
export function syncWindowBorderlessDom(preset: WindowDisplayPresetId): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (preset === "borderless") {
    root.dataset.windowBorderless = "1";
  } else {
    delete root.dataset.windowBorderless;
  }
}

/**
 * Applies window decorations, fullscreen, and size for the persisted display preset.
 * No-op outside Tauri (e.g. Vite dev in browser).
 */
export async function applyWindowDisplayPreset(
  preset: WindowDisplayPresetId,
  customSize?: CustomWindowSize | null,
): Promise<void> {
  syncWindowBorderlessDom(preset);
  if (!isTauri()) return;
  try {
    const { getCurrentWindow, LogicalSize, currentMonitor } = await import("@tauri-apps/api/window");

    const win = getCurrentWindow();

    if (preset === "normal") {
      await win.setFullscreen(false);
      await win.setDecorations(true);
      await win.setResizable(true);
      await win.setMaximizable(true);
      const width = customSize?.width;
      const height = customSize?.height;
      if (width && height && width > 0 && height > 0 && !(await win.isMaximized())) {
        await win.setSize(new LogicalSize(width, height));
      }
      return;
    }

    if (preset === "exclusiveFullscreen") {
      // 已处于全屏时跳过「先关再开」，避免进入设置等场景重复 apply 时闪屏
      if (await win.isFullscreen()) {
        return;
      }
      await win.setFullscreen(false);
      await win.setDecorations(true);
      await win.setResizable(false);
      await win.setMaximizable(false);
      await win.setFullscreen(true);
      return;
    }

    await win.setFullscreen(false);

    if (preset === "borderless") {
      const mon = await currentMonitor();
      if (!mon) {
        await win.setDecorations(false);
        await win.setResizable(false);
        await win.setMaximizable(false);
        return;
      }
      await win.setDecorations(false);
      await win.setResizable(false);
      await win.setMaximizable(false);
      await win.setPosition(mon.workArea.position);
      await win.setSize(mon.workArea.size);
      return;
    }

    await win.setDecorations(true);

    const dim = fixedLogicalSizeForPreset(preset);
    if (dim) {
      await win.setMaximizable(false);
      if (await win.isMaximized()) {
        await win.unmaximize();
      }
      await win.setResizable(false);
      await win.setSize(new LogicalSize(dim.w, dim.h));
      await win.center();
    }
  } catch (e: unknown) {
    logDebug("Optional", "applyWindowDisplayPreset", e);
  }
}
