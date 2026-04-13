import type {
  ChartNote,
  JudgmentType,
  JudgmentEvent,
  HoldState,
  ScoreState,
  GameConfig,
  ScoringSnapshot,
} from "./types";
import { captureCurrentScoringConfig } from "./types";

const ROLL_TICK_INTERVAL = 0.25;

/** Type-safe map from JudgmentType to its corresponding ScoreState key. */
const JUDGMENT_SCORE_KEY: Readonly<Record<JudgmentType, keyof Pick<ScoreState, "w1" | "w2" | "w3" | "w4" | "w5" | "miss">>> = {
  W1: "w1", W2: "w2", W3: "w3", W4: "w4", W5: "w5", Miss: "miss",
} as const;

export class JudgmentSystem {
  private notes: ChartNote[] = [];
  private judgedRows: Set<number> = new Set();
  public holds: HoldState[] = [];
  public score: ScoreState;
  public player1Score: ScoreState;
  public player2Score: ScoreState;
  public events: JudgmentEvent[] = [];
  public lastEvent: JudgmentEvent | null = null;
  private config: GameConfig;
  private readonly sc: ScoringSnapshot;
  private batteryLives: number;
  private batteryLives2: number;

  private missCursor = 0;
  private trackNotes: ChartNote[][] = [];
  private trackSearchStart: number[] = [];

  private getPlayerForTrack(track: number): 1 | 2 {
    if (this.config.coopMode === "solo") return 1;
    if (this.config.coopMode === "double" || this.config.coopMode === "co-op") {
      return track < this.config.numTracks / 2 ? 1 : 2;
    }
    return track % 2 === 0 ? 1 : 2;
  }

  private getScoreStateForPlayer(player: 1 | 2): ScoreState {
    return player === 1 ? this.player1Score : this.player2Score;
  }

  private applyJudgment(evt: JudgmentEvent) {
    const j = evt.judgment;
    const ps = this.getScoreStateForPlayer(evt.player);
    ps[JUDGMENT_SCORE_KEY[j]]++;
    ps.dancePoints += this.sc.dpWeights[j];
    this.events.push(evt);
    this.lastEvent = evt;

    const isMiss = j === "W5" || j === "Miss";
    if (isMiss) {
      ps.combo = 0;
      if (this.config.lifeType === "battery") {
        const bl = evt.player === 1 ? this.batteryLives : this.batteryLives2;
        const newBl = Math.max(0, bl - 1);
        if (evt.player === 1) {
          this.batteryLives = newBl;
          this.player1Score.life = newBl / (this.config.batteryLives || 3);
          if (newBl === 0) this.player1Score.failed = true;
        } else {
          this.batteryLives2 = newBl;
          this.player2Score.life = newBl / (this.config.batteryLives || 3);
          if (newBl === 0) this.player2Score.failed = true;
        }
      }
    } else {
      ps.combo++;
      ps.maxCombo = Math.max(ps.maxCombo, ps.combo);
    }

    if (this.config.lifeType !== "battery") {
      const deltas = this.sc.lifeDeltas[this.config.lifeType] ?? this.sc.lifeDeltas["bar"];
      const delta = deltas?.[j] ?? 0;
      ps.life = Math.max(0, Math.min(1, ps.life + delta));
      if (ps.life <= 0) ps.failed = true;
    }

    // Sync combined score life/failed from per-player state
    if (this.config.coopMode === "solo") {
      this.score.life = this.player1Score.life;
      this.score.failed = this.player1Score.failed;
    } else {
      this.score.life = Math.min(this.player1Score.life, this.player2Score.life);
      this.score.failed = this.player1Score.failed && this.player2Score.failed;
    }

    this.score[JUDGMENT_SCORE_KEY[j]]++;
    this.score.dancePoints += this.sc.dpWeights[j];
    if (isMiss) {
      this.score.combo = 0;
    } else {
      this.score.combo = Math.max(
        this.score.combo,
        evt.player === 1 ? this.player1Score.combo : this.player2Score.combo,
      );
    }

    // Combined `score` is used for evaluation / save — maxCombo must mirror per-player peaks.
    this.score.maxCombo = Math.max(
      this.player1Score.maxCombo,
      this.player2Score.maxCombo,
    );
  }

