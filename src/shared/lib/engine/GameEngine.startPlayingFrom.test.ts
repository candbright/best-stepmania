import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
      second: -1,
      notes: [{ track: 0, noteType: "Tap", holdEndRow: null }],
    },
  ];
}

function createMockAudio(): { port: AudioPort; log: string[] } {
  const log: string[] = [];
  const port: AudioPort = {
    load: async () => {
      log.push("load");
      return { duration: 120 };
    },
    play: async () => {
      log.push("play");
    },
    pause: async () => {
      log.push("pause");
    },
    seek: async (seconds: number) => {
      log.push(`seek(${seconds})`);
    },
    getTime: async () => 0,
    getPlaybackState: async () => ({ time: 0, duration: 120, isPlaying: true }),
    stop: async () => {
      log.push("stop");
    },
  };
  return { port, log };
}

describe("GameEngine.startPlayingFrom", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps negative chart time until delayed play (editor preview / positive OFFSET)", async () => {
    const { port, log } = createMockAudio();
    const engine = new GameEngine(makeConfig(0), port);
    engine.loadChart(minimalRows(), 120);
    await engine.loadAudio("test.ogg");

    const targetSecond = -0.5;
    const leadIn = 2;
    const chartStart = targetSecond - leadIn;

    await engine.startPlayingFrom(targetSecond, leadIn);

    expect(engine.currentSecond).toBe(chartStart);
    expect(engine.getDebugState().simulatedSecond).toBe(chartStart);
    expect(engine.getDebugState().useAudioSync).toBe(false);

    const seeks = log.filter((x) => x.startsWith("seek"));
    expect(seeks[seeks.length - 1]).toBe("seek(0)");
    expect(log.includes("play")).toBe(false);

    await vi.advanceTimersByTimeAsync(2500);
    expect(log.includes("play")).toBe(true);
    expect(engine.getDebugState().useAudioSync).toBe(true);
    expect(engine.getDebugState().anchorSecond).toBeCloseTo(0, 10);
  });

  it("seeks file immediately when chart start is non-negative; anchor matches resume() formula", async () => {
    const { port, log } = createMockAudio();
    const engine = new GameEngine(makeConfig(50), port);
    engine.loadChart(minimalRows(), 120);
    await engine.loadAudio("test.ogg");

    await engine.startPlayingFrom(5, 2);

    const chartStart = 3;
    expect(engine.currentSecond).toBe(chartStart);
    expect(log.some((x) => x === "seek(3)")).toBe(true);
    expect(log.includes("play")).toBe(true);
    expect(engine.getDebugState().anchorSecond).toBeCloseTo(3 - 0.05, 6);
  });

  it("update during await seek does not use stale audio anchor (regression)", async () => {
    vi.useRealTimers();
    const { port, log } = createMockAudio();
    const engine = new GameEngine(makeConfig(0), port);
    engine.loadChart(minimalRows(), 120);
    await engine.loadAudio("test.ogg");

    const targetSecond = -0.5;
    const leadIn = 2;
    const chartStart = targetSecond - leadIn;

    let nowMs = 5_000_000;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => nowMs);

    port.seek = async (seconds: number) => {
      log.push(`seek(${seconds})`);
      nowMs += 16;
      engine.update(nowMs);
      expect(engine.state).toBe("playing");
      expect(engine.currentSecond).toBeGreaterThan(chartStart - 0.2);
      expect(engine.currentSecond).toBeLessThan(10);
    };

    await engine.startPlayingFrom(targetSecond, leadIn);
    nowSpy.mockRestore();
  });

  it("cleanup clears delayed preview timer so play never fires", async () => {
    const { port, log } = createMockAudio();
    const engine = new GameEngine(makeConfig(0), port);
    engine.loadChart(minimalRows(), 120);
    await engine.loadAudio("test.ogg");

    const playCountBefore = log.filter((x) => x === "play").length;
    await engine.startPlayingFrom(-0.5, 2);
    engine.cleanup();

    await vi.advanceTimersByTimeAsync(5000);
    const playCountAfter = log.filter((x) => x === "play").length;
    expect(playCountAfter).toBe(playCountBefore);
  });
});
