import type { ChartNote, ChartNoteRow, GameConfig, JudgmentEvent, ScoreState } from "./types";
import { logOptionalRejection } from "@/shared/lib/devLog";
import { JudgmentSystem } from "./JudgmentSystem";
import type { AudioPort } from "./ports";
import { usesSplitWidePanelLayout } from "./render/panelLayout";
import {
  chartBeatToSecondExtrapolated,
  chartSecondToBeatExtrapolated,
  type ChartTimingSlice,
} from "./chartTiming";

export type GameState =
  | "loading"
  | "countdown"
  | "playing"
  | "paused"
  | "finished"
  | "failed";

export interface BpmChange {
  beat: number;
  bpm: number;
}

export interface EngineCallbacks {
  onJudgment?: (evt: JudgmentEvent) => void;
  onMiss?: (evt: JudgmentEvent) => void;
  onComboBreak?: () => void;
  onMineHit?: (track: number) => void;
  /** Hold / roll tail scored or dropped — per-player DP changed without a tap judgment. */
  onHoldScoreTick?: () => void;
  onFinish?: (score: ScoreState) => void;
  onFail?: (score: ScoreState) => void;
  /** Fires when the judgment line reaches a beat line that has notes (before player hits them). */
  onBeatLineApproach?: (beat: number) => void;
  /** Per-lane rhythm cues when the playhead crosses a row (same idea as editor playback). */
  onRhythmLanesApproach?: (tracks: readonly number[], volumeScale: number) => void;
}

const SIMULATION_HZ = 240;
const SIMULATION_DT = 1 / SIMULATION_HZ;
const MAX_STEPS_PER_FRAME = 16;
const AUDIO_SYNC_INTERVAL_MS = 250;

/** Empty beats to scroll (no note sprites) before chart playhead 0 / audio — gameplay only; editor preview uses real chart time. */
const CHART_LEAD_MIN_EMPTY_BEATS = 8;
const CHART_LEAD_MAX_SECONDS = 14;
const CHART_LEAD_MIN_SECONDS = 0.35;
/** Start drawing approaching notes this many chart seconds before lead-in end (chart time) so rows approach from far below. */
const CHART_LEAD_EARLY_NOTE_REVEAL_CHART_SEC = 0.52;
/** After lead-in ends, cap one-frame playhead jump while audio clock attaches (seconds). */
const CHART_LEAD_POST_SYNC_MAX_JUMP_SEC = 0.05;
/** Wall-clock ms after lead-in end during which {@link CHART_LEAD_POST_SYNC_MAX_JUMP_SEC} applies. */
const CHART_LEAD_POST_SYNC_GUARD_MS = 320;
/** Fallback finish grace after audio reaches decoded duration. */
const AUDIO_END_FINISH_GRACE_SEC = 0.35;
/** Max simulation sub-steps per frame while flushing past audio end (spread across frames if chart tail is long). */
const MAX_AUDIO_END_FLUSH_STEPS = 1024;

export class GameEngine {
  public notes: ChartNote[] = [];
  public judgment: JudgmentSystem | null = null;
  public state: GameState = "loading";
  public currentSecond = 0;
  public songDuration = 0;
  public config: GameConfig;
  public keysDown: boolean[] = [];
  public callbacks: EngineCallbacks = {};
  private audioPort: AudioPort | null;

  private lastNoteSecond = 0;
  private audioLoaded = false;
  private audioOffset = 0;
  private useAudioSync = false;

  private fallbackStartTime = 0;
  private pauseTime = 0;
  private playingStartTime = 0;
  /** Wall-clock ms at which startPlaying/startPlayingFrom was called, used to guard audio sync. */
  private gameStartWallMs = 0;

  // simulation timeline
  private simulatedSecond = 0;

  // audio clock anchor model
  private audioAnchorSecond = 0;
  private audioAnchorPerfMs = 0;
  private audioSyncHandle: ReturnType<typeof setInterval> | null = null;
  private audioSyncPending = false;
  private playbackRate = 1;

  // BPM changes for scroll speed visualization
  public bpmChanges: BpmChange[] = [];
  public baseBpm: number = 120;
  /** When set, {@link beatToTime}/{@link timeToBeat} match Rust `TimingData` (same space as `note.second`). */
  private chartTiming: ChartTimingSlice | null = null;
  /** Cached beat position — refreshed once per update() tick, used by getNoteY() to avoid repeated binary search. */
  public currentBeat = 0;

  /** Blank scroll after start: chart time runs from `end - this` to `end` before audio-driven sync (seconds in `note.second` space). */
  private chartLeadInSeconds = 1.1;
  private chartLeadInActive = false;
  private chartLeadInEndSimSecond = 0;
  private chartLeadInFinishing = false;
  /** While `performance.now() < this`, clamp large upward jumps in {@link update} when using audio sync (post–lead-in attach). */
  private leadInSyncGuardUntilMs = 0;

