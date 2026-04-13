/**
 * Timing Segment Parser
 * 
 * Parses StepMania-compatible timing segments from SM/SSC files.
 * Reference: E:\Projects\stepmania\src\NotesLoaderSM.cpp, NotesLoaderSSC.cpp
 * 
 * Format summary:
 * - #TIMESIGNATURES:beat=numerator=denominator; (e.g., "0.000=4=4")
 * - #TICKCOUNTS:beat=ticks; (e.g., "0.000=4")
 * - #COMBOS:beat=combo; or beat=combo=miss_combo; (e.g., "0.000=1" or "16.000=2=1")
 * - #SPEEDS:beat=ratio=delay=unit; (e.g., "0.000=1.000=0.000=0")
 * - #SCROLLS:beat=ratio; (e.g., "0.000=1.000")
 * - #LABELS:beat=label; (e.g., "0.000=Song Start")
 */

import type {
  TimeSignatureSegment,
  TickcountSegment,
  ComboSegment,
  SpeedSegment,
  ScrollSegment,
  LabelSegment,
  TimingSegment,
  TimingData,
} from "@/engine/types";
import { ROWS_PER_BEAT, DEFAULT_TIMING_DATA } from "@/engine/types";

/** Convert beat to row (internal storage) */
function beatToRow(beat: number): number {
  return Math.round(beat * ROWS_PER_BEAT);
}

/** Convert row to beat (user-facing display) */
export function rowToBeat(row: number): number {
  return row / ROWS_PER_BEAT;
}

/** Parse a comma-separated list of timing segments */
function parseSegmentList<T extends TimingSegment>(
  line: string,
  parser: (parts: string[], beat: number) => T | null
): T[] {
  if (!line.trim()) return [];
  
  const result: T[] = [];
  const entries = line.split(",");
  
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    
    // Format: beat=value1=value2=...
    const parts = trimmed.split("=");
    if (parts.length < 2) continue;
    
    const beat = parseFloat(parts[0]);
    if (isNaN(beat)) continue;
    
    const segment = parser(parts, beat);
    if (segment) {
      result.push(segment);
    }
  }
  
  return result;
}

/** Parse #TIMESIGNATURES:beat=numerator=denominator; */
export function parseTimeSignatures(line: string): TimeSignatureSegment[] {
  return parseSegmentList(line, (parts, beat) => {
    if (parts.length < 3) return null;
    const numerator = parseInt(parts[1], 10);
    const denominator = parseInt(parts[2], 10);
    if (isNaN(numerator) || isNaN(denominator)) return null;
    return {
      type: "timeSignature",
      row: beatToRow(beat),
      beat,
      numerator,
      denominator,
    };
  });
}

/** Parse #TICKCOUNTS:beat=ticks; */
export function parseTickcounts(line: string): TickcountSegment[] {
  return parseSegmentList(line, (parts, beat) => {
    if (parts.length < 2) return null;
    const ticks = parseInt(parts[1], 10);
    if (isNaN(ticks)) return null;
    return {
      type: "tickcount",
      row: beatToRow(beat),
      beat,
      ticksPerBeat: Math.max(0, Math.min(ticks, ROWS_PER_BEAT)),
    };
  });
}

/** Parse #COMBOS:beat=combo; or beat=combo=miss_combo; */
export function parseCombos(line: string): ComboSegment[] {
  return parseSegmentList(line, (parts, beat) => {
    if (parts.length < 2) return null;
    const combo = parseInt(parts[1], 10);
    if (isNaN(combo)) return null;
    const missCombo = parts.length >= 3 ? parseInt(parts[2], 10) : combo;
    return {
      type: "combo",
      row: beatToRow(beat),
      beat,
      combo,
      missCombo: isNaN(missCombo) ? combo : missCombo,
    };
  });
}

/** Parse #SPEEDS:beat=ratio=delay=unit; */
export function parseSpeeds(line: string): SpeedSegment[] {
  return parseSegmentList(line, (parts, beat) => {
    if (parts.length < 2) return null;
    const ratio = parseFloat(parts[1]);
    if (isNaN(ratio)) return null;
    const delay = parts.length >= 3 ? parseFloat(parts[2]) : 0;
    const unit = parts.length >= 4 ? (parseInt(parts[3], 10) as 0 | 1) : 0;
    return {
      type: "speed",
      row: beatToRow(beat),
      beat,
      ratio,
      delay: isNaN(delay) ? 0 : delay,
      unit: (unit === 1 ? 1 : 0) as 0 | 1,
    };
  });
}

/** Parse #SCROLLS:beat=ratio; */
export function parseScrolls(line: string): ScrollSegment[] {
  return parseSegmentList(line, (parts, beat) => {
    if (parts.length < 2) return null;
    const ratio = parseFloat(parts[1]);
    if (isNaN(ratio)) return null;
    return {
      type: "scroll",
      row: beatToRow(beat),
      beat,
      ratio,
    };
  });
}

/** Parse #LABELS:beat=label; */
export function parseLabels(line: string): LabelSegment[] {
  return parseSegmentList(line, (parts, beat) => {
    if (parts.length < 2) return null;
    const label = parts.slice(1).join("=").trim();
    return {
      type: "label",
      row: beatToRow(beat),
      beat,
      label,
    };
  });
}