  isBothFailed(): boolean {
    if (this.config.coopMode === "solo") return this.player1Score.failed;
    return this.player1Score.failed && this.player2Score.failed;
  }

  constructor(notes: ChartNote[], config: GameConfig, scoringConfig?: ScoringSnapshot) {
    this.notes = notes;
    this.config = config;
    this.sc = scoringConfig ?? captureCurrentScoringConfig();
    this.batteryLives = config.batteryLives ?? 3;

    const scoreable = notes.filter(
      (n) => n.noteType === "Tap" || n.noteType === "HoldHead" || n.noteType === "Lift" || n.noteType === "Roll",
    );
    const holdCount = notes.filter((n) => n.noteType === "HoldHead" || n.noteType === "Roll").length;
    const maxDp = scoreable.length * 2 + holdCount * 6;

    this.score = {
      w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, miss: 0,
      held: 0, letGo: 0, minesHit: 0,
      combo: 0, maxCombo: 0,
      dancePoints: 0, maxPossibleDp: maxDp,
      life: 1.0,
      failed: false,
    };
    this.player1Score = { ...this.score };
    this.player2Score = { ...this.score };
    this.batteryLives2 = config.batteryLives ?? 3;

    this.trackNotes = Array.from({ length: config.numTracks }, () => [] as ChartNote[]);
    this.trackSearchStart = new Array(config.numTracks).fill(0);

    for (const n of notes) {
      if (n.track >= 0 && n.track < config.numTracks) {
        this.trackNotes[n.track]!.push(n);
      }

      const isHold = n.noteType === "HoldHead";
      const isRoll = n.noteType === "Roll";
      if ((isHold || isRoll) && n.holdEndRow !== null) {
        this.holds.push({
          track: n.track,
          startRow: n.row,
          endRow: n.holdEndRow,
          endSecond: n.holdEndSecond ?? n.second + 1,
          active: false,
          held: false,
          finished: false,
          isRoll,
          lastRollTick: 0,
          broken: false,
          brokenAtSecond: null,
        });
      }
    }
  }

  /**
   * Returns a unique numeric key for a (track, row) pair.
   * Stride of 16 exceeds the maximum 10 tracks, guaranteeing no collisions.
   */
  private noteKey(track: number, row: number): number {
    return row * 16 + track;
  }

  /**
   * Silently mark all notes with second < skipSecond as already processed,
   * advancing all cursors. Used when starting playback mid-song (preview mode)
   * so notes before the starting point don't fire as misses.
   */
  skipBefore(skipSecond: number): void {
    let skippedCount = 0;
    for (const note of this.notes) {
      if (note.second < skipSecond) {
        this.judgedRows.add(this.noteKey(note.track, note.row));
        skippedCount++;
      }
    }
    
    // Adjust max possible DP so we don't penalize skipped notes
    // Every basic note skipped is worth 2 DP.
    // If it's a HoldHead or Roll, we shouldn't add 6 for the hold either.
    // Let's just reset the maxPossibleDp calculation based on the remaining unskipped notes.
    const remainingScoreable = this.notes.filter(
      (n) => n.second >= skipSecond && 
      (n.noteType === "Tap" || n.noteType === "HoldHead" || n.noteType === "Lift" || n.noteType === "Roll")
    );
    const holdCount = remainingScoreable.filter((n) => n.noteType === "HoldHead" || n.noteType === "Roll").length;
    this.score.maxPossibleDp = remainingScoreable.length * 2 + holdCount * 6;
    
    while (this.missCursor < this.notes.length && this.notes[this.missCursor]!.second < skipSecond) {
      this.missCursor++;
    }
    for (let t = 0; t < this.trackNotes.length; t++) {
      const tn = this.trackNotes[t]!;
      while (this.trackSearchStart[t]! < tn.length && tn[this.trackSearchStart[t]!]!.second < skipSecond) {
        this.trackSearchStart[t]!++;
      }
    }
    for (const hold of this.holds) {
      if (hold.endSecond < skipSecond) hold.finished = true;
    }
  }

