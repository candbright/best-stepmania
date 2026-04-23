import type { NoteSkinSnapshot } from "@/shared/api";
import { logWarn } from "@/shared/lib/devLog";

export interface ChartNote {
  row: number;
  beat: number;
  second: number;
  track: number;
  noteType: string;
  holdEndRow: number | null;
  holdEndSecond: number | null;
  /** Pump-routine: 1 = `&` 前图层，2 = `&` 后图层；缺省则按轨道/面板回退着色 */
  routineLayer?: 1 | 2 | null;
}

export interface ChartNoteInput {
  track: number;
  noteType: string;
  holdEndRow: number | null;
  holdEndSecond?: number | null;
  routineLayer?: 1 | 2 | null;
}

export interface ChartNoteRow {
  row: number;
  beat: number;
  second: number;
  notes: ChartNoteInput[];
}

export type JudgmentType =
  | "W1"
  | "W2"
  | "W3"
  | "W4"
  | "W5"
  | "Miss";

export interface JudgmentEvent {
  judgment: JudgmentType;
  offset: number;
  track: number;
  noteRow: number;
  time: number;
  player: 1 | 2;
}

export interface HoldState {
  track: number;
  startRow: number;
  endRow: number;
  endSecond: number;
  active: boolean;
  /** 首键判定已失败（Miss/W5/超窗），用于保持长条可见并灰显。 */
  headMissed: boolean;
  held: boolean;
  finished: boolean;
  /** Roll 音符需要反复敲击（区别于 Hold 需要持续按住） */
  isRoll: boolean;
  /** Roll：上次记录 tick 的时间（用于判定连续敲击） */
  lastRollTick: number;
  /** Hold：中途松键，长条变暗，可重新按住恢复；恢复后若持续到尾键判定成功仍算 held */
  letGo: boolean;
  /** 长条分段结算游标（按长度多次计分）。 */
  nextCheckpointSecond: number;
  checkpointInterval: number;
  /** 非高手模式：中途松手后的自动续联宽限区间（秒）。 */
  graceUntilSecond: number | null;
}

export interface ScoreState {
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  w5: number;
  miss: number;
  held: number;
  letGo: number;
  minesHit: number;
  combo: number;
  maxCombo: number;
  dancePoints: number;
  maxPossibleDp: number;
  life: number;
  failed: boolean;
}

/** Same three values as session `playMode`; JudgmentSystem uses this (not only coopMode) for P1/P2 note ownership. */
export type GameSessionPlayMode = "pump-single" | "pump-double" | "pump-routine";

export interface GameConfig {
  audioOffset: number;
  judgmentStyle: "ddr" | "itg";
  showOffset: boolean;
  lifeType: "bar" | "battery" | "survival";
  autoPlay: boolean;
  expertModeEnabled: boolean;
  numTracks: number;
  playbackRate: number;
  batteryLives: number;
  showParticles: boolean;
  coopMode: CoopMode;
  /** Routine '&' charts only; pump-double is always single-player ownership (all lanes = P1). */
  sessionPlayMode: GameSessionPlayMode;
  playerConfigs: [PerPlayerConfig, PerPlayerConfig];
  /**
   * When true, the run only fails once every active player’s life is exhausted
   * (dual-player wide / double / co-op). When false, only player 1’s life gates failure (single-player).
   */
  requireBothFailedForGameOver: boolean;
}

export type CoopMode = "solo" | "co-op" | "double";

export interface PanelConfig {
  numTracks: number;
  x: number;
  width: number;
  receptorY: number;
  player: 1 | 2;
  reverse: boolean;
  noteScale: number;
  speedMod: string;
  skinConfig?: NoteSkinSnapshot | null;
  startTrack: number;
}

export interface PerPlayerConfig {
  speedMod: string;
  reverse: boolean;
  mirror: boolean;
  sudden: boolean;
  hidden: boolean;
  rotate: boolean;
  noteskin: string;
  noteStyle: "default" | "neon" | "retro" | "tetris" | "cyberpunk" | "mechanical" | "musical";
  audioOffset: number;
  noteScale: number;
}

// --- Scoring constants (loaded from Rust backend at startup via getScoringConfig) ---
// These serve as defaults and are overwritten by initScoringConfig().
// The Rust sm-score crate is the single source of truth.

// Private — only mutated by initScoringConfig(); read via captureCurrentScoringConfig()
/** Mirrors `sm_score::TimingWindows::default()`; extended with mine/hold/roll for JudgmentSystem. */
let TIMING_WINDOWS = {
  W1: 0.0225,
  W2: 0.045,
  W3: 0.090,
  W4: 0.135,
  W5: 0.180,
  mine: 0.09,
  hold: 0.25,
  roll: 0.5,
};

let MISS_WINDOW = 0.180;

/** Mirrors `sm_score::ScoreWeights::default().dp` (W1–W5 + Miss). */
let DP_WEIGHTS: Record<JudgmentType, number> = {
  W1: 2,
  W2: 2,
  W3: 1,
  W4: 0,
  W5: 0,
  Miss: 0,
};