  /** Tracks the last integer beat position checked for beat line SFX triggering. */
  private lastBeatLineSfxBeat = -1;
  /** Previous-frame chart beat for per-lane rhythm SFX (fractional; null = establish baseline). */
  private lastRhythmLaneSfxBeat: number | null = null;

  /**
   * Align rhythm-SFX cursor with the current chart clock. Without this, {@link lastBeatLineSfxBeat}
   * from a prior run can stay large and {@link checkBeatLineSfx} will never fire on a new chart/session.
   */
  private resetBeatLineSfxCursor() {
    this.currentBeat = this.computeCurrentBeatFromTiming();
    this.lastBeatLineSfxBeat = this.currentBeat;
    this.lastRhythmLaneSfxBeat = null;
  }

  private getPlayerConfig(player: 1 | 2) {
    return this.config.playerConfigs[player - 1];
  }

  private getPrimaryPlayerConfig() {
    return this.getPlayerConfig(1);
  }

  /** Keep private timeline (`this.audioOffset` seconds) aligned with `config.audioOffset` (ms). */
  private syncAudioOffsetFromConfig(): void {
    const ms = this.config.audioOffset;
    this.audioOffset = Number.isFinite(ms) ? ms / 1000 : 0;
  }

  constructor(config: GameConfig, audioPort: AudioPort | null = null) {
    if (!config || config.numTracks <= 0 || config.numTracks > 10) {
      throw new Error(`Invalid numTracks: ${config?.numTracks}`);
    }
    if (!isFinite(config.audioOffset)) {
      throw new Error(`Invalid audioOffset: ${config.audioOffset}`);
    }

    this.config = config;
    this.audioPort = audioPort;
    this.keysDown = new Array(config.numTracks).fill(false);
    this.syncAudioOffsetFromConfig();
    this.playbackRate = config.playbackRate ?? 1;
  }

  /**
   * Full chart timing from `get_bpm_changes` (offset, stops, delays). Required for scroll/judgment
   * to stay aligned with `get_chart_notes` `row.second`.
   */
  setChartTiming(slice: ChartTimingSlice | null) {
    this.chartTiming = slice;
  }

  loadChart(noteRows: ChartNoteRow[], songDuration: number) {
    this.syncAudioOffsetFromConfig();
    this.songDuration = songDuration;
    this.notes = [];

    for (const row of noteRows) {
      for (const note of row.notes) {
        let track = note.track;
        if (track >= this.config.numTracks) continue;

        // Per-player mirror: each half mirrored independently (double / routine / solo wide).
        if (usesSplitWidePanelLayout(this.config.coopMode, this.config.numTracks)) {
          const half = Math.floor(this.config.numTracks / 2);
          const p1 = this.getPlayerConfig(1);
          const p2 = this.getPlayerConfig(2);
          if (track < half && p1?.mirror) {
            track = half - 1 - track;
          } else if (track >= half && p2?.mirror) {
            track = half + (half - 1 - (track - half));
          }
        } else if (this.getPrimaryPlayerConfig()?.mirror) {
          track = this.config.numTracks - 1 - track;
        }

        let holdEndSecond: number | null = null;
        if (note.holdEndSecond != null) {
          holdEndSecond = note.holdEndSecond;
        } else if (note.holdEndRow !== null) {
          const holdEndNoteRow = noteRows.find((r) => r.row >= note.holdEndRow!);
          holdEndSecond = holdEndNoteRow?.second ?? row.second + 1;
        }

        const noteType = note.noteType;
        if (
          noteType !== "Tap" &&
          noteType !== "HoldHead" &&
          noteType !== "Roll" &&
          noteType !== "Mine" &&
          noteType !== "Lift"
        ) {
          continue;
        }

        const rl = note.routineLayer;
        this.notes.push({
          row: row.row,
          beat: row.beat,
          second: row.second,
          track,
          noteType,
          holdEndRow: note.holdEndRow,
          holdEndSecond,
          routineLayer: rl === 1 || rl === 2 ? rl : null,
        });
      }
    }

    this.notes.sort((a, b) => a.second - b.second || a.track - b.track);
    this.lastNoteSecond =
      this.notes.length > 0
        ? this.notes.reduce((max, n) => Math.max(max, n.holdEndSecond ?? n.second), 0)
        : songDuration;
    // Ensure BPM changes are sorted so hot-path loops can skip the sort
    this.bpmChanges.sort((a, b) => a.beat - b.beat);

    this.judgment = new JudgmentSystem(this.notes, this.config);
    this.chartLeadInActive = false;
    this.chartLeadInFinishing = false;
    this.leadInSyncGuardUntilMs = 0;
    // Static chart view during countdown / before startPlaying — align with chart time 0, avoid stale playhead from a prior session
    this.currentSecond = this.audioOffset;
    this.simulatedSecond = this.audioOffset;
    this.resetBeatLineSfxCursor();
    this.state = "countdown";
  }