  judgeInput(track: number, currentSecond: number): JudgmentEvent | null {
    const notes = this.trackNotes[track] ?? [];
    let start = this.trackSearchStart[track] ?? 0;

    while (start < notes.length) {
      const n = notes[start]!;
      if (this.judgedRows.has(this.noteKey(n.track, n.row)) || n.noteType === "Mine") {
        start++;
        continue;
      }
      if (n.second < currentSecond - this.sc.missWindow) {
        start++;
        continue;
      }
      break;
    }
    this.trackSearchStart[track] = start;

    let bestNote: ChartNote | null = null;
    let bestOffset = Infinity;

    for (let i = start; i < notes.length; i++) {
      const note = notes[i]!;
      if (note.noteType === "Mine") continue;
      if (this.judgedRows.has(this.noteKey(note.track, note.row))) continue;

      const offset = currentSecond - note.second;
      if (offset < -this.sc.missWindow) break;

      const absOffset = Math.abs(offset);
      if (absOffset <= this.sc.missWindow && absOffset < Math.abs(bestOffset)) {
        bestNote = note;
        bestOffset = offset;
      }
    }

    if (!bestNote) {
      this.handleRollPress(track, currentSecond);
      return null;
    }

    const judgment = this.offsetToJudgment(bestOffset);
    this.judgedRows.add(this.noteKey(bestNote.track, bestNote.row));

    const evt: JudgmentEvent = {
      judgment,
      offset: bestOffset,
      track: bestNote.track,
      noteRow: bestNote.row,
      time: currentSecond,
      player: this.getPlayerForTrack(bestNote.track),
    };

    this.applyJudgment(evt);

    if (bestNote.noteType === "HoldHead" || bestNote.noteType === "Roll") {
      const hold = this.holds.find(
        (h) => h.track === bestNote!.track && h.startRow === bestNote!.row,
      );
      if (hold && judgment !== "Miss" && judgment !== "W5") {
        hold.active = true;
        hold.lastRollTick = currentSecond;
      }
    }

    return evt;
  }

  private handleRollPress(track: number, currentSecond: number) {
    for (const hold of this.holds) {
      if (hold.track !== track) continue;
      if (!hold.active || hold.finished) continue;
      if (!hold.isRoll) continue;
      hold.lastRollTick = currentSecond;
      hold.held = true;
    }
  }

  private offsetToJudgment(offset: number): JudgmentType {
    const abs = Math.abs(offset);
    const tw = this.sc.timingWindows;
    if (abs <= tw.W1) return "W1";
    if (abs <= tw.W2) return "W2";
    if (abs <= tw.W3) return "W3";
    if (abs <= tw.W4) return "W4";
    if (abs <= tw.W5) return "W5";
    return "Miss";
  }

  updateAutoMiss(currentSecond: number): JudgmentEvent[] {
    if (this.config.autoPlay) {
      return this.autoPlayJudge(currentSecond);
    }

    const missed: JudgmentEvent[] = [];
    while (this.missCursor < this.notes.length) {
      const note = this.notes[this.missCursor]!;

      if (note.noteType === "Mine" || this.judgedRows.has(this.noteKey(note.track, note.row))) {
        this.missCursor++;
        continue;
      }

      const offset = currentSecond - note.second;
      if (offset > this.sc.missWindow) {
        this.judgedRows.add(this.noteKey(note.track, note.row));
        const evt: JudgmentEvent = {
          judgment: "Miss",
          offset,
          track: note.track,
          noteRow: note.row,
          time: currentSecond,
          player: this.getPlayerForTrack(note.track),
        };
        this.applyJudgment(evt);
        missed.push(evt);
        this.missCursor++;
        continue;
      }

      break;
    }
    return missed;
  }

  private autoPlayJudge(currentSecond: number): JudgmentEvent[] {
    const events: JudgmentEvent[] = [];
    while (this.missCursor < this.notes.length) {
      const note = this.notes[this.missCursor]!;
      if (this.judgedRows.has(this.noteKey(note.track, note.row))) {
        this.missCursor++;
        continue;
      }
      if (note.noteType === "Mine") {
        this.missCursor++;
        continue;
      }
      if (note.second > currentSecond) break;

      this.judgedRows.add(this.noteKey(note.track, note.row));
      const evt: JudgmentEvent = {
        judgment: "W1",
        offset: 0,
        track: note.track,
        noteRow: note.row,
        time: currentSecond,
        player: this.getPlayerForTrack(note.track),
      };
      this.applyJudgment(evt);
      events.push(evt);

      if (note.noteType === "HoldHead" || note.noteType === "Roll") {
        const hold = this.holds.find(
          (h) => h.track === note.track && h.startRow === note.row,
        );
        if (hold) {
          hold.active = true;
          hold.held = true;
          hold.lastRollTick = currentSecond;
        }
      }

      this.missCursor++;
    }
    return events;
  }

