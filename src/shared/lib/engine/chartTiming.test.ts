import { describe, expect, it } from "vitest";
import {
  chartBeatToSecond,
  chartSecondToBeat,
  cumulativeXmodScrollPixelsAtChartSecond,
  effectiveBpmRatioForXmod,
  type ChartTimingSlice,
  XMOD_VISUAL_BPM_RATIO_MIN,
  xmodScrollPixelsBetweenChartSeconds,
} from "./chartTiming";

function legacyXmodBeatDistance(
  fromBeat: number,
  toBeat: number,
  baseBpm: number,
  multiplier: number,
  baseSpeed: number,
  bpms: { beat: number; bpm: number }[],
): number {
  const getBpm = (beat: number): number => {
    let bpm = bpms[0]?.bpm ?? baseBpm;
    for (const c of bpms) {
      if (c.beat > beat) break;
      bpm = c.bpm;
    }
    return bpm;
  };
  if (bpms.length <= 1) {
    return (
      (toBeat - fromBeat) *
      multiplier *
      baseSpeed *
      effectiveBpmRatioForXmod(getBpm(fromBeat), baseBpm)
    );
  }
  let distance = 0;
  let currentBeat = fromBeat;
  let currentBpm = getBpm(fromBeat);
  for (const change of bpms) {
    if (change.beat <= fromBeat) {
      currentBpm = change.bpm;
      continue;
    }
    if (change.beat >= toBeat) break;
    const segmentBeats = change.beat - currentBeat;
    distance +=
      segmentBeats * multiplier * baseSpeed * effectiveBpmRatioForXmod(currentBpm, baseBpm);
    currentBeat = change.beat;
    currentBpm = change.bpm;
  }
  const remainingBeats = toBeat - currentBeat;
  distance +=
    remainingBeats * multiplier * baseSpeed * effectiveBpmRatioForXmod(currentBpm, baseBpm);
  return distance;
}

describe("chartTiming X-mod scroll integration", () => {
  const baseBpm = 120;
  const mult = 1.5;
  const baseSpeed = 200;

  it("matches legacy beat-range integral when no stops (chart seconds from beatToTime)", () => {
    const t: ChartTimingSlice = {
      bpms: [
        { beat: 0, bpm: 180 },
        { beat: 4, bpm: 60 },
      ],
      stops: [],
      delays: [],
      offset: 0,
    };
    const fromBeat = 2.5;
    const toBeat = 6;
    const t0 = chartBeatToSecond(fromBeat, t);
    const t1 = chartBeatToSecond(toBeat, t);
    const byTime = xmodScrollPixelsBetweenChartSeconds(t0, t1, t, baseBpm, mult, baseSpeed);
    const byLegacy = legacyXmodBeatDistance(fromBeat, toBeat, baseBpm, mult, baseSpeed, t.bpms);
    expect(byTime).toBeCloseTo(byLegacy, 5);
  });

  it("stop adds chart time without adding X-mod pixels (same beat interval as no-stop)", () => {
    const t: ChartTimingSlice = {
      bpms: [{ beat: 0, bpm: 120 }],
      stops: [{ beat: 2, duration: 1.0 }],
      delays: [],
      offset: 0,
    };
    const tAt2 = chartBeatToSecond(2, t);
    const tAt3 = chartBeatToSecond(3, t);
    expect(tAt3 - tAt2).toBeGreaterThan(60 / 120);
    const m = 1;
    const across = xmodScrollPixelsBetweenChartSeconds(tAt2, tAt3, t, baseBpm, m, baseSpeed);
    const oneBeatPixels = m * baseSpeed * (120 / baseBpm);
    expect(across).toBeCloseTo(oneBeatPixels, 5);
    expect(chartSecondToBeat(tAt2, t)).toBeCloseTo(2, 5);
    expect(chartSecondToBeat(tAt3, t)).toBeCloseTo(3, 5);
  });

  it("floors X-mod BPM ratio when first BPM is high and a segment is extremely low", () => {
    const firstBpm = 180;
    const lowBpm = 12;
    const t: ChartTimingSlice = {
      bpms: [
        { beat: 0, bpm: firstBpm },
        { beat: 8, bpm: lowBpm },
      ],
      stops: [],
      delays: [],
      offset: 0,
    };
    const baseBpm = firstBpm;
    const t8 = chartBeatToSecond(8, t);
    const t9 = chartBeatToSecond(9, t);
    const across = xmodScrollPixelsBetweenChartSeconds(t8, t9, t, baseBpm, 1, baseSpeed);
    const rawRatio = lowBpm / baseBpm;
    expect(rawRatio).toBeLessThan(XMOD_VISUAL_BPM_RATIO_MIN);
    expect(effectiveBpmRatioForXmod(lowBpm, baseBpm)).toBe(XMOD_VISUAL_BPM_RATIO_MIN);
    const expected = 1 * baseSpeed * XMOD_VISUAL_BPM_RATIO_MIN;
    expect(across).toBeCloseTo(expected, 5);
    const unclampedOneBeat = 1 * baseSpeed * rawRatio;
    expect(across).toBeGreaterThan(unclampedOneBeat * 1.5);
  });

  it("cumulative is zero at chart time origin and additive", () => {
    const t: ChartTimingSlice = {
      bpms: [{ beat: 0, bpm: 120 }],
      stops: [],
      delays: [],
      offset: 0.25,
    };
    const tOrigin = -t.offset;
    expect(cumulativeXmodScrollPixelsAtChartSecond(tOrigin, t, baseBpm, 1, baseSpeed)).toBe(0);
    const a = cumulativeXmodScrollPixelsAtChartSecond(0.5, t, baseBpm, 1, baseSpeed);
    const b = cumulativeXmodScrollPixelsAtChartSecond(1.0, t, baseBpm, 1, baseSpeed);
    expect(xmodScrollPixelsBetweenChartSeconds(0.5, 1.0, t, baseBpm, 1, baseSpeed)).toBeCloseTo(b - a, 5);
  });
});
