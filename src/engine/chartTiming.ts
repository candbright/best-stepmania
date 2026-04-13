/**
 * Mirrors `sm_timing::TimingData::beat_to_second` / `second_to_beat` so gameplay scroll
 * uses the same chart timeline as `get_chart_notes` (`row.second`).
 */

export interface ChartTimingSlice {
  bpms: { beat: number; bpm: number }[];
  stops: { beat: number; duration: number }[];
  delays: { beat: number; duration: number }[];
  offset: number;
}

export function chartBeatToSecond(targetBeat: number, t: ChartTimingSlice): number {
  if (t.bpms.length === 0) return 0;

  let time = -t.offset;
  let currentBeat = 0;
  let currentBpm = t.bpms[0].bpm;

  for (let i = 0; i < t.bpms.length; i++) {
    const segBeat = t.bpms[i].beat;
    const nextBeat =
      i + 1 < t.bpms.length ? Math.min(t.bpms[i + 1].beat, targetBeat) : targetBeat;

    if (currentBeat >= targetBeat) break;

    const start = Math.max(currentBeat, segBeat);
    const end = Math.min(nextBeat, targetBeat);
    if (end > start) {
      time += ((end - start) * 60) / currentBpm;
    }

    if (i + 1 < t.bpms.length && nextBeat >= t.bpms[i + 1].beat) {
      currentBpm = t.bpms[i + 1].bpm;
    }
    currentBeat = nextBeat;
  }

  if (currentBeat < targetBeat) {
    time += ((targetBeat - currentBeat) * 60) / currentBpm;
  }

  for (const stop of t.stops) {
    if (stop.beat < targetBeat) {
      time += stop.duration;
    }
  }
  for (const delay of t.delays) {
    if (delay.beat <= targetBeat) {
      time += delay.duration;
    }
  }

  return time;
}

/**
 * Inverse timeline: seconds since chart t=0 (same space as `chartBeatToSecond` / `note.second`).
 */
export function chartSecondToBeat(targetSecond: number, t: ChartTimingSlice): number {
  if (t.bpms.length === 0) return 0;

  let time = -t.offset;
  let beat = 0;
  let bpmIdx = 0;
  let currentBpm = t.bpms[0].bpm;
  let stopIdx = 0;
  let delayIdx = 0;

  for (;;) {
    if (time >= targetSecond) break;

    const nextBpmBeat =
      bpmIdx + 1 < t.bpms.length ? t.bpms[bpmIdx + 1].beat : undefined;
    const nextStopBeat = stopIdx < t.stops.length ? t.stops[stopIdx].beat : undefined;
    const nextDelayBeat = delayIdx < t.delays.length ? t.delays[delayIdx].beat : undefined;

    const candidates = [nextBpmBeat, nextStopBeat, nextDelayBeat].filter(
      (x): x is number => x !== undefined,
    );
    const nextEventBeat = candidates.length === 0 ? Infinity : Math.min(...candidates);

    if (nextEventBeat === Infinity) {
      const remaining = targetSecond - time;
      beat += (remaining * currentBpm) / 60;
      break;
    }

    const beatDelta = nextEventBeat - beat;
    const timeDelta = (beatDelta * 60) / currentBpm;

    if (time + timeDelta >= targetSecond) {
      const remaining = targetSecond - time;
      beat += (remaining * currentBpm) / 60;
      break;
    }

    time += timeDelta;
    beat = nextEventBeat;

    if (nextBpmBeat === nextEventBeat) {
      bpmIdx += 1;
      currentBpm = t.bpms[bpmIdx].bpm;
    }
    if (nextStopBeat === nextEventBeat) {
      const stopDur = t.stops[stopIdx].duration;
      if (time + stopDur >= targetSecond) break;
      time += stopDur;
      stopIdx += 1;
    }
    if (nextDelayBeat === nextEventBeat) {
      const delayDur = t.delays[delayIdx].duration;
      if (time + delayDur >= targetSecond) break;
      time += delayDur;
      delayIdx += 1;
    }
  }

  return beat;
}

/** Chart second at beat 0 (same space as {@link chartSecondToBeat} / `note.second`). */
export function chartTimeAtBeatZero(t: ChartTimingSlice): number {
  return chartBeatToSecond(0, t);
}

/**
 * Like {@link chartSecondToBeat} but extrapolates before beat 0 using the first BPM segment.
 */
export function chartSecondToBeatExtrapolated(targetSecond: number, t: ChartTimingSlice): number {
  if (t.bpms.length === 0) {
    return (targetSecond * 120) / 60;
  }
  const t0 = chartTimeAtBeatZero(t);
  const bpm0 = t.bpms[0].bpm;
  if (targetSecond < t0) {
    return ((targetSecond - t0) * bpm0) / 60;
  }
  return chartSecondToBeat(targetSecond, t);
}

/**
 * Like {@link chartBeatToSecond} but extrapolates for negative beats using the first BPM segment.
 */
export function chartBeatToSecondExtrapolated(targetBeat: number, t: ChartTimingSlice): number {
  if (targetBeat >= 0) {
    return chartBeatToSecond(targetBeat, t);
  }
  if (t.bpms.length === 0) {
    return (targetBeat * 60) / 120;
  }
  const t0 = chartTimeAtBeatZero(t);
  const bpm0 = t.bpms[0].bpm;
  return t0 + (targetBeat * 60) / bpm0;
}
