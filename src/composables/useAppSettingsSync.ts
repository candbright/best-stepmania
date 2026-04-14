import { watch, watchEffect, type WatchStopHandle } from "vue";
import { currentLocale } from "@/i18n";
import type { RhythmSfxStyle } from "@/api/config";
import {
  setGameplaySfxEnabled,
  setGameplaySfxVolume,
  setMetronomeSfxEnabled,
  setMetronomeSfxGain,
  setMetronomeSfxStyle,
  setRhythmSfxEnabled,
  setRhythmSfxGain,
  setRhythmSfxStyle,
  setUiSfxEnabled,
  setUiSfxStyle,
  setUiSfxVolume,
} from "@/utils/sfx";
import { logOptionalRejection } from "@/utils/devLog";
import { syncAudioVolume } from "@/services/tauri/audio";
import { applyWindowPreset } from "@/services/tauri/window";
import { useGameStore } from "@/stores/game";

type GameStore = ReturnType<typeof useGameStore>;

export interface AppSettingsSyncHandles {
  syncCustomWindowSize: () => void;
  stopAll: () => void;
}

/**
 * Side effects for persisted settings while the options screen is mounted:
 * audio IPC, SFX engine, window preset, locale/theme, UI scale, debounced save triggers.
 */
export function useAppSettingsSync(game: GameStore, scheduleSave: () => void): AppSettingsSyncHandles {
  const stops: WatchStopHandle[] = [];

  function syncCustomWindowSize() {
    if (game.windowDisplayPreset !== "normal" || typeof window === "undefined") return;
    game.windowWidth = Math.max(0, Math.round(window.innerWidth));
    game.windowHeight = Math.max(0, Math.round(window.innerHeight));
  }

  stops.push(
    watchEffect(() => {
      game.masterVolume;
      game.musicVolume;
      game.effectVolume;
      game.metronomeSfxEnabled;
      game.metronomeSfxVolume;
      game.metronomeSfxStyle;
      game.rhythmSfxEnabled;
      game.rhythmSfxVolume;
      game.rhythmSfxStyle;
      game.uiSfxEnabled;
      game.uiSfxVolume;
      game.uiSfxStyle;
      game.audioOffsetMs;
      game.windowDisplayPreset;
      game.windowWidth;
      game.windowHeight;
      game.vsync;
      game.targetFps;
      game.language;
      game.theme;
      game.uiScale;
      game.doublePanelGapPx;
      game.judgmentStyle;
      game.showOffset;
      game.lifeType;
      game.batteryLives;
      game.showParticles;
      game.cursorEnabled;
      game.cursorStylePreset;
      game.cursorScale;
      game.cursorOpacity;
      game.cursorGlow;
      game.cursorRippleEnabled;
      game.cursorRippleDurationMs;
      game.cursorRippleMinScale;
      game.cursorRippleMaxScale;
      game.cursorRippleOpacity;
      game.cursorRippleLineWidth;
      game.cursorRippleGlow;

      scheduleSave();
    }),
  );

  stops.push(
    watch(
      () => [game.masterVolume, game.musicVolume],
      ([master, music]) => {
        syncAudioVolume(music ?? 70, master ?? 80);
      },
      { immediate: true },
    ),
    watch(
      () => [game.uiSfxVolume, game.uiSfxEnabled, game.uiSfxStyle] as const,
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
          game.effectVolume,
          game.metronomeSfxEnabled,
          game.metronomeSfxVolume,
          game.metronomeSfxStyle,
          game.rhythmSfxEnabled,
          game.rhythmSfxVolume,
          game.rhythmSfxStyle,
        ] as const,
      ([effectVol, metronomeEnabled, metronomeVol, metronomeStyle, rhythmEnabled, rhythmVol, rhythmStyle]) => {
        setGameplaySfxVolume((effectVol ?? 90) / 100);
        setGameplaySfxEnabled(true);
        setMetronomeSfxEnabled(metronomeEnabled ?? true);
        setMetronomeSfxGain((metronomeVol ?? 100) / 100);
        setMetronomeSfxStyle((metronomeStyle ?? "bright") as RhythmSfxStyle);
        setRhythmSfxEnabled(rhythmEnabled ?? true);
        setRhythmSfxGain((rhythmVol ?? 100) / 100);
        setRhythmSfxStyle((rhythmStyle ?? "bright") as RhythmSfxStyle);
      },
      { immediate: true },
    ),
    watch(
      () => [game.windowDisplayPreset, game.windowWidth, game.windowHeight] as const,
      ([preset, width, height]) => {
        void applyWindowPreset(
          preset,
          preset === "normal" && width != null && height != null ? { width, height } : null,
        ).catch((e) => logOptionalRejection("useAppSettingsSync.applyWindowPreset", e));
      },
      { immediate: true },
    ),
    watch(
      () => [game.windowDisplayPreset, game.windowWidth, game.windowHeight] as const,
      () => {
        syncCustomWindowSize();
        scheduleSave();
      },
      { flush: "post" },
    ),
    watch(
      () => [game.language, game.theme] as const,
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
      () => game.uiScale,
      (scale) => {
        document.documentElement.style.fontSize = `${(scale ?? 1) * 16}px`;
      },
      { immediate: true },
    ),
    watch(
      () => [game.gameplayPumpDoubleLanes, game.shortcutOverrides] as const,
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