  async loadAudio(musicPath: string): Promise<boolean> {
    if (!this.audioPort) {
      this.audioLoaded = false;
      this.useAudioSync = false;
      return false;
    }
    try {
      const info = await this.audioPort.load(musicPath);
      this.songDuration = info.duration;
      await this.audioPort.seek(0);
      this.audioLoaded = true;
      this.useAudioSync = true;
      return true;
    } catch (e: unknown) {
      console.warn("Audio load failed, using fallback timer:", e);
      this.audioLoaded = false;
      this.useAudioSync = false;
      return false;
    }
  }

  /**
   * Sync audio state from another engine sharing the same audio port,
   * WITHOUT re-seeking the audio (which would disrupt the other engine).
   * Call this after the other engine has loaded/started audio.
   */
  syncAudioStateFrom(other: GameEngine) {
    this.songDuration = other.songDuration;
    this.audioLoaded = other.audioLoaded;
    this.useAudioSync = other.useAudioSync;
    this.audioAnchorSecond = other.audioAnchorSecond;
    this.audioAnchorPerfMs = other.audioAnchorPerfMs;
  }

  async startPlaying() {
    this.syncAudioOffsetFromConfig();
    this.gameStartWallMs = performance.now();
    this.playingStartTime = performance.now();
    this.state = "playing";
    this.chartLeadInFinishing = false;
    this.leadInSyncGuardUntilMs = 0;
    this.stopAudioSync();

    const L = this.chartLeadInSeconds;
    if (L <= 1e-4) {
      this.chartLeadInActive = false;
      this.fallbackStartTime = performance.now();
      this.currentSecond = this.audioOffset;
      this.simulatedSecond = this.audioOffset;
      if (this.audioLoaded) {
        this.useAudioSync = true;
        this.audioAnchorSecond = 0;
        this.audioAnchorPerfMs = performance.now();
        await this.audioPort?.seek(0);
        await this.audioPort?.play();
        this.audioAnchorPerfMs = performance.now();
        this.startAudioSync();
      } else {
        this.useAudioSync = false;
      }
      this.resetBeatLineSfxCursor();
      return;
    }

    this.chartLeadInActive = true;
    this.chartLeadInEndSimSecond = this.audioOffset;
    this.useAudioSync = false;
    const startSim = this.audioOffset - L;
    this.simulatedSecond = startSim;
    this.currentSecond = startSim;
    // Keep fallback timeline continuous with `update()`'s targetSecond formula.
    // At start: targetSecond should equal startSim (not a delayed value), otherwise
    // blank lead-in appears much longer and can look like a black screen.
    this.fallbackStartTime =
      performance.now() - ((startSim - this.audioOffset) / this.playbackRate) * 1000;

    if (this.audioLoaded) {
      await this.audioPort?.seek(0);
    }
    this.resetBeatLineSfxCursor();
  }

  /**
   * Start playback from the given song-second with the specified lead-in.
   * Notes before (targetSecond - leadIn) are silently skipped.
   * Used when previewing from the editor's current scroll position.
   */
  async startPlayingFrom(targetSecond: number, leadInSeconds = 2.0) {
    this.syncAudioOffsetFromConfig();
    const seekTo = Math.max(0, targetSecond - leadInSeconds);
    this.gameStartWallMs = performance.now();
    this.playingStartTime = performance.now();
    this.state = "playing";
    this.chartLeadInFinishing = false;
    this.leadInSyncGuardUntilMs = 0;
    this.stopAudioSync();

    if (this.judgment) {
      this.judgment.skipBefore(targetSecond);
    }

    // Editor preview should start immediately after entering gameplay.
    // Keep only the caller-provided musical lead-in (seekTo), and skip gameplay blank lead-in.
    this.chartLeadInActive = false;
    this.currentSecond = seekTo;
    this.simulatedSecond = seekTo;
    this.fallbackStartTime = performance.now() - (seekTo / this.playbackRate) * 1000;

    if (this.audioLoaded) {
      await this.audioPort?.seek(seekTo);
      this.useAudioSync = true;
      this.audioAnchorSecond = seekTo;
      this.audioAnchorPerfMs = performance.now();
      await this.audioPort?.play();
      this.audioAnchorPerfMs = performance.now();
      this.startAudioSync();
    } else {
      this.useAudioSync = false;
    }
    this.resetBeatLineSfxCursor();
  }

