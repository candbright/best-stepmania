import { watch, type WatchStopHandle } from "vue";
import type { RhythmSfxStyle } from "@/shared/api/config";
import {
  applyGameplayRhythmSfxSettings,
  setUiSfxEnabled,
  setUiSfxStyle,
  setUiSfxVolume,
} from "@/shared/lib/sfx";
import { useSettingsStore } from "@/shared/stores/settings";

type SettingsStore = ReturnType<typeof useSettingsStore>;

/**
 * Keeps WebAudio SFX engine in sync with persisted settings app-wide.
 */
export function useGlobalSfxBridge(settings: SettingsStore): () => void {
  const stops: WatchStopHandle[] = [];

  stops.push(
    watch(
      () => [settings.uiSfxVolume, settings.uiSfxEnabled, settings.uiSfxStyle] as const,
      ([uiVolume, enabled, style]) => {
        setUiSfxVolume((uiVolume ?? 70) / 100);
        setUiSfxEnabled(enabled ?? true);
        setUiSfxStyle((style ?? "classic") as "classic" | "soft" | "arcade");
      },
      { immediate: true },
    ),
    watch(
      () =>
        [
          settings.effectVolume,
          settings.metronomeSfxEnabled,
          settings.metronomeSfxVolume,
          settings.metronomeSfxStyle,
          settings.rhythmSfxEnabled,
          settings.rhythmSfxVolume,
          settings.rhythmSfxStyle,
        ] as const,
      ([effectVol, metronomeEnabled, metronomeVol, metronomeStyle, rhythmEnabled, rhythmVol, rhythmStyle]) => {
        applyGameplayRhythmSfxSettings({
          effectVolume: effectVol ?? 90,
          metronomeSfxEnabled: metronomeEnabled ?? true,
          metronomeSfxVolume: metronomeVol ?? 100,
          metronomeSfxStyle: (metronomeStyle ?? "bright") as RhythmSfxStyle,
          rhythmSfxEnabled: rhythmEnabled ?? true,
          rhythmSfxVolume: rhythmVol ?? 100,
          rhythmSfxStyle: (rhythmStyle ?? "bright") as RhythmSfxStyle,
        });
      },
      { immediate: true },
    ),
  );

  return () => stops.forEach((s) => s());
}
