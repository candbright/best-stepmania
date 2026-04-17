import { watch, watchEffect, type WatchStopHandle } from "vue";
import { currentLocale } from "@/shared/i18n";
import type { RhythmSfxStyle } from "@/shared/api/config";
import {
  applyGameplayRhythmSfxSettings,
  setUiSfxEnabled,
  setUiSfxStyle,
  setUiSfxVolume,
} from "@/shared/lib/sfx";
import { logOptionalRejection } from "@/shared/lib/devLog";
import { syncAudioVolume } from "@/shared/services/tauri/audio";
import { applyWindowPreset } from "@/shared/services/tauri/window";
import { useSettingsStore } from "@/shared/stores/settings";

type SettingsStore = ReturnType<typeof useSettingsStore>;

export interface AppSettingsSyncHandles {
  syncCustomWindowSize: () => void;
  stopAll: () => void;
}

/**
 * Side effects for persisted settings while the options screen is mounted:
 * audio IPC, SFX engine, window preset, locale/theme, UI scale, debounced save triggers.
 */
export function useAppSettingsSync(settings: SettingsStore, scheduleSave: () => void): AppSettingsSyncHandles {
  const stops: WatchStopHandle[] = [];

  function syncCustomWindowSize() {
    if (settings.windowDisplayPreset !== "normal" || typeof window === "undefined") return;
    settings.windowWidth = Math.max(0, Math.round(window.innerWidth));
    settings.windowHeight = Math.max(0, Math.round(window.innerHeight));
  }

  stops.push(
    watchEffect(() => {
      settings.masterVolume;
      settings.musicVolume;
      settings.effectVolume;
      settings.metronomeSfxEnabled;
      settings.metronomeSfxVolume;
      settings.metronomeSfxStyle;
      settings.rhythmSfxEnabled;
      settings.rhythmSfxVolume;
      settings.rhythmSfxStyle;
      settings.uiSfxEnabled;
      settings.uiSfxVolume;
      settings.uiSfxStyle;
      settings.audioOffsetMs;
      settings.windowDisplayPreset;
      settings.windowWidth;
      settings.windowHeight;
      settings.vsync;
      settings.targetFps;
      settings.language;
      settings.theme;
      settings.uiScale;
      settings.doublePanelGapPx;
      settings.judgmentStyle;
      settings.showOffset;
      settings.lifeType;
      settings.batteryLives;
      settings.showParticles;
      settings.cursorEnabled;
      settings.cursorStylePreset;
      settings.cursorScale;
      settings.cursorOpacity;
      settings.cursorGlow;
      settings.cursorRippleEnabled;
      settings.cursorRippleDurationMs;
      settings.cursorRippleMinScale;
      settings.cursorRippleMaxScale;
      settings.cursorRippleOpacity;
      settings.cursorRippleLineWidth;
      settings.cursorRippleGlow;

      scheduleSave();
    }),
  );

  stops.push(
    watch(
      () => [settings.masterVolume, settings.musicVolume],
      ([master, music]) => {
        syncAudioVolume(music ?? 70, master ?? 80);
      },
      { immediate: true },
    ),
    watch(
      () => [settings.uiSfxVolume, settings.uiSfxEnabled, settings.uiSfxStyle] as const,
      ([uiVol, enabled, style]) => {
        setUiSfxVolume((uiVol ?? 70) / 100);
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
    watch(
      () => [settings.windowDisplayPreset, settings.windowWidth, settings.windowHeight] as const,
      ([preset, width, height]) => {
        void applyWindowPreset(
          preset,
          preset === "normal" && width != null && height != null ? { width, height } : null,
        ).catch((e) => logOptionalRejection("useAppSettingsSync.applyWindowPreset", e));
      },
      { immediate: true },
    ),
    watch(
      () => [settings.windowDisplayPreset, settings.windowWidth, settings.windowHeight] as const,
      () => {
        syncCustomWindowSize();
        scheduleSave();
      },
      { flush: "post" },
    ),
    watch(
      () => [settings.language, settings.theme] as const,
      ([lang, thm]) => {
        if (lang) {
          currentLocale.value = lang as "en" | "zh-CN";
          localStorage.setItem("locale", lang as string);
        }
        if (thm) {
          document.body.setAttribute("data-theme", thm as string);
        }
      },
      { immediate: true },
    ),
    watch(
      () => settings.uiScale,
      (scale) => {
        document.documentElement.style.fontSize = `${(scale ?? 1) * 16}px`;
      },
      { immediate: true },
    ),
    watch(
      () => [settings.gameplayPumpDoubleLanes, settings.shortcutOverrides] as const,
      () => scheduleSave(),
      { deep: true },
    ),
  );

  function stopAll() {
    stops.forEach((s) => s());
    stops.length = 0;
  }

  return { syncCustomWindowSize, stopAll };
}
