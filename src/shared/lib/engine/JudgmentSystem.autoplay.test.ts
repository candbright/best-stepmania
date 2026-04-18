import { describe, expect, it } from "vitest";
import { JudgmentSystem } from "./JudgmentSystem";
import type { ChartNote, GameConfig, PerPlayerConfig } from "./types";
import { captureCurrentScoringConfig } from "./types";

const stubPc: PerPlayerConfig = {
  speedMod: "1",
  reverse: false,
  mirror: false,
  sudden: false,
  hidden: false,
  rotate: false,
  noteskin: "",
  noteStyle: "default",
  audioOffset: 0,
  noteScale: 1,
};

function makeConfig(autoPlay: boolean): GameConfig {
  return {
    audioOffset: 0,
    judgmentStyle: "ddr",
    showOffset: false,
    lifeType: "bar",
    autoPlay,
    numTracks: 5,
    playbackRate: 1,
    batteryLives: 3,
    showParticles: false,
    coopMode: "solo",
    sessionPlayMode: "pump-single",
    playerConfigs: [stubPc, stubPc],
    requireBothFailedForGameOver: false,
  };
}

describe("JudgmentSystem autoPlay roll tails", () => {
  it("credits roll tail DP when sim time jumps past the tick window (e.g. rAF stall)", () => {
    const notes: ChartNote[] = [
      {
        row: 0,
        beat: 0,
        second: 0,
        track: 0,
        noteType: "Roll",
        holdEndRow: 10,
        holdEndSecond: 1,
        routineLayer: null,
      },
    ];
    const j = new JudgmentSystem(notes, makeConfig(true), captureCurrentScoringConfig());
    j.updateAutoMiss(0);
    j.updateHolds(0, []);
    j.updateHolds(100, []);

    expect(j.player1Score.letGo).toBe(0);
    expect(j.player1Score.held).toBe(1);
    expect(j.player1Score.w1).toBe(1);
  });

  it("without autoPlay, a huge jump still fails the roll tail tick window", () => {
    const notes: ChartNote[] = [
      {
        row: 0,
        beat: 0,
        second: 0,
        track: 0,
        noteType: "Roll",
        holdEndRow: 10,
        holdEndSecond: 1,
        routineLayer: null,
      },
    ];
    const j = new JudgmentSystem(notes, makeConfig(false), captureCurrentScoringConfig());
    expect(j.judgeInput(0, 0)).not.toBeNull();
    j.updateHolds(0, []);
    j.updateHolds(100, []);

    expect(j.player1Score.letGo).toBe(1);
    expect(j.player1Score.held).toBe(0);
  });
});

describe("JudgmentSystem snapAutoPlayScoresToMaximum", () => {
  it("forces per-player DP to maxPossibleDp when autoPlay completes without failure", () => {
    const notes: ChartNote[] = [
      {
        row: 0,
        beat: 0,
        second: 0,
        track: 0,
        noteType: "Tap",
        holdEndRow: null,
        holdEndSecond: null,
        routineLayer: null,
      },
    ];
    const j = new JudgmentSystem(notes, makeConfig(true), captureCurrentScoringConfig());
    j.player1Score.dancePoints = 0;
    j.score.dancePoints = 0;
    j.snapAutoPlayScoresToMaximum();
    expect(j.dpPercentForPlayer(1)).toBe(1);
    expect(j.gradeForPlayer(1)).toBe("SSS");
  });

  it("creates hold state when only holdEndSecond is set (no holdEndRow)", () => {
    const notes: ChartNote[] = [
      {
        row: 1,
        beat: 0,
        second: 0,
        track: 0,
        noteType: "HoldHead",
        holdEndRow: null,
        holdEndSecond: 2,
        routineLayer: null,
      },
    ];
    const j = new JudgmentSystem(notes, makeConfig(true), captureCurrentScoringConfig());
    expect(j.holds).toHaveLength(1);
    expect(j.holds[0]?.endSecond).toBe(2);
  });
});
