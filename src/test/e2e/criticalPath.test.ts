import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "@/shared/api/config";
import { getSongList, getSongMusicPath, loadChart } from "@/shared/api/song";
import { audioPreview, audioLoad, audioPlay } from "@/shared/api/audio";
import { saveScore } from "@/shared/api/profile";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (cmd: string) => {
    if (cmd === "get_song_music_path") return "demo.ogg";
    return {};
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("critical user path", () => {
  it("covers startup -> select -> preview -> start -> save", async () => {
    await loadConfig();
    await getSongList();
    await loadChart("songs/demo");
    const music = await getSongMusicPath("songs/demo");
    await audioPreview(music, 5, 15);
    await audioLoad(music);
    await audioPlay();
    await saveScore({
      profileId: "default",
      songPath: "songs/demo",
      stepsType: "pump-single",
      difficulty: "HARD",
      meter: 10,
      grade: "AA",
      dpPercent: 99,
      score: 1000000,
      maxCombo: 400,
      w1: 390,
      w2: 10,
      w3: 0,
      w4: 0,
      w5: 0,
      miss: 0,
      held: 0,
      letGo: 0,
      minesHit: 0,
      modifiers: "",
    });

    expect(invokeMock.mock.calls.map((x) => x[0])).toEqual([
      "load_config",
      "get_song_list",
      "load_chart",
      "get_song_music_path",
      "audio_preview",
      "audio_load",
      "audio_play",
      "save_score",
    ]);
  });

  it("degrades on missing resource", async () => {
    invokeMock.mockRejectedValue(new Error("missing audio"));
    await expect(audioLoad("missing.ogg")).rejects.toThrow("missing audio");
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_song_music_path") return "demo.ogg";
      return {};
    });
  });
});