  async pause() {
    if (this.state === "playing") {
      this.state = "paused";
      this.pauseTime = performance.now();
      if (this.audioLoaded) {
        await this.audioPort?.pause();
      }
      this.stopAudioSync();
    }
  }

  async resume() {
    if (this.state === "paused") {
      const pauseDuration = performance.now() - this.pauseTime;
      this.fallbackStartTime += pauseDuration;
      this.state = "playing";
      this.lastRhythmLaneSfxBeat = null;
      if (this.audioLoaded) {
        this.audioAnchorPerfMs = performance.now();
        this.audioAnchorSecond = this.simulatedSecond - this.audioOffset;
        await this.audioPort?.play();
        this.audioAnchorPerfMs = performance.now();
        this.startAudioSync();
      }
    }
  }

  private predictAudioSecond(nowMs: number): number {
    const elapsed = (nowMs - this.audioAnchorPerfMs) / 1000;
    return this.audioAnchorSecond + elapsed * this.playbackRate + this.audioOffset;
  }

  private async refreshAudioAnchor() {
    if (this.audioSyncPending || this.state !== "playing") return;
    this.audioSyncPending = true;
    try {
      const backendTime = await this.audioPort?.getTime();
      if (backendTime == null) return;

      // Guard: reject out-of-range positions (e.g., stale read from previous song)
      if (backendTime < 0 || (this.songDuration > 0 && backendTime > this.songDuration + 10)) return;

      const now = performance.now();
      const predictedRaw = this.audioAnchorSecond + (now - this.audioAnchorPerfMs) / 1000 * this.playbackRate;
      const error = backendTime - predictedRaw;

      // Within the first 800ms of play: reject large jumps that indicate a stale read
      const msSinceStart = now - this.gameStartWallMs;
      if (msSinceStart < 800 && Math.abs(error) > 0.3) return;

      if (Math.abs(error) > 0.2) {
        this.audioAnchorSecond = backendTime;
        this.audioAnchorPerfMs = now;
      } else {
        this.audioAnchorSecond += error * 0.25;
      }
    } catch {
      // ignore; fallback prediction continues
    } finally {
      this.audioSyncPending = false;
    }
  }

  private startAudioSync() {
    this.stopAudioSync();
    // Delay the first sync read to avoid stale backend positions immediately after seek+play
    setTimeout(() => {
      if (this.state === "playing") this.refreshAudioAnchor();
    }, 600);
    this.audioSyncHandle = setInterval(() => {
      this.refreshAudioAnchor();
    }, AUDIO_SYNC_INTERVAL_MS);
  }

  private stopAudioSync() {
    if (this.audioSyncHandle !== null) {
      clearInterval(this.audioSyncHandle);
      this.audioSyncHandle = null;
    }
  }

  private async finishChartLeadInAsync(): Promise<void> {
    try {
      if (this.state !== "playing") {
        return;
      }
      const end = this.chartLeadInEndSimSecond;
      if (!this.audioLoaded) {
        this.fallbackStartTime =
          performance.now() - ((end - this.audioOffset) / this.playbackRate) * 1000;
        this.useAudioSync = false;
        return;
      }
      this.useAudioSync = true;
      this.audioAnchorSecond = end - this.audioOffset;
      this.audioAnchorPerfMs = performance.now();
      await this.audioPort?.play();
      this.audioAnchorPerfMs = performance.now();
      this.startAudioSync();
    } catch (e: unknown) {
      console.warn("Chart lead-in: audio play failed, falling back to timer:", e);
      const end = this.chartLeadInEndSimSecond;
      this.useAudioSync = false;
      this.fallbackStartTime =
        performance.now() - ((end - this.audioOffset) / this.playbackRate) * 1000;
    } finally {
      this.chartLeadInFinishing = false;
    }
  }

  /**
   * Call from NoteField each frame before `update()`: blank scroll so the first row reaches
   * the receptor from below the field (travel distance ÷ current scroll speed → chart seconds).
   */
  setChartLeadInFromLayout(
    fieldHeight: number,
    receptorY: number,
    reverse: boolean,
    speedMod?: string,
  ): void {
    const margin = 56;
    const travel = reverse ? receptorY : Math.max(0, fieldHeight - receptorY);
    const usable = travel + margin;
    const refBpm = this.baseBpm || 120;
    const mod = speedMod ?? this.getPrimaryPlayerConfig()?.speedMod ?? "C500";
    let fromPixels: number;
    if (mod.startsWith("C")) {
      const speed = parseInt(mod.slice(1), 10) || 500;
      const ppb = (speed * 60) / refBpm;
      const beats = usable / Math.max(ppb, 1e-6);
      fromPixels = (beats * 60) / refBpm;
    } else {
      const ppb = Math.abs(this.getVisualBeatDistance(0, 1, mod));
      const beats = usable / Math.max(ppb, 1e-6);
      fromPixels = (beats * 60) / refBpm;
    }
    const fromEmptyBeats = (CHART_LEAD_MIN_EMPTY_BEATS * 60) / refBpm;
    this.chartLeadInSeconds = Math.min(
      CHART_LEAD_MAX_SECONDS,
      Math.max(CHART_LEAD_MIN_SECONDS, Math.max(fromPixels, fromEmptyBeats)),
    );
  }