/** Parse all timing segments from raw SM/SSC lines */
export function parseTimingData(raw: {
  timesignatures?: string;
  tickcounts?: string;
  combos?: string;
  speeds?: string;
  scrolls?: string;
  labels?: string;
}): TimingData {
  const result: TimingData = {
    timeSignatures: [],
    tickcounts: [],
    combos: [],
    speeds: [],
    scrolls: [],
    labels: [],
  };
  
  if (raw.timesignatures) {
    result.timeSignatures = parseTimeSignatures(raw.timesignatures);
  }
  if (raw.tickcounts) {
    result.tickcounts = parseTickcounts(raw.tickcounts);
  }
  if (raw.combos) {
    result.combos = parseCombos(raw.combos);
  }
  if (raw.speeds) {
    result.speeds = parseSpeeds(raw.speeds);
  }
  if (raw.scrolls) {
    result.scrolls = parseScrolls(raw.scrolls);
  }
  if (raw.labels) {
    result.labels = parseLabels(raw.labels);
  }
  
  // Apply defaults for missing segments (matching StepMania's TidyUpData)
  if (result.timeSignatures.length === 0) {
    result.timeSignatures = [...DEFAULT_TIMING_DATA.timeSignatures];
  }
  if (result.tickcounts.length === 0) {
    result.tickcounts = [...DEFAULT_TIMING_DATA.tickcounts];
  }
  if (result.combos.length === 0) {
    result.combos = [...DEFAULT_TIMING_DATA.combos];
  }
  if (result.speeds.length === 0) {
    result.speeds = [...DEFAULT_TIMING_DATA.speeds];
  }
  if (result.scrolls.length === 0) {
    result.scrolls = [...DEFAULT_TIMING_DATA.scrolls];
  }
  if (result.labels.length === 0) {
    result.labels = [...DEFAULT_TIMING_DATA.labels];
  }
  
  // Sort all segments by row
  const sortByRow = <T extends { row: number }>(arr: T[]): T[] =>
    arr.sort((a, b) => a.row - b.row);
  
  result.timeSignatures = sortByRow(result.timeSignatures);
  result.tickcounts = sortByRow(result.tickcounts);
  result.combos = sortByRow(result.combos);
  result.speeds = sortByRow(result.speeds);
  result.scrolls = sortByRow(result.scrolls);
  result.labels = sortByRow(result.labels);
  
  return result;
}

/** Get the segment active at a given row */
export function getSegmentAtRow<T extends TimingSegment>(
  segments: T[],
  row: number
): T | null {
  if (segments.length === 0) return null;
  
  let result: T | null = null;
  for (const seg of segments) {
    if (seg.row <= row) {
      result = seg;
    } else {
      break;
    }
  }
  return result;
}

/** Get time signature at row */
export function getTimeSignatureAtRow(
  timeSignatures: TimeSignatureSegment[],
  row: number
): TimeSignatureSegment {
  return getSegmentAtRow(timeSignatures, row) ?? DEFAULT_TIMING_DATA.timeSignatures[0];
}

/** Get tick count at row */
export function getTickcountAtRow(
  tickcounts: TickcountSegment[],
  row: number
): TickcountSegment {
  return getSegmentAtRow(tickcounts, row) ?? DEFAULT_TIMING_DATA.tickcounts[0];
}

/** Get combo at row */
export function getComboAtRow(
  combos: ComboSegment[],
  row: number
): ComboSegment {
  return getSegmentAtRow(combos, row) ?? DEFAULT_TIMING_DATA.combos[0];
}

/** Get speed at row */
export function getSpeedAtRow(
  speeds: SpeedSegment[],
  row: number
): SpeedSegment {
  return getSegmentAtRow(speeds, row) ?? DEFAULT_TIMING_DATA.speeds[0];
}

/** Get scroll at row */
export function getScrollAtRow(
  scrolls: ScrollSegment[],
  row: number
): ScrollSegment {
  return getSegmentAtRow(scrolls, row) ?? DEFAULT_TIMING_DATA.scrolls[0];
}

/** Get label at row */
export function getLabelAtRow(
  labels: LabelSegment[],
  row: number
): LabelSegment | null {
  return getSegmentAtRow(labels, row);
}

/** Convert timing data to SM/SSC format strings */
export function timingDataToSM(timing: TimingData): {
  timesignatures: string;
  tickcounts: string;
  combos: string;
  speeds: string;
  scrolls: string;
  labels: string;
} {
  const formatBeat = (beat: number): string => beat.toFixed(3);
  
  const timesignatures = timing.timeSignatures
    .map(ts => `${formatBeat(ts.beat)}=${ts.numerator}=${ts.denominator}`)
    .join(",");
  
  const tickcounts = timing.tickcounts
    .map(tc => `${formatBeat(tc.beat)}=${tc.ticksPerBeat}`)
    .join(",");
  
  const combos = timing.combos
    .map(c => c.combo === c.missCombo
      ? `${formatBeat(c.beat)}=${c.combo}`
      : `${formatBeat(c.beat)}=${c.combo}=${c.missCombo}`)
    .join(",");
  
  const speeds = timing.speeds
    .map(s => `${formatBeat(s.beat)}=${s.ratio.toFixed(3)}=${s.delay.toFixed(3)}=${s.unit}`)
    .join(",");
  
  const scrolls = timing.scrolls
    .map(s => `${formatBeat(s.beat)}=${s.ratio.toFixed(3)}`)
    .join(",");
  
  const labels = timing.labels
    .map(l => `${formatBeat(l.beat)}=${l.label}`)
    .join(",");
  
  return { timesignatures, tickcounts, combos, speeds, scrolls, labels };
}
