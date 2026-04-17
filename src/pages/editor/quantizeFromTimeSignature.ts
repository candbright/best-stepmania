/**
 * Default beat quantize from chart time signature (SSC #TIMESIGNATURES / SM #TIMESIGNATURES).
 * Editor snap uses step = 4/quantize beats; quantize value 4 matches UI label "1/4" for X/4 time.
 */

export const EDITOR_QUANTIZE_VALUES = [
  3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 192,
] as const;

export type EditorQuantizeValue = (typeof EDITOR_QUANTIZE_VALUES)[number];

export interface TimeSigLike {
  beat: number;
  numerator: number;
  denominator: number;
}

/** Time signature active at `beat` (any order; if all changes are after `beat`, uses 4/4). */
export function timeSignatureAtBeat(
  sigs: readonly TimeSigLike[],
  beat: number,
): TimeSigLike {
  const fallback: TimeSigLike = { beat: 0, numerator: 4, denominator: 4 };
  if (sigs.length === 0) return fallback;
  const sorted = [...sigs].sort((a, b) => a.beat - b.beat);
  let active = fallback;
  for (const s of sorted) {
    if (s.beat <= beat + 1e-6) active = s;
    else break;
  }
  return active;
}

/** Pick default editor quantize from denominator (e.g. 4/4 → 4). */
export function defaultQuantizeFromTimeSignatures(
  sigs: readonly TimeSigLike[],
  atBeat = 0,
): EditorQuantizeValue {
  const { denominator } = timeSignatureAtBeat(sigs, atBeat);
  const d = Math.max(1, Math.min(192, Math.round(denominator)));
  const allowed = EDITOR_QUANTIZE_VALUES as readonly number[];
  if (allowed.includes(d)) return d as EditorQuantizeValue;
  return allowed.reduce((best, q) =>
    Math.abs(q - d) < Math.abs(best - d) ? q : best,
  ) as EditorQuantizeValue;
}
