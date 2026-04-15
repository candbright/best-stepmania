export interface BpmPoint {
  beat: number;
  bpm: number;
}

export interface BpmTimingCache {
  /** Sorted beats of BPM changes (same length as `bpms`). */
  beats: Float64Array;
  /** BPM values per segment start. */
  bpms: Float64Array;
  /** Cumulative seconds at each segment start beat (seconds at `beats[i]`). */
  secAtBeat: Float64Array;
  /** First segment BPM (used for negative extrapolation). */
  bpm0: number;
}

function clampFiniteNumber(x: number, fallback: number): number {
  return Number.isFinite(x) ? x : fallback;
}

function upperBound(arr: Float64Array, x: number): number {
  // First index i where arr[i] > x
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Build a fast beat<->second cache from BPM changes.
 *
 * Assumptions:
 * - `changes` are already sorted by beat ascending (callers typically keep it sorted).
 * - If empty, uses a single segment at beat 0 with fallback BPM.
 */
export function buildBpmTimingCache(changes: readonly BpmPoint[], fallbackBpm: number): BpmTimingCache {
  const fb = clampFiniteNumber(fallbackBpm, 120);

  const n = Math.max(1, changes.length);
  const beats = new Float64Array(n);
  const bpms = new Float64Array(n);
  const secAtBeat = new Float64Array(n);

  if (changes.length === 0) {
    beats[0] = 0;
    bpms[0] = fb;
    secAtBeat[0] = 0;
    return { beats, bpms, secAtBeat, bpm0: fb };
  }

  // Normalize first segment.
  beats[0] = clampFiniteNumber(changes[0]!.beat, 0);
  bpms[0] = clampFiniteNumber(changes[0]!.bpm, fb);
  secAtBeat[0] = 0;

  for (let i = 1; i < n; i++) {
    const prevBeat = beats[i - 1]!;
    const prevBpm = bpms[i - 1]!;
    const b = clampFiniteNumber(changes[i]!.beat, prevBeat);
    const bpm = clampFiniteNumber(changes[i]!.bpm, prevBpm);
    beats[i] = b;
    bpms[i] = bpm;
    const dBeat = Math.max(0, b - prevBeat);
    secAtBeat[i] = secAtBeat[i - 1]! + (dBeat * 60) / Math.max(1e-9, prevBpm);
  }

  return { beats, bpms, secAtBeat, bpm0: bpms[0]! };
}

/**
 * Convert beat -> seconds, using the cache.
 * Extrapolates for negative beats using the first BPM segment.
 */
export function beatToSecondCached(beat: number, cache: BpmTimingCache): number {
  const b = clampFiniteNumber(beat, 0);
  if (b < cache.beats[0]!) {
    // Extrapolate backwards from first segment start.
    const bpm = Math.max(1e-9, cache.bpm0);
    const db = b - cache.beats[0]!;
    return cache.secAtBeat[0]! + (db * 60) / bpm;
  }

  const i = upperBound(cache.beats, b) - 1;
  const idx = Math.max(0, Math.min(cache.beats.length - 1, i));
  const segBeat = cache.beats[idx]!;
  const segBpm = Math.max(1e-9, cache.bpms[idx]!);
  const baseSec = cache.secAtBeat[idx]!;
  return baseSec + ((b - segBeat) * 60) / segBpm;
}

/**
 * Convert seconds -> beat, using the cache.
 * Extrapolates before the first segment using the first BPM segment.
 */
export function secondToBeatCached(second: number, cache: BpmTimingCache): number {
  const s = clampFiniteNumber(second, 0);
  if (s <= cache.secAtBeat[0]!) {
    const bpm = Math.max(1e-9, cache.bpm0);
    const ds = s - cache.secAtBeat[0]!;
    return cache.beats[0]! + (ds * bpm) / 60;
  }

  // Find segment whose start time is <= s.
  const i = upperBound(cache.secAtBeat, s) - 1;
  const idx = Math.max(0, Math.min(cache.secAtBeat.length - 1, i));
  const segBeat = cache.beats[idx]!;
  const segBpm = Math.max(1e-9, cache.bpms[idx]!);
  const baseSec = cache.secAtBeat[idx]!;
  return segBeat + ((s - baseSec) * segBpm) / 60;
}

