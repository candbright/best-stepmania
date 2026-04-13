import { invoke } from "./core";

export interface ScoringTimingWindows {
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  w5: number;
  mine: number;
  hold: number;
  roll: number;
}

export interface ScoringDpWeights {
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  w5: number;
  miss: number;
  held: number;
  letGo: number;
  hitMine: number;
}

export interface ScoringLifeDeltaSet {
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  w5: number;
  miss: number;
}

export interface ScoringGradeThresholds {
  /** Min DP ratio (0–1) for SSS */
  minSss: number;
  ss: number;
  s: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface ScoringConfig {
  timingWindows: ScoringTimingWindows;
  missWindow: number;
  dpWeights: ScoringDpWeights;
  lifeDeltas: {
    bar: ScoringLifeDeltaSet;
    survival: ScoringLifeDeltaSet;
    battery: ScoringLifeDeltaSet;
  };
  gradeThresholds: ScoringGradeThresholds;
}

export async function getScoringConfig(): Promise<ScoringConfig> {
  return invoke<ScoringConfig>("get_scoring_config");
}