  updateHolds(currentSecond: number, keysDown: boolean[]) {
    for (const hold of this.holds) {
      if (hold.finished) continue;

      if (currentSecond >= hold.endSecond) {
        hold.finished = true;
        if (hold.active) {
          if (hold.isRoll) {
            const timeSinceTick = currentSecond - hold.lastRollTick;
            if (timeSinceTick <= ROLL_TICK_INTERVAL * 1.5) {
              this.score.held++;
              this.score.dancePoints += 6;
            } else {
              this.score.letGo++;
            }
          } else {
            if (hold.held) {
              this.score.held++;
              this.score.dancePoints += 6;
            } else {
              this.score.letGo++;
            }
          }
        }
        continue;
      }

      if (!hold.active) continue;

      if (hold.isRoll) {
        if (this.config.autoPlay) {
          hold.held = true;
          hold.lastRollTick = currentSecond;
        } else {
          const timeSinceTick = currentSecond - hold.lastRollTick;
          if (timeSinceTick > ROLL_TICK_INTERVAL) {
            hold.held = false;
          }
        }
      } else {
        const down = keysDown[hold.track] ?? false;
        if (!this.config.autoPlay && !hold.broken && hold.held && !down) {
          hold.broken = true;
          hold.brokenAtSecond = currentSecond;
        }
        if (hold.broken) {
          hold.held = false;
        } else {
          hold.held = this.config.autoPlay ? true : down;
        }
      }
    }
  }

  checkMines(track: number, currentSecond: number): boolean {
    const notes = this.trackNotes[track] ?? [];
    const start = Math.max(0, (this.trackSearchStart[track] ?? 0) - 4);
    for (let i = start; i < notes.length; i++) {
      const note = notes[i]!;
      if (note.noteType !== "Mine") continue;
      if (this.judgedRows.has(this.noteKey(note.track, note.row))) continue;
      const diff = Math.abs(currentSecond - note.second);
      if (diff <= 0.09) {
        this.judgedRows.add(this.noteKey(note.track, note.row));
        this.score.minesHit++;
        this.score.dancePoints -= 8;
        this.score.life = Math.max(0, this.score.life - 0.04);
        return true;
      }
      if (note.second > currentSecond + 0.2) break;
    }
    return false;
  }

  dpPercent(): number {
    if (this.score.maxPossibleDp === 0) return 1;
    return Math.max(0, Math.min(1, this.score.dancePoints / this.score.maxPossibleDp));
  }

  dpPercentForPlayer(player: 1 | 2): number {
    const ps = player === 1 ? this.player1Score : this.player2Score;
    if (ps.maxPossibleDp === 0) return 1;
    return Math.max(0, Math.min(1, ps.dancePoints / ps.maxPossibleDp));
  }

  private letterGradeFromDp(pct: number, failed: boolean): string {
    if (failed) return "F";
    const t = this.sc.gradeThresholds;
    if (pct >= t.minSss) return "SSS";
    if (pct >= t.ss) return "SS";
    if (pct >= t.s) return "S";
    if (pct >= t.a) return "A";
    if (pct >= t.b) return "B";
    if (pct >= t.c) return "C";
    if (pct >= t.d) return "D";
    return "F";
  }

  grade(): string {
    return this.letterGradeFromDp(this.dpPercent(), this.isBothFailed());
  }

  gradeForPlayer(player: 1 | 2): string {
    const ps = player === 1 ? this.player1Score : this.player2Score;
    return this.letterGradeFromDp(this.dpPercentForPlayer(player), ps.failed);
  }

  isFullCombo(): boolean {
    return this.score.w5 === 0 && this.score.miss === 0;
  }

  isNoteJudged(track: number, row: number): boolean {
    return this.judgedRows.has(this.noteKey(track, row));
  }
}