  /**
   * True when the field should scroll without note/hold sprites: 3-2-1 countdown, load, and the early silent lead-in.
   * Near chart playhead 0 we reveal notes slightly before audio so the first row approaches from below instead of popping on the receptor.
   */
  isChartLeadInBlankPhase(): boolean {
    if (this.state === "countdown" || this.state === "loading") {
      return true;
    }
    if (!this.chartLeadInActive) {
      return false;
    }
    const endChart = this.chartLeadInEndSimSecond - this.audioOffset;
    return this.getChartPlayheadSeconds() < endChart - CHART_LEAD_EARLY_NOTE_REVEAL_CHART_SEC;
  }

  update(now: number) {
    if (this.state !== "playing") return;

    let targetSecond: number;
    if (this.chartLeadInActive) {
      targetSecond =
        ((now - this.fallbackStartTime) / 1000) * this.playbackRate + this.audioOffset;
      if (targetSecond > this.chartLeadInEndSimSecond) {
        targetSecond = this.chartLeadInEndSimSecond;
      }
    } else if (this.useAudioSync) {
      let predicted = Math.max(this.simulatedSecond, this.predictAudioSecond(now));
      if (now < this.leadInSyncGuardUntilMs) {
        const ahead = predicted - this.currentSecond;
        if (ahead > CHART_LEAD_POST_SYNC_MAX_JUMP_SEC) {
          predicted = this.currentSecond + CHART_LEAD_POST_SYNC_MAX_JUMP_SEC;
        }
      }
      targetSecond = predicted;
    } else {
      targetSecond =
        ((now - this.fallbackStartTime) / 1000) * this.playbackRate + this.audioOffset;
    }

    if (!this.judgment) {
      this.currentSecond = targetSecond;
      this.simulatedSecond = targetSecond;
      this.currentBeat = this.computeCurrentBeatFromTiming();
      return;
    }

    let steps = 0;
    while (this.simulatedSecond + SIMULATION_DT <= targetSecond && steps < MAX_STEPS_PER_FRAME) {
      this.simulatedSecond += SIMULATION_DT;
      this.runSimulationStep(this.simulatedSecond);
      steps++;
    }

    if (steps >= MAX_STEPS_PER_FRAME && this.simulatedSecond < targetSecond) {
      this.simulatedSecond = targetSecond;
      this.runSimulationStep(this.simulatedSecond);
    }

    this.currentSecond = targetSecond;
    // Cache current beat once per tick — getNoteY() reads this instead of re-calculating
    this.currentBeat = this.computeCurrentBeatFromTiming();

    // Check for beat line SFX: fire when crossing integer beats that have notes
    this.checkBeatLineSfx();
    this.checkRhythmLaneSfx();

    if (
      this.chartLeadInActive &&
      !this.chartLeadInFinishing &&
      targetSecond >= this.chartLeadInEndSimSecond - 1e-6
    ) {
      this.chartLeadInActive = false;
      this.chartLeadInFinishing = true;
      this.leadInSyncGuardUntilMs = now + CHART_LEAD_POST_SYNC_GUARD_MS;
      void this.finishChartLeadInAsync();
    }

    const elapsedSinceStart = (now - this.playingStartTime) / 1000;
    const finishedByChartTail =
      elapsedSinceStart >= 2 &&
      this.notes.length > 0 &&
      this.currentSecond > this.lastNoteSecond + 2 &&
      // simulatedSecond must have actually processed past all notes to guard against
      // a corrupted audioAnchor making currentSecond jump ahead prematurely
      this.simulatedSecond > this.lastNoteSecond;

    // Fallback: for charts with malformed/extreme timing tails, audio may end while
    // `lastNoteSecond` is far in the future.
    // First, force a small post-end settle step so trailing misses/holds are flushed.
    const songEndSecond = this.songDuration + this.audioOffset;
    const audioEnded = this.songDuration > 0 && this.currentSecond >= songEndSecond + AUDIO_END_FINISH_GRACE_SEC;
    if (audioEnded) {
      // Audio clock stops near `songEndSecond`, but chart notes/holds may extend beyond it.
      // Advance simulation in small steps (needed for rolls / hold tails) until we reach the chart tail.
      const flushUntil = Math.max(this.currentSecond, this.lastNoteSecond + 2);
      let flushSteps = 0;
      while (this.simulatedSecond + 1e-9 < flushUntil && flushSteps < MAX_AUDIO_END_FLUSH_STEPS) {
        this.simulatedSecond = Math.min(flushUntil, this.simulatedSecond + SIMULATION_DT);
        this.runSimulationStep(this.simulatedSecond);
        flushSteps++;
        if (this.state !== "playing") return;
      }
      if (this.state !== "playing") return;
    }

    // Finish once everything at or before the simulation/audio timeline is settled.
    const settleLine = Math.max(this.currentSecond, this.simulatedSecond);
    const noPendingPastJudgmentLine = audioEnded
      ? !this.judgment.hasPendingScoreableNotesBefore(settleLine) &&
        !this.judgment.hasPendingHoldsBefore(settleLine)
      : false;

    if (finishedByChartTail || noPendingPastJudgmentLine) {
      this.state = "finished";
      this.cleanup();
      this.callbacks.onFinish?.(this.judgment.score);
    }
  }