let HOLD_DP_WEIGHTS = {
  held: 6,
  letGo: 0,
  hitMine: -8,
};

let LIFE_DELTAS: Record<string, Record<JudgmentType | 'mine', number>> = {
  bar:      { W1: 0.008, W2: 0.008, W3: 0.004, W4: 0, W5: -0.04, Miss: -0.08, mine: -0.04 },
  survival: { W1: 0.004, W2: 0.004, W3: 0.002, W4: 0, W5: -0.06, Miss: -0.12, mine: -0.06 },
  battery:  { W1: 0,     W2: 0,     W3: 0,     W4: 0, W5: 0,     Miss: 0,     mine: 0     },
};

let GRADE_THRESHOLDS = {
  minSss: 1.0,
  ss: 0.93,
  s: 0.8,
  a: 0.65,
  b: 0.45,
  c: 0.2,
  d: 0.0001,
};

// Promise singleton — prevents concurrent double-init
let _scoringConfigPromise: Promise<void> | null = null;

async function _doInitScoringConfig(): Promise<void> {
  try {
    const { getScoringConfig } = await import("@/shared/api/scoring");
    const cfg = await getScoringConfig();

    TIMING_WINDOWS = {
      W1: cfg.timingWindows.w1,
      W2: cfg.timingWindows.w2,
      W3: cfg.timingWindows.w3,
      W4: cfg.timingWindows.w4,
      W5: cfg.timingWindows.w5,
      mine: cfg.timingWindows.mine,
      hold: cfg.timingWindows.hold,
      roll: cfg.timingWindows.roll,
    };
    MISS_WINDOW = cfg.missWindow;

    DP_WEIGHTS = {
      W1: cfg.dpWeights.w1,
      W2: cfg.dpWeights.w2,
      W3: cfg.dpWeights.w3,
      W4: cfg.dpWeights.w4,
      W5: cfg.dpWeights.w5,
      Miss: cfg.dpWeights.miss,
    };

    HOLD_DP_WEIGHTS = {
      held: cfg.dpWeights.held ?? 6,
      letGo: cfg.dpWeights.letGo ?? 0,
      hitMine: cfg.dpWeights.hitMine ?? -8,
    };

    const mapDeltas = (d: typeof cfg.lifeDeltas.bar): Record<JudgmentType | 'mine', number> => ({
      W1: d.w1, W2: d.w2, W3: d.w3, W4: d.w4, W5: d.w5, Miss: d.miss, mine: d.mine,
    });
    LIFE_DELTAS = {
      bar: mapDeltas(cfg.lifeDeltas.bar),
      survival: mapDeltas(cfg.lifeDeltas.survival),
      battery: mapDeltas(cfg.lifeDeltas.battery),
    };

    GRADE_THRESHOLDS = cfg.gradeThresholds;
  } catch (e: unknown) {
    logWarn("ScoringConfig", "Failed to load from backend, using defaults:", e);
  }
}

/**
 * Initialize scoring constants from the Rust backend.
 * Safe to call concurrently — only the first call triggers the IPC fetch;
 * all subsequent callers await the same in-flight promise.
 */
export function initScoringConfig(): Promise<void> {
  if (!_scoringConfigPromise) {
    _scoringConfigPromise = _doInitScoringConfig();
  }
  return _scoringConfigPromise;
}

// ---------------------------------------------------------------------------
// ScoringSnapshot — immutable capture of the scoring constants for a single
// game session.  JudgmentSystem takes one at construction time so it is immune
// to hot-reload or config-reload races that could otherwise mutate module-level
// mutable `let` variables mid-game.
// ---------------------------------------------------------------------------

export interface ScoringSnapshot {
  timingWindows: {
    W1: number;
    W2: number;
    W3: number;
    W4: number;
    W5: number;
    mine: number;
    hold: number;
    roll: number;
  };
  missWindow: number;
  dpWeights: Record<JudgmentType, number>;
  /** DP weights for hold/roll tails and mines (from backend ScoreWeights). */
  holdDpWeights: { held: number; letGo: number; hitMine: number };
  /**
   * Per life-bar mode, per-judgment life deltas.
   * Keyed by lifeType: "bar" | "survival" | "battery".
   * Each entry also has a `mine` key for the mine-hit life drain.
   */
  lifeDeltas: Record<string, Record<JudgmentType | 'mine', number>>;
  gradeThresholds: {
    minSss: number;
    ss: number;
    s: number;
    a: number;
    b: number;
    c: number;
    d: number;
  };
}

/**
 * Capture a deep-cloned snapshot of the current module-level scoring constants.
 * Call this once when constructing JudgmentSystem (or GameEngine.loadChart).
 */
