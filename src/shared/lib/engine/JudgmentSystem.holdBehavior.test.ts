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

function makeConfig(expertModeEnabled: boolean): GameConfig {
  return {
    audioOffset: 0,
    judgmentStyle: "ddr",
    showOffset: false,
    lifeType: "bar",
    autoPlay: false,
    expertModeEnabled,
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

function singleHold(endSecond: number): ChartNote[] {
  return [
    {
      row: 0,
      beat: 0,
      second: 0,
      track: 0,
      noteType: "HoldHead",
      holdEndRow: 48,
      holdEndSecond: endSecond,
      routineLayer: null,
    },
  ];
}

describe("JudgmentSystem hold checkpoint scoring", () => {
  it("scores multiple held checkpoints based on hold length", () => {
    const j = new JudgmentSystem(singleHold(1.0), makeConfig(false), captureCurrentScoringConfig());
    expect(j.judgeInput(0, 0)).not.toBeNull();

    const keysDown = [true, false, false, false, false];
    j.updateHolds(1.1, keysDown);

    expect(j.player1Score.held).toBeGreaterThan(1);
  });

  it("non-expert mode keeps combo alive during 1s grace after let-go", () => {
    const j = new JudgmentSystem(singleHold(1.2), makeConfig(false), captureCurrentScoringConfig());
    expect(j.judgeInput(0, 0)).not.toBeNull();

    const keysDownReleased = [false, false, false, false, false];
    j.updateHolds(0.9, keysDownReleased);

    expect(j.player1Score.letGo).toBe(0);
    expect(j.player1Score.combo).toBeGreaterThan(0);
  });

  it("expert mode breaks hold chain immediately after let-go", () => {
    const j = new JudgmentSystem(singleHold(1.2), makeConfig(true), captureCurrentScoringConfig());
    expect(j.judgeInput(0, 0)).not.toBeNull();

    const keysDownReleased = [false, false, false, false, false];
    j.updateHolds(0.35, keysDownReleased);

    expect(j.player1Score.letGo).toBeGreaterThan(0);
  });
});