  private runSimulationStep(simSecond: number) {
    if (!this.judgment) return;

    const pendingEvents = this.judgment.updateAutoMiss(simSecond);
    for (const evt of pendingEvents) {
      if (evt.judgment === "Miss") {
        this.callbacks.onMiss?.(evt);
        this.callbacks.onComboBreak?.();
      } else {
        this.callbacks.onJudgment?.(evt);
      }
    }

    if (this.judgment.updateHolds(simSecond, this.keysDown)) {
      this.callbacks.onHoldScoreTick?.();
    }

    if (this.judgment.isBothFailed()) {
      this.state = "failed";
      this.cleanup();
      this.callbacks.onFail?.(this.judgment.score);
    }
  }

  pressKey(track: number) {
    if (track < 0 || track >= this.config.numTracks) return;
    // Ignore repeated key-down events (browser auto-repeat while held).
    // A held key must not re-fire judgment logic — only the initial press should score.
    if (this.keysDown[track]) return;
    this.keysDown[track] = true;

    if (this.state !== "playing" || !this.judgment) return;

    const hitMine = this.judgment.checkMines(track, this.currentSecond);
    if (hitMine) {
      this.callbacks.onMineHit?.(track);
      return;
    }

    const evt = this.judgment.judgeInput(track, this.currentSecond);
    if (evt) {
      this.callbacks.onJudgment?.(evt);
      if (evt.judgment === "Miss") {
        this.callbacks.onComboBreak?.();
      }
    }
  }

  releaseKey(track: number) {
    if (track >= 0 && track < this.config.numTracks) {
      this.keysDown[track] = false;
    }
  }

  cleanup() {
    this.stopAudioSync();
    this.chartLeadInActive = false;
    this.chartLeadInFinishing = false;
    this.leadInSyncGuardUntilMs = 0;
    this.chartTiming = null;
    if (this.audioLoaded) {
      this.audioPort?.stop().catch((e) => logOptionalRejection("gameEngine.cleanup.audioStop", e));
    }
  }

  getDebugState() {
    return {
      state: this.state,
      currentSecond: this.currentSecond,
      simulatedSecond: this.simulatedSecond,
      audioLoaded: this.audioLoaded,
      useAudioSync: this.useAudioSync,
      audioOffset: this.audioOffset,
      anchorSecond: this.audioAnchorSecond,
      anchorPerfMs: this.audioAnchorPerfMs,
      driftMs: (this.currentSecond - this.simulatedSecond) * 1000,
      notesCount: this.notes.length,
      lastNoteSecond: this.lastNoteSecond,
    };
  }

  getScrollSpeed(): number {
    const mod = this.getPrimaryPlayerConfig()?.speedMod ?? "C500";
    if (mod.startsWith("C")) {
      return parseInt(mod.slice(1), 10) || 500;
    }
    return (parseFloat(mod) || 1.0) * 200;
  }

