import { watch, type WatchStopHandle } from "vue";
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
import { useGameStore } from "@/stores/game";

type GameStore = ReturnType<typeof useGameStore>;

/**
 * Keeps WebAudio SFX engine in sync with persisted settings app-wide.
 */
export function useGlobalSfxBridge(game: GameStore): () => void {
  const stops: WatchStopHandle[] = [];

  stops.push(
    watch(
      () => [game.uiSfxVolume, game.uiSfxEnabled, game.uiSfxStyle] as const,
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
  );

  return () => stops.forEach((s) => s());
}
