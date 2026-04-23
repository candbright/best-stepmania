import { describe, expect, it } from "vitest";
import { GameEngine } from "./GameEngine";
import type { AudioPort } from "./ports";
import type { ChartNoteRow, GameConfig, PerPlayerConfig } from "./types";

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

function makeConfig(audioOffsetMs: number): GameConfig {
  return {
    audioOffset: audioOffsetMs,
    judgmentStyle: "ddr",
    showOffset: false,
    lifeType: "bar",
    autoPlay: false,
    expertModeEnabled: false,
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

function minimalRows(): ChartNoteRow[] {
  return [
    {
      row: 0,
      beat: 0,
      second: 1.0,
      notes: [{ track: 0, noteType: "Tap", holdEndRow: null }],
    },
  ];
}

function createMockAudio(): AudioPort {
  return {
    load: async () => ({ duration: 120 }),
    play: async () => {},
    pause: async () => {},
    seek: async () => {},
    getTime: async () => 0,
    getPlaybackState: async () => ({ time: 0, duration: 120, isPlaying: true }),
    stop: async () => {},
  };
}

describe("GameEngine onFail (no duplicate game-over callback)", () => {
  it("invokes onFail at most once when runSimulationStep is called again after game over", async () => {
    const engine = new GameEngine(makeConfig(0), createMockAudio());
    engine.loadChart(minimalRows(), 120);
    await engine.loadAudio("test.ogg");
    await engine.startPlayingFrom(2, 0);

    expect(engine.state).toBe("playing");
    const j = engine.judgment;
    expect(j).not.toBeNull();
    j!.player1Score.failed = true;

    let failCount = 0;
    engine.callbacks.onFail = () => {
      failCount += 1;
    };

    const sim = (engine as unknown as { runSimulationStep: (s: number) => void }).runSimulationStep.bind(
      engine,
    );
    sim(2.0);
    sim(2.0);

    expect(failCount).toBe(1);
    expect(engine.state).toBe("failed");
  });

});