  /**
   * `notes` is sorted by `second` after {@link loadChart}. Matches former `notes.some` with
   * `Math.abs(note.second - chartTime) < tol` (strict interval).
   */
  private hasNoteNearChartTime(chartTime: number, tolSec: number): boolean {
    const notes = this.notes;
    const loT = chartTime - tolSec;
    const hiT = chartTime + tolSec;
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid]!.second <= loT) lo = mid + 1;
      else hi = mid;
    }
    return lo < notes.length && notes[lo]!.second < hiT;
  }

  /**
   * Check if we've crossed any integer beat positions that have notes, and fire beat line SFX.
   * Called once per update tick after currentBeat is computed.
   */
  private checkBeatLineSfx() {
    const cb = this.callbacks.onBeatLineApproach;
    if (!cb || this.notes.length === 0) return;

    const currentBeat = Math.floor(this.currentBeat);
    const lastBeat = Math.floor(this.lastBeatLineSfxBeat);

    if (currentBeat <= lastBeat) return;

    const tolSec = 0.25;
    // Check each integer beat from lastBeat + 1 to currentBeat
    for (let beat = lastBeat + 1; beat <= currentBeat; beat++) {
      const beatTime = this.beatToTime(beat);
      if (this.hasNoteNearChartTime(beatTime, tolSec)) {
        cb(beat);
      }
    }

    this.lastBeatLineSfxBeat = this.currentBeat;
  }

  /**
   * Per-lane rhythm SFX when the chart beat advances across rows (matches editor canvas playback).
   */
  private checkRhythmLaneSfx() {
    const cb = this.callbacks.onRhythmLanesApproach;
    if (!cb || this.notes.length === 0) return;

    const currBeat = this.currentBeat;
    const prevBeat = this.lastRhythmLaneSfxBeat;
    const eps = 1e-5;

    if (prevBeat === null) {
      this.lastRhythmLaneSfxBeat = currBeat;
      return;
    }
    if (currBeat <= prevBeat + 1e-9) {
      this.lastRhythmLaneSfxBeat = currBeat;
      return;
    }

    const low = prevBeat - eps;
    const high = currBeat + eps;
    const tracksCrossed = new Set<number>();
    for (const n of this.notes) {
      if (n.noteType === "Fake") continue;
      const nb = n.beat;
      if (nb <= low || nb > high) continue;
      tracksCrossed.add(n.track);
    }
    if (tracksCrossed.size > 0) {
      const scale = 1 / Math.sqrt(tracksCrossed.size);
      cb([...tracksCrossed], scale);
    }
    this.lastRhythmLaneSfxBeat = currBeat;
  }

  /**
   * Song timeline position used with chart `note.second` / BPM math (player audio offset applied).
   */
  getChartPlayheadSeconds(): number {
    return this.currentSecond - this.audioOffset;
  }

  /**
   * Chart time in seconds (same domain as `note.second` when {@link setChartTiming} is used).
   */
  beatToTime(beat: number): number {
    if (this.chartTiming) {
      return chartBeatToSecondExtrapolated(beat, this.chartTiming);
    }
    const changes = this.bpmChanges;
    const bpm0 = changes[0]?.bpm ?? this.baseBpm ?? 120;
    if (beat < 0) {
      return (beat * 60) / bpm0;
    }
    if (changes.length === 0) {
      return (beat * 60) / (this.baseBpm || 120);
    }
    if (changes.length === 1) {
      return (beat * 60) / changes[0].bpm;
    }
    let time = 0;
    let prevBeat = 0;
    let prevBpm = changes[0].bpm;
    for (let i = 1; i < changes.length; i++) {
      const change = changes[i];
      if (change.beat >= beat) break;
      time += ((change.beat - prevBeat) * 60) / prevBpm;
      prevBeat = change.beat;
      prevBpm = change.bpm;
    }
    time += ((beat - prevBeat) * 60) / prevBpm;
    return time;
  }

  /**
   * Inverse of {@link beatToTime} — chart beat at chart seconds (player offset applied via {@link getChartPlayheadSeconds}).
   */
  timeToBeat(seconds: number): number {
    if (this.chartTiming) {
      return chartSecondToBeatExtrapolated(seconds, this.chartTiming);
    }
    const changes = this.bpmChanges;
    const bpm0 = changes[0]?.bpm ?? this.baseBpm ?? 120;
    if (seconds < 0) {
      return (seconds * bpm0) / 60;
    }
    if (changes.length === 0) {
      return (seconds * (this.baseBpm || 120)) / 60;
    }
    if (changes.length === 1) {
      return (seconds * changes[0].bpm) / 60;
    }
    let remaining = seconds;
    let prevBeat = 0;
    let prevBpm = changes[0].bpm;
    for (let i = 1; i < changes.length; i++) {
      const change = changes[i];
      const segDuration = ((change.beat - prevBeat) * 60) / prevBpm;
      if (remaining <= segDuration) break;
      remaining -= segDuration;
      prevBeat = change.beat;
      prevBpm = change.bpm;
    }
    return prevBeat + (remaining * prevBpm) / 60;
  }

  /**
   * Get the BPM at a specific beat, considering BPM changes.
   */
  getBpmAtBeat(beat: number): number {
    if (this.bpmChanges.length === 0) {
      return this.baseBpm;
    }
    let bpm = this.bpmChanges[0].bpm;
    for (const change of this.bpmChanges) {
      if (change.beat > beat) break;
      bpm = change.bpm;
    }
    return bpm;
  }

  /**
   * Calculate visual distance (in pixels) between two beats.
   * This accounts for BPM changes to create the "speed up/slow down" effect.
   */
  getVisualBeatDistance(fromBeat: number, toBeat: number, speedModOverride?: string): number {
    const mod = speedModOverride ?? this.getPrimaryPlayerConfig()?.speedMod ?? "C500";
    
    // For C-mod (constant scroll speed), use time-based calculation
    if (mod.startsWith("C")) {
      // Use baseBpm as reference for visual spacing
      const referenceBpm = this.baseBpm || 120;
      const speed = parseInt(mod.slice(1), 10) || 500;
      // Distance = (beat diff / reference BPM) * speed pixels per beat-second
      return (toBeat - fromBeat) * (60 / referenceBpm) * speed;
    }
    
    // For X-mod (multiplier), BPM affects visual speed
    const multiplier = parseFloat(mod) || 1.0;
    const baseSpeed = 200; // pixels per "beat-second" at base BPM
    
    if (this.bpmChanges.length <= 1) {
      // No BPM changes, simple calculation
      return (toBeat - fromBeat) * multiplier * baseSpeed;
    }
    
    // With BPM changes, integrate over the beat range
    // bpmChanges is kept sorted by loadChart / loadBpmChanges
    let distance = 0;
    let currentBeat = fromBeat;
    let currentBpm = this.getBpmAtBeat(fromBeat);

    // Find the next BPM change after fromBeat
    for (const change of this.bpmChanges) {
      if (change.beat <= fromBeat) {
        currentBpm = change.bpm;
        continue;
      }
      if (change.beat >= toBeat) break;
      
      // Distance for this segment
      const segmentBeats = change.beat - currentBeat;
      const bpmRatio = currentBpm / (this.baseBpm || 120);
      distance += segmentBeats * multiplier * baseSpeed * bpmRatio;
      
      currentBeat = change.beat;
      currentBpm = change.bpm;
    }
    
    // Remaining distance to toBeat
    const remainingBeats = toBeat - currentBeat;
    const bpmRatio = currentBpm / (this.baseBpm || 120);
    distance += remainingBeats * multiplier * baseSpeed * bpmRatio;
    
    return distance;
  }

  /** Indices of notes with `note.second` (chart time) within `[playhead - before, playhead + after]`. */
  getVisibleNoteRange(beforeSeconds: number, afterSeconds: number): [number, number] {
    const ph = this.getChartPlayheadSeconds();
    const left = ph - beforeSeconds;
    const right = ph + afterSeconds;

    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid]!.second < left) lo = mid + 1;
      else hi = mid;
    }
    const start = lo;

    lo = start;
    hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid]!.second <= right) lo = mid + 1;
      else hi = mid;
    }
    const endExclusive = lo;

    return [start, endExclusive];
  }

  /**
   * @param chartSecond Same timeline as `note.second` from chart / {@link getChartPlayheadSeconds} (not engine `currentSecond`).
   */
  getNoteY(chartSecond: number, receptorY: number, _fieldHeight: number, speedModOverride?: string, reverseOverride?: boolean): number {
    const p1 = this.getPrimaryPlayerConfig();
    const mod = speedModOverride ?? p1?.speedMod ?? "C500";
    const reverse = reverseOverride ?? p1?.reverse ?? false;
    const currentBeat = this.currentBeat;
    const beatAtNote = this.timeToBeat(chartSecond);

    if (mod.startsWith("C")) {
      // C-mod: constant pixels per **beat** at reference BPM; beat from chart seconds matches judgment / Rust `beat_to_second`.
      const speed = parseInt(mod.slice(1), 10) || 500;
      const refBpm = this.baseBpm || 120;
      const pixelsPerBeat = (speed * 60) / refBpm;
      const pixelOffset = (beatAtNote - currentBeat) * pixelsPerBeat;

      if (reverse) {
        return receptorY - pixelOffset;
      }
      return receptorY + pixelOffset;
    }
    const pixelOffset = this.getVisualBeatDistance(currentBeat, beatAtNote, mod);

    if (reverse) {
      return receptorY - pixelOffset;
    }
    return receptorY + pixelOffset;
  }

  /**
   * Current chart beat at playhead from timing data (BPM + offset/stop/delay when set).
   */
  computeCurrentBeatFromTiming(): number {
    return this.timeToBeat(this.getChartPlayheadSeconds());
  }

  /**
   * @deprecated Prefer {@link computeCurrentBeatFromTiming}; kept for external callers if any.
   */
  getCurrentBeat(): number {
    return this.computeCurrentBeatFromTiming();
  }
}
