/** Pump L/R mirror: ↙↔↘, ↖↔↗, center fixed (per 5-lane panel). */
export function mirrorPumpTrackH(track: number, numTracks: number): number {
  const map5 = [4, 3, 2, 1, 0];
  if (numTracks === 5) return map5[track] ?? track;
  if (numTracks === 10) {
    if (track < 5) return map5[track] ?? track;
    return 5 + (map5[track - 5] ?? track - 5);
  }
  return track;
}

/** Pump U/D mirror: ↙↔↖, ↘↔↗, center fixed (per 5-lane panel). */
export function mirrorPumpTrackV(track: number, numTracks: number): number {
  const map5 = [1, 0, 2, 4, 3];
  if (numTracks === 5) return map5[track] ?? track;
  if (numTracks === 10) {
    if (track < 5) return map5[track] ?? track;
    return 5 + (map5[track - 5] ?? track - 5);
  }
  return track;
}

export function isPumpPadLayout(stepsType: string | undefined, numTracks: number): boolean {
  return !!stepsType?.startsWith("pump-") && (numTracks === 5 || numTracks === 10);
}
