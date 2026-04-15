import { COLUMN_WIDTH, HEADER_HEIGHT } from "./constants";

type BpmPoint = { beat: number; bpm: number };

type MarqueeRubberBand = {
  anchorBeat: number;
  anchorTrackT: number;
  endBeat: number;
  endTrackT: number;
};

export function beatToYFromState(beat: number, scrollBeat: number, zoom: number): number {
  return (beat - scrollBeat) * zoom + HEADER_HEIGHT + 2;
}

export function yToBeatFromState(y: number, scrollBeat: number, zoom: number): number {
  return (y - HEADER_HEIGHT - 2) / zoom + scrollBeat;
}

export function snapBeatFromState(beat: number, quantize: number): number {
  const step = 4 / quantize;
  return Math.round(beat / step) * step;
}

export function beatToRowFromState(beat: number): number {
  return Math.round(beat * 48);
}

export function beatToTimeFromState(beat: number, bpmChanges: BpmPoint[], fallbackBpm: number): number {
  const bpm0 = bpmChanges[0]?.bpm ?? fallbackBpm;
  if (beat < 0) {
    return (beat * 60) / bpm0;
  }
  if (bpmChanges.length <= 1) return (beat * 60) / fallbackBpm;
  let time = 0;
  let prevBeat = 0;
  let prevBpm = bpmChanges[0]?.bpm || fallbackBpm;
  for (let i = 1; i < bpmChanges.length; i++) {
    const change = bpmChanges[i];
    if (!change || change.beat >= beat) break;
    time += ((change.beat - prevBeat) * 60) / prevBpm;
    prevBeat = change.beat;
    prevBpm = change.bpm;
  }
  time += ((beat - prevBeat) * 60) / prevBpm;
  return time;
}

/** Inverse of beatToTime: given elapsed seconds, return the beat position (multi-BPM aware). */
export function timeToBeatFromState(seconds: number, bpmChanges: BpmPoint[], fallbackBpm: number): number {
  const bpm0 = bpmChanges[0]?.bpm ?? fallbackBpm;
  if (seconds < 0) {
    return (seconds * bpm0) / 60;
  }
  if (bpmChanges.length <= 1) return (seconds * fallbackBpm) / 60;
  let remaining = seconds;
  let prevBeat = 0;
  let prevBpm = bpmChanges[0]?.bpm || fallbackBpm;
  for (let i = 1; i < bpmChanges.length; i++) {
    const change = bpmChanges[i];
    if (!change) break;
    const segDuration = ((change.beat - prevBeat) * 60) / prevBpm;
    if (remaining <= segDuration) break;
    remaining -= segDuration;
    prevBeat = change.beat;
    prevBpm = change.bpm;
  }
  return prevBeat + (remaining * prevBpm) / 60;
}

/** Row/track bounds of the in-progress marquee (same geometry as commit); null if off the field. */
export function marqueePreviewRowTrackRectFromState(args: {
  rubberBand: MarqueeRubberBand | null;
  fieldX: number;
  fieldWidth: number;
  numTracks: number;
  beatToY: (beat: number) => number;
  yToBeat: (y: number) => number;
}): { minRow: number; maxRow: number; minTrack: number; maxTrack: number } | null {
  const { rubberBand, fieldX, fieldWidth, numTracks, beatToY, yToBeat } = args;
  if (!rubberBand) return null;
  const ax = fieldX + rubberBand.anchorTrackT * COLUMN_WIDTH;
  const ay = beatToY(rubberBand.anchorBeat);
  const ex = fieldX + rubberBand.endTrackT * COLUMN_WIDTH;
  const ey = beatToY(rubberBand.endBeat);
  const rx0 = Math.min(ax, ex);
  const rx1 = Math.max(ax, ex);
  const ry0 = Math.min(ay, ey);
  const ry1 = Math.max(ay, ey);
  const ix0 = Math.max(rx0, fieldX);
  const ix1 = Math.min(rx1, fieldX + fieldWidth);
  if (ix1 <= fieldX || ix0 >= fieldX + fieldWidth) return null;
  const chartY0 = Math.max(ry0, HEADER_HEIGHT);
  const chartY1 = Math.max(ry1, HEADER_HEIGHT);
  const b0 = yToBeat(chartY0);
  const b1 = yToBeat(chartY1);
  const bLo = Math.min(b0, b1);
  const bHi = Math.max(b0, b1);
  let minRow = Math.floor(bLo * 48);
  let maxRow = Math.ceil(bHi * 48) - 1;
  if (maxRow < minRow) maxRow = minRow;
  minRow = Math.max(0, minRow);
  let minTrack = Math.max(0, Math.min(numTracks - 1, Math.floor((ix0 - fieldX) / COLUMN_WIDTH)));
  let maxTrack = Math.max(0, Math.min(numTracks - 1, Math.floor((ix1 - fieldX - Number.EPSILON) / COLUMN_WIDTH)));
  if (maxTrack < minTrack) {
    const swap = minTrack;
    minTrack = maxTrack;
    maxTrack = swap;
  }
  return { minRow, maxRow, minTrack, maxTrack };
}