export function captureCurrentScoringConfig(): ScoringSnapshot {
  return {
    timingWindows: { ...TIMING_WINDOWS },
    missWindow: MISS_WINDOW,
    dpWeights: { ...DP_WEIGHTS },
    holdDpWeights: { ...HOLD_DP_WEIGHTS },
    lifeDeltas: Object.fromEntries(
      Object.entries(LIFE_DELTAS).map(([k, v]) => [k, { ...v }])
    ),
    gradeThresholds: { ...GRADE_THRESHOLDS },
  };
}

// ---------------------------------------------------------------------------
// LastResults — the result object written to game store after a session ends.
// Centralised here to avoid the inline anonymous type repeated across stores.
// ---------------------------------------------------------------------------

/**
 * Normalize a stored DP ratio for UI (0–100, capped).
 * Accepts canonical **0–1** `dpPercent`; also tolerates values already in **0–100** or **×100** (如 HUD 用 9234 表示 92.34%).
 */
export function displayPercentFromDpRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  if (ratio <= 0) return 0;
  if (ratio <= 1) return Math.min(100, ratio * 100);
  if (ratio <= 100) return Math.min(100, ratio);
  if (ratio <= 100_000) return Math.min(100, ratio / 100);
  return 100;
}

export interface PerfState {
  qualityLevel: string;
  frameMs: number;
  particles: number;
}

export interface NoteFieldExposed {
  showJudgment: (text: string, color: string, track?: number) => void;
  getPerfState: () => PerfState;
}

export interface LastResults {
  grade: string;
  dpPercent: number;
  /** 与 `saveScore` /游玩 HUD 一致：`round(dpPercent * 10000)`，范围约 0–10000。 */
  score: number;
  maxCombo: number;
  w1: number; w2: number; w3: number; w4: number; w5: number; miss: number;
  held: number; letGo: number; minesHit: number;
  fullCombo: boolean;
  offsets: number[];
}

export interface ReplayInputEvent {
  deltaMs: number;
  track: 0;
  action: 3;
  keyMask: number;
}

// ---------------------------------------------------------------------------
// Timing Segments - StepMania-compatible timing data
// Reference: E:\Projects\stepmania\src\TimingSegments.h
// ---------------------------------------------------------------------------

/** Base interface for all timing segments */
export interface TimingSegmentBase {
  row: number;    // Internal row position (48 rows per beat)
  beat: number;   // User-friendly beat position
}

/** Time signature change */
export interface TimeSignatureSegment extends TimingSegmentBase {
  type: "timeSignature";
  numerator: number;   // Beats per measure (e.g., 4)
  denominator: number; // Note value per beat (e.g., 4 = quarter note)
}

/** Tick count (hold note checkpoints) */
export interface TickcountSegment extends TimingSegmentBase {
  type: "tickcount";
  ticksPerBeat: number; // Number of checkpoints per beat
}

/** Combo multiplier change */
export interface ComboSegment extends TimingSegmentBase {
  type: "combo";
  combo: number;     // Combo value at this point
  missCombo: number;  // Miss combo at this point
}

/** Speed change */
export interface SpeedSegment extends TimingSegmentBase {
  type: "speed";
  ratio: number;   // Speed multiplier (1.0 = normal)
  delay: number;   // Delay before applying (in beats or seconds)
  unit: 0 | 1;     // 0 = beats, 1 = seconds
}

/** Scroll multiplier */
export interface ScrollSegment extends TimingSegmentBase {
  type: "scroll";
  ratio: number; // Scroll multiplier (1.0 = normal)
}

/** Label/bookmark */
export interface LabelSegment extends TimingSegmentBase {
  type: "label";
  label: string; // Label text (e.g., "Song Start", "Hook")
}

export type TimingSegment =
  | TimeSignatureSegment
  | TickcountSegment
  | ComboSegment
  | SpeedSegment
  | ScrollSegment
  | LabelSegment;

export interface TimingData {
  timeSignatures: TimeSignatureSegment[];
  tickcounts: TickcountSegment[];
  combos: ComboSegment[];
  speeds: SpeedSegment[];
  scrolls: ScrollSegment[];
  labels: LabelSegment[];
}

// Default values matching StepMania's TidyUpData
export const DEFAULT_TIMING_DATA: TimingData = {
  timeSignatures: [{ type: "timeSignature", row: 0, beat: 0, numerator: 4, denominator: 4 }],
  tickcounts: [{ type: "tickcount", row: 0, beat: 0, ticksPerBeat: 4 }],
  combos: [{ type: "combo", row: 0, beat: 0, combo: 1, missCombo: 1 }],
  speeds: [{ type: "speed", row: 0, beat: 0, ratio: 1.0, delay: 0, unit: 0 }],
  scrolls: [{ type: "scroll", row: 0, beat: 0, ratio: 1.0 }],
  labels: [{ type: "label", row: 0, beat: 0, label: "Song Start" }],
};

// Rows per beat (matches StepMania's ROWS_PER_BEAT)
export const ROWS_PER_BEAT = 48;
