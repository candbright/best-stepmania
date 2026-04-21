import { onUnmounted, watch } from "vue";
import { useSessionStore } from "@/shared/stores/session";
import { useSettingsStore } from "@/shared/stores/settings";
import { isTauri } from "@/shared/lib/platform";
import { logDebug } from "@/shared/lib/devLog";
import { useSettingsSaveQueue } from "@/shared/composables/useSettingsSaveQueue";

/**
 * Normal / custom resizable mode: keep `windowWidth` / `windowHeight` in sync with the webview
 * inner size, debounce-save to disk, and flush-save before the window closes.
 */
export function usePersistedWindowGeometry() {
  const settings = useSettingsStore();
  const session = useSessionStore();
  const { schedule, flushAwait } = useSettingsSaveQueue(
    () => settings.saveAppConfig(session.profileName),
    650,
  );

  let dispose: (() => void) | null = null;

  watch(
    () => settings.configLoaded,
    (loaded) => {
      dispose?.();
      dispose = null;
      if (!loaded || !isTauri()) return;

      const onResize = () => {
        if (settings.windowDisplayPreset !== "normal") return;
        settings.windowWidth = Math.max(0, Math.round(window.innerWidth));
        settings.windowHeight = Math.max(0, Math.round(window.innerHeight));
        schedule();
      };

      window.addEventListener("resize", onResize);
      const vv = window.visualViewport;
      vv?.addEventListener("resize", onResize);

      let closeUnlisten: (() => void) | undefined;
      let closeSetupDisposed = false;
      void import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) =>
          getCurrentWindow().onCloseRequested(async () => {
            if (settings.windowDisplayPreset === "normal") {
              settings.windowWidth = Math.max(0, Math.round(window.innerWidth));
              settings.windowHeight = Math.max(0, Math.round(window.innerHeight));
            }
            try {
              await flushAwait();
            } catch (e: unknown) {
              logDebug("Optional", "usePersistedWindowGeometry.closeSave", e);
            }
          }),
        )
        .then((unlisten) => {
          if (closeSetupDisposed) {
            unlisten();
            return;
          }
          closeUnlisten = unlisten;
        })
        .catch((e: unknown) => logDebug("Optional", "usePersistedWindowGeometry.onCloseRequested", e));

      dispose = () => {
        closeSetupDisposed = true;
        window.removeEventListener("resize", onResize);
        vv?.removeEventListener("resize", onResize);
        closeUnlisten?.();
      };
    },
    { immediate: true },
  );

  onUnmounted(() => {
    dispose?.();
  });
}
