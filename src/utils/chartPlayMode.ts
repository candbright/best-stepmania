import type { CoopMode } from "@/engine/types";

/** Mirrors `PlayMode` in session store — duplicated here to avoid store↔util import cycles. */
export type SessionPlayMode = "pump-single" | "pump-double" | "pump-routine";

/**
 * Maps chart `stepsType` from SSC/SM to the three UI play modes and coop layout.
 * Keeps session `playMode` / settings `coopMode` aligned with the actual chart.
 */
export function playModeAndCoopForStepsType(
  stepsType: string | undefined,
): { playMode: SessionPlayMode; coopMode: CoopMode } | null {
  if (!stepsType) return null;
  if (stepsType === "pump-single" || stepsType === "dance-single") {
    return { playMode: "pump-single", coopMode: "solo" };
  }
  if (stepsType === "pump-double") {
    return { playMode: "pump-double", coopMode: "double" };
  }
  if (
    stepsType === "pump-routine" ||
    stepsType === "dance-routine" ||
    stepsType === "pump-couple" ||
    stepsType === "dance-double" ||
    stepsType === "dance-couple"
  ) {
    return { playMode: "pump-routine", coopMode: "co-op" };
  }
  return null;
}

/** Whether a chart should appear when the user picked `mode` on the title screen. */
export function chartFitsPlayMode(chart: { stepsType: string }, mode: SessionPlayMode): boolean {
  const mapped = playModeAndCoopForStepsType(chart.stepsType);
  if (mapped) return mapped.playMode === mode;
  return chart.stepsType === mode;
}

/** First list index whose song has at least one chart for `mode`, or `-1` if none. */
export function firstSongIndexMatchingPlayMode(
  songs: readonly { charts?: readonly { stepsType: string }[] }[],
  mode: SessionPlayMode,
): number {
  for (let i = 0; i < songs.length; i++) {
    const charts = songs[i]?.charts;
    if (!charts?.length) continue;
    if (charts.some((c) => chartFitsPlayMode(c, mode))) return i;
  }
  return -1;
}

export function songHasChartForPlayMode(
  song: { charts?: readonly { stepsType: string }[] } | null | undefined,
  mode: SessionPlayMode,
): boolean {
  const charts = song?.charts;
  if (!charts?.length) return false;
  return charts.some((c) => chartFitsPlayMode(c, mode));
}
