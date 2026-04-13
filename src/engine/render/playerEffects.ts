import type { CoopMode, PerPlayerConfig } from "@/engine/types";
import { usesSplitWidePanelLayout } from "@/engine/render/panelLayout";

export interface TrackEffects {
  sudden: boolean;
  hidden: boolean;
  rotate: boolean;
}

export function resolveTrackEffects(
  track: number,
  numTracks: number,
  coopMode: CoopMode,
  playerConfigs: [PerPlayerConfig, PerPlayerConfig],
): TrackEffects {
  const [p1, p2] = playerConfigs;

  if (usesSplitWidePanelLayout(coopMode, numTracks)) {
    const half = Math.floor(numTracks / 2);
    // Solo wide (e.g. 10-key): left foot = P1 options, right foot = P2 options (rotate, sudden, hidden).
    const playerCfg = track < half ? p1 : p2;
    return {
      sudden: playerCfg.sudden ?? false,
      hidden: playerCfg.hidden ?? false,
      rotate: playerCfg.rotate ?? false,
    };
  }

  return {
    sudden: p1.sudden ?? false,
    hidden: p1.hidden ?? false,
    rotate: p1.rotate ?? false,
  };
}
