import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, saveConfig } from "@/shared/api/config";
import { getSongList, getScanStatus } from "@/shared/api/song";
import { audioLoad, audioPlay } from "@/shared/api/audio";
import { getProfiles, saveScore } from "@/shared/api/profile";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async () => ({})),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("IPC contracts", () => {
  beforeEach(() => {
    invokeMock.mockClear();
  });

  it("config commands keep stable names and payload shape", async () => {
    const cfg = {
      configVersion: 1,
      language: "en",
      theme: "default",
      defaultProfile: "Player",
      masterVolume: 0.8,
      musicVolume: 0.7,
      effectVolume: 0.9,
      audioOffsetMs: 0,
      fullscreen: false,
      vsync: true,
      targetFps: 144,
      judgmentStyle: "ddr",
      showOffset: true,
      lifeType: "bar",
      autoPlay: false,
      playerConfigs: [{}, {}],
      playbackRate: 1,
      uiScale: 1,
      doublePanelGapPx: 56,
      batteryLives: 3,
      chartCacheSize: 8,
      showParticles: true,
      songDirectories: ["songs"],
    };
    await loadConfig();
    await saveConfig(cfg as never);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "load_config", {});
    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_config", { config: cfg });
  });

  it("song/audio/profile command names remain unchanged", async () => {
    await getSongList("title", "pack");
    await getScanStatus();
    await audioLoad("music.ogg");
    await audioPlay(7);
    await getProfiles();
    await saveScore({ profileId: "p", songPath: "s", stepsType: "pump-single", difficulty: "HARD", meter: 10, grade: "A", dpPercent: 98, score: 9999, maxCombo: 300, w1: 1, w2: 2, w3: 3, w4: 0, w5: 0, miss: 0, held: 0, letGo: 0, minesHit: 0, modifiers: "" });
    const commandNames = invokeMock.mock.calls
      .map((x) => (x as unknown[])[0])
      .filter((x): x is string => typeof x === "string");
    expect(commandNames).toEqual([
      "get_song_list",
      "get_scan_status",
      "audio_load",
      "audio_play",
      "get_profiles",
      "save_score",
    ]);
  });
});
