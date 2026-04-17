import { mirrorPumpTrackH, mirrorPumpTrackV } from "./pumpMirror";

export type SelectionRect = { minRow: number; maxRow: number; minTrack: number; maxTrack: number };

export function mergeSelectionRects(rects: SelectionRect[]): SelectionRect | null {
  if (rects.length === 0) return null;
  return {
    minRow: Math.min(...rects.map((r) => r.minRow)),
    maxRow: Math.max(...rects.map((r) => r.maxRow)),
    minTrack: Math.min(...rects.map((r) => r.minTrack)),
    maxTrack: Math.max(...rects.map((r) => r.maxTrack)),
  };
}

/** Bbox of { mapT(t) | minT <= t <= maxT } (integer tracks). */
export function trackSpanAfterMap(
  minT: number,
  maxT: number,
  mapT: (t: number) => number,
): { minTrack: number; maxTrack: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (let t = minT; t <= maxT; t++) {
    const u = mapT(t);
    lo = Math.min(lo, u);
    hi = Math.max(hi, u);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { minTrack: minT, maxTrack: maxT };
  }
  return { minTrack: lo, maxTrack: hi };
}

export function remapRectNonPumpH(r: SelectionRect, m: SelectionRect): SelectionRect {
  return {
    minRow: r.minRow,
    maxRow: r.maxRow,
    minTrack: m.minTrack + m.maxTrack - r.maxTrack,
    maxTrack: m.minTrack + m.maxTrack - r.minTrack,
  };
}

export function remapRectNonPumpV(r: SelectionRect, m: SelectionRect): SelectionRect {
  return {
    minRow: m.minRow + m.maxRow - r.maxRow,
    maxRow: m.minRow + m.maxRow - r.minRow,
    minTrack: r.minTrack,
    maxTrack: r.maxTrack,
  };
}

export function remapRectNonPumpD(r: SelectionRect, m: SelectionRect): SelectionRect {
  return remapRectNonPumpV(remapRectNonPumpH(r, m), m);
}

export function remapRectPumpH(r: SelectionRect, nT: number): SelectionRect {
  const { minTrack, maxTrack } = trackSpanAfterMap(r.minTrack, r.maxTrack, (t) => mirrorPumpTrackH(t, nT));
  return { ...r, minTrack, maxTrack };
}

export function remapRectPumpV(r: SelectionRect, nT: number): SelectionRect {
  const { minTrack, maxTrack } = trackSpanAfterMap(r.minTrack, r.maxTrack, (t) => mirrorPumpTrackV(t, nT));
  return { ...r, minTrack, maxTrack };
}

export function remapRectPumpD(r: SelectionRect, nT: number): SelectionRect {
  const { minTrack, maxTrack } = trackSpanAfterMap(r.minTrack, r.maxTrack, (t) =>
    mirrorPumpTrackV(mirrorPumpTrackH(t, nT), nT),
  );
  return { ...r, minTrack, maxTrack };
}
