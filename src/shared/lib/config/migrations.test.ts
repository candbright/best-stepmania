import { describe, expect, it } from "vitest";
import { LATEST_CONFIG_VERSION, migrateConfig } from "@/shared/lib/config/migrations";
import type { AppConfig } from "@/shared/api";

function legacyConfig(): AppConfig {
  return {
    language: "en",
    theme: "default",
    defaultProfile: "Player",
    masterVolume: 0.8,
    musicVolume: 0.7,
    effectVolume: 0.9,
    audioOffsetMs: 0,
    fullscreen: false,
    vsync: true,
    targetFps: 999,
    judgmentStyle: "ddr",
    showOffset: true,
    lifeType: "bar",
    autoPlay: false,
    playerConfigs: [
      { speedMod: "C500", reverse: false, mirror: false, sudden: false, hidden: false, rotate: false, noteskin: "default", noteStyle: "default", audioOffset: 0, noteScale: 1 },
      { speedMod: "C500", reverse: false, mirror: false, sudden: false, hidden: false, rotate: false, noteskin: "default", noteStyle: "default", audioOffset: 0, noteScale: 1 },
    ],
    playbackRate: 1,
    uiScale: 5,
    doublePanelGapPx: 56,
    batteryLives: 3,
    chartCacheSize: 0,
    showParticles: true,
    songDirectories: [],
  };
}

describe("migrateConfig", () => {
  it("normalizes legacy config values and stamps latest version", () => {
    const migrated = migrateConfig(legacyConfig());
    expect(migrated.configVersion).toBe(LATEST_CONFIG_VERSION);
    expect(migrated.targetFps).toBe(360);
    expect(migrated.uiScale).toBe(1.5);
    expect(migrated.chartCacheSize).toBe(1);
    expect(migrated.songDirectories).toEqual(["songs"]);
  });
});
