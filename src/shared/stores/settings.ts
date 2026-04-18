import { defineStore } from "pinia";
import { ref } from "vue";
import type { AppConfig } from "@/shared/api";
import type { CoopMode, PerPlayerConfig } from "@/shared/lib/engine/types";
import type { KeyChord, ShortcutId } from "@/shared/lib/engine/keyBindings";
import {
  mergeShortcutBindings,
  shortcutsToSerializable,
  SHORTCUT_DEFAULTS,
} from "@/shared/lib/engine/keyBindings";
import { SONG_SELECT_PANEL_WIDTH_DEFAULT_PX } from "@/shared/constants/songSelectPanel";
import { clampDoublePanelGapPx, DOUBLE_PANEL_GAP_DEFAULT_PX } from "@/shared/lib/engine/render/panelLayout";
import { normalizeAppThemeId } from "@/shared/constants/appThemes";
import { normalizeWindowDisplayPreset } from "@/shared/constants/windowDisplay";
import type { WindowDisplayPresetId } from "@/shared/constants/windowDisplay";
import { syncWindowBorderlessDom } from "@/shared/services/tauri/applyWindowDisplay";
import type { CursorStylePreset, RhythmSfxStyle, UiSfxStyle } from "@/shared/api/config";
import * as api from "@/shared/api";

const clamp01 = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
};

const clampRange = (value: number, min: number, max: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
};

function clampSongSelectPanelWidthPx(value: unknown): number {
  const fallback = SONG_SELECT_PANEL_WIDTH_DEFAULT_PX;
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(Math.max(fallback, Math.min(1600, value)));
}

const normalizeCursorStylePreset = (value: string | null | undefined): CursorStylePreset =>
  value === "b" ? "b" : "a";

const normalizeRhythmSfxStyle = (value: string | null | undefined): RhythmSfxStyle =>
  value === "warm" || value === "bright" || value === "crisp" ? value : "bright";

/**
 * Settings store — manages persistent user preferences synced with TOML config.
 * Separated from game session state for single-responsibility.
 */
/** Matches Rust `AppConfig::default` / fresh install (and initial `ref` values below). */
function defaultPerPlayerConfig(): PerPlayerConfig {
  return {
    speedMod: "C500",
    reverse: false,
    mirror: false,
    sudden: false,
    hidden: false,
    rotate: false,
    noteskin: "default",
    noteStyle: "default",
    audioOffset: 0,
    noteScale: 1,
  };
}

export const useSettingsStore = defineStore("settings", () => {
  const configLoaded = ref(false);

  // Audio
  const masterVolume = ref(80);
  const musicVolume = ref(70);
  const effectVolume = ref(90);
  const metronomeSfxEnabled = ref(false);
  const metronomeSfxVolume = ref(100);
  const metronomeSfxStyle = ref<RhythmSfxStyle>("bright");
  const rhythmSfxEnabled = ref(true);
  const rhythmSfxVolume = ref(100);
  const rhythmSfxStyle = ref<RhythmSfxStyle>("bright");
  const uiSfxEnabled = ref(true);
  const uiSfxVolume = ref(70);
  const uiSfxStyle = ref<UiSfxStyle>("classic");
  const audioOffsetMs = ref(0);

  // Display
  const windowDisplayPreset = ref<WindowDisplayPresetId>("normal");
  const windowWidth = ref<number | null>(null);
  const windowHeight = ref<number | null>(null);
  const vsync = ref(true);
  const targetFps = ref(144);

  // Gameplay
  const judgmentStyle = ref("ddr");
  const showOffset = ref(true);
  const lifeType = ref("bar");
  const autoPlay = ref(false);

  // Shared runtime controls
  const playbackRate = ref(1.0);
  const uiScale = ref(1.0);
  const doublePanelGapPx = ref(DOUBLE_PANEL_GAP_DEFAULT_PX);
  /** 选歌页左侧歌曲列表宽度（px），与 `usePanelResize` / config 同步 */
  const songSelectPanelWidthPx = ref(SONG_SELECT_PANEL_WIDTH_DEFAULT_PX);
  const batteryLives = ref(3);
  const showParticles = ref(true);

  // Cursor & click effect
  const cursorEnabled = ref(true);
  const cursorStylePreset = ref<CursorStylePreset>("a");
  const cursorScale = ref(1);
  const cursorOpacity = ref(0.9);
  const cursorGlow = ref(0.35);
  const cursorTrailsEnabled = ref(true);
  const cursorRippleEnabled = ref(true);
  const cursorRippleDurationMs = ref(480);
  const cursorRippleMinScale = ref(0.65);
  const cursorRippleMaxScale = ref(6.2);
  const cursorRippleOpacity = ref(0.7);
  const cursorRippleLineWidth = ref(1);
  const cursorRippleGlow = ref(0.26);

  // Co-op mode
  const coopMode = ref<CoopMode>("solo");
  const player1Config = ref<PerPlayerConfig>(defaultPerPlayerConfig());
  const player2Config = ref<PerPlayerConfig>(defaultPerPlayerConfig());

  // App
  const language = ref("en");
  /** Cached OS-specific factory default language. */
  const factoryDefaultLanguage = ref("en");
  const theme = ref("default");
  const songDirectories = ref<string[]>(["songs"]);

  /** `null`：使用内置 10 键位图；非 null 时必须长度为 10（KeyboardEvent.code）。 */
  const gameplayPumpDoubleLanes = ref<string[] | null>(null);
  /** 相对 SHORTCUT_DEFAULTS 的覆盖。 */
  const shortcutOverrides = ref<Partial<Record<ShortcutId, KeyChord[]>>>({});

  function normalizeShortcutId(k: string): k is ShortcutId {
    return Object.prototype.hasOwnProperty.call(SHORTCUT_DEFAULTS, k);
  }

  async function loadAppConfig(opts?: { force?: boolean }) {
    if (configLoaded.value && !opts?.force) return;
    try {
      const cfg = await api.loadConfig();
      language.value = cfg.language;
      // Cache factory default language for resetToFactoryDefaults
      factoryDefaultLanguage.value = await api.getFactoryDefaultLanguage();
      theme.value = normalizeAppThemeId(cfg.theme ?? "default");
      masterVolume.value = Math.round(cfg.masterVolume * 100);
      
      // Update i18n locale
      const i18nMod = await import("@/shared/i18n");
      i18nMod.currentLocale.value = cfg.language as "en" | "zh-CN";
      localStorage.setItem("locale", cfg.language);
      
      // Update theme on document body
      document.body.setAttribute('data-theme', theme.value);
      musicVolume.value = Math.round(cfg.musicVolume * 100);
      effectVolume.value = Math.round(cfg.effectVolume * 100);
      metronomeSfxEnabled.value = cfg.metronomeSfxEnabled ?? cfg.rhythmSfxEnabled ?? false;
      metronomeSfxVolume.value = Math.round(
        (cfg.metronomeSfxVolume ?? cfg.rhythmSfxVolume ?? cfg.effectVolume ?? 1) * 100,
      );
      metronomeSfxStyle.value = normalizeRhythmSfxStyle(cfg.metronomeSfxStyle ?? cfg.rhythmSfxStyle);
      rhythmSfxEnabled.value = cfg.rhythmSfxEnabled ?? true;
      rhythmSfxVolume.value = Math.round((cfg.rhythmSfxVolume ?? cfg.effectVolume ?? 1) * 100);
      rhythmSfxStyle.value = normalizeRhythmSfxStyle(cfg.rhythmSfxStyle);
      uiSfxEnabled.value = cfg.uiSfxEnabled ?? true;
      uiSfxVolume.value = Math.round((cfg.uiSfxVolume ?? 0.7) * 100);
      uiSfxStyle.value = cfg.uiSfxStyle ?? "classic";
      audioOffsetMs.value = cfg.audioOffsetMs;
      windowDisplayPreset.value = normalizeWindowDisplayPreset(
        cfg.windowDisplayPreset ?? undefined,
        cfg.fullscreen,
      );
      syncWindowBorderlessDom(windowDisplayPreset.value);
      windowWidth.value = Number.isFinite(cfg.windowWidth) ? Math.round(cfg.windowWidth as number) : null;
      windowHeight.value = Number.isFinite(cfg.windowHeight) ? Math.round(cfg.windowHeight as number) : null;
      vsync.value = cfg.vsync;
      targetFps.value = cfg.targetFps;
      judgmentStyle.value = cfg.judgmentStyle;
      showOffset.value = cfg.showOffset;
      lifeType.value = cfg.lifeType;
      autoPlay.value = cfg.autoPlay ?? false;
      playbackRate.value = cfg.playbackRate ?? 1.0;
      uiScale.value = cfg.uiScale ?? 1.0;
      doublePanelGapPx.value = clampDoublePanelGapPx(cfg.doublePanelGapPx ?? DOUBLE_PANEL_GAP_DEFAULT_PX);
      songSelectPanelWidthPx.value = clampSongSelectPanelWidthPx(cfg.songSelectPanelWidthPx);
      batteryLives.value = cfg.batteryLives ?? 3;
      showParticles.value = cfg.showParticles ?? true;
      // Always use custom cursor skin (UI toggle removed).
      cursorEnabled.value = true;
      cursorStylePreset.value = normalizeCursorStylePreset(cfg.cursorStylePreset);
      cursorScale.value = clampRange(cfg.cursorScale ?? 1, 0.7, 1.6, 1);
      cursorOpacity.value = clamp01(cfg.cursorOpacity ?? 0.9, 0.9);
      cursorGlow.value = clamp01(cfg.cursorGlow ?? 0.35, 0.35);
      cursorTrailsEnabled.value = cfg.cursorTrailsEnabled ?? true;
      cursorRippleEnabled.value = cfg.cursorRippleEnabled ?? true;
      cursorRippleDurationMs.value = Math.round(clampRange(cfg.cursorRippleDurationMs ?? 480, 180, 1200, 480));
      cursorRippleMinScale.value = clampRange(cfg.cursorRippleMinScale ?? 0.65, 0.2, 2.4, 0.65);
      cursorRippleMaxScale.value = clampRange(cfg.cursorRippleMaxScale ?? 6.2, 1.2, 12, 6.2);
      cursorRippleOpacity.value = clamp01(cfg.cursorRippleOpacity ?? 0.7, 0.7);
      cursorRippleLineWidth.value = clampRange(cfg.cursorRippleLineWidth ?? 1, 0.5, 3, 1);
      cursorRippleGlow.value = clamp01(cfg.cursorRippleGlow ?? 0.26, 0.26);
      songDirectories.value = cfg.songDirectories;
      const [p1, p2] = cfg.playerConfigs;
      player1Config.value = {
        speedMod: p1.speedMod ?? "C500",
        reverse: p1.reverse ?? false,
        mirror: p1.mirror ?? false,
        sudden: p1.sudden ?? false,
        hidden: p1.hidden ?? false,
        rotate: p1.rotate ?? false,
        noteskin: p1.noteskin ?? "default",
        noteStyle: p1.noteStyle ?? "default",
        audioOffset: p1.audioOffset ?? 0,
        noteScale: p1.noteScale ?? 1,
      };
      player2Config.value = {
        speedMod: p2.speedMod ?? "C500",
        reverse: p2.reverse ?? false,
        mirror: p2.mirror ?? false,
        sudden: p2.sudden ?? false,
        hidden: p2.hidden ?? false,
        rotate: p2.rotate ?? false,
        noteskin: p2.noteskin ?? "default",
        noteStyle: p2.noteStyle ?? "default",
        audioOffset: p2.audioOffset ?? 0,
        noteScale: p2.noteScale ?? 1,
      };
      const kb = cfg.keyBindings;
      const lanes = kb?.gameplayPumpDoubleLanes;
      if (Array.isArray(lanes) && lanes.length === 10) {
        gameplayPumpDoubleLanes.value = [...lanes];
      } else {
        gameplayPumpDoubleLanes.value = null;
      }
      const nextOverrides: Partial<Record<ShortcutId, KeyChord[]>> = {};
      const rawSc = kb?.shortcuts;
      if (rawSc && typeof rawSc === "object") {
        const legacyPo = (rawSc as Record<string, unknown>)["playerOptions.back"];
        let legacyPlayerOptionsBack: KeyChord[] | undefined;
        if (Array.isArray(legacyPo) && legacyPo.length > 0) {
          const normalized: KeyChord[] = [];
          for (const c of legacyPo) {
            if (!c || typeof c !== "object" || typeof (c as KeyChord).code !== "string") continue;
            const x = c as KeyChord;
            normalized.push({ code: x.code, ctrl: !!x.ctrl, shift: !!x.shift, alt: !!x.alt });
          }
          if (normalized.length > 0) legacyPlayerOptionsBack = normalized;
        }
        for (const [id, chords] of Object.entries(rawSc)) {
          if (id === "playerOptions.back") continue;
          if (!normalizeShortcutId(id)) continue;
          if (!Array.isArray(chords) || chords.length === 0) continue;
          const normalized: KeyChord[] = chords.map((c) => ({
            code: c.code,
            ctrl: !!c.ctrl,
            shift: !!c.shift,
            alt: !!c.alt,
          }));
          nextOverrides[id as ShortcutId] = normalized;
        }
        if (legacyPlayerOptionsBack && !nextOverrides["global.back"]) {
          nextOverrides["global.back"] = legacyPlayerOptionsBack;
        }
      }
      shortcutOverrides.value = nextOverrides;
      configLoaded.value = true;
    } catch {
      configLoaded.value = true;
    }
  }

  async function saveAppConfig(profileName = "Player") {
    if (windowDisplayPreset.value === "normal" && typeof window !== "undefined") {
      windowWidth.value = Math.max(0, Math.round(window.innerWidth));
      windowHeight.value = Math.max(0, Math.round(window.innerHeight));
    }
    const mergedShortcuts = mergeShortcutBindings(shortcutOverrides.value);
    const serialShortcuts = shortcutsToSerializable(mergedShortcuts, SHORTCUT_DEFAULTS);
    const keyBindingsPayload =
      gameplayPumpDoubleLanes.value === null &&
      (!serialShortcuts || Object.keys(serialShortcuts).length === 0)
        ? null
        : {
            gameplayPumpDoubleLanes: gameplayPumpDoubleLanes.value,
            shortcuts:
              serialShortcuts && Object.keys(serialShortcuts).length > 0 ? serialShortcuts : null,
          };
    const cfg: AppConfig = {
      language: language.value,
      theme: theme.value,
      defaultProfile: profileName,
      masterVolume: masterVolume.value / 100,
      musicVolume: musicVolume.value / 100,
      effectVolume: effectVolume.value / 100,
      metronomeSfxEnabled: metronomeSfxEnabled.value,
      metronomeSfxVolume: metronomeSfxVolume.value / 100,
      metronomeSfxStyle: metronomeSfxStyle.value,
      rhythmSfxEnabled: rhythmSfxEnabled.value,
      rhythmSfxVolume: rhythmSfxVolume.value / 100,
      rhythmSfxStyle: rhythmSfxStyle.value,
      uiSfxEnabled: uiSfxEnabled.value,
      uiSfxVolume: uiSfxVolume.value / 100,
      uiSfxStyle: uiSfxStyle.value,
      audioOffsetMs: audioOffsetMs.value,
      fullscreen: windowDisplayPreset.value === "exclusiveFullscreen",
      windowWidth: windowWidth.value ?? undefined,
      windowHeight: windowHeight.value ?? undefined,
      windowDisplayPreset: windowDisplayPreset.value,
      vsync: vsync.value,
      targetFps: targetFps.value,
      judgmentStyle: judgmentStyle.value,
      showOffset: showOffset.value,
      lifeType: lifeType.value,
      autoPlay: autoPlay.value,
      playerConfigs: [
        {
          speedMod: player1Config.value.speedMod,
          reverse: player1Config.value.reverse,
          mirror: player1Config.value.mirror,
          sudden: player1Config.value.sudden,
          hidden: player1Config.value.hidden,
          rotate: player1Config.value.rotate,
          noteskin: player1Config.value.noteskin,
          noteStyle: player1Config.value.noteStyle,
          audioOffset: player1Config.value.audioOffset,
          noteScale: player1Config.value.noteScale,
        },
        {
          speedMod: player2Config.value.speedMod,
          reverse: player2Config.value.reverse,
          mirror: player2Config.value.mirror,
          sudden: player2Config.value.sudden,
          hidden: player2Config.value.hidden,
          rotate: player2Config.value.rotate,
          noteskin: player2Config.value.noteskin,
          noteStyle: player2Config.value.noteStyle,
          audioOffset: player2Config.value.audioOffset,
          noteScale: player2Config.value.noteScale,
        },
      ],
      playbackRate: playbackRate.value,
      uiScale: uiScale.value,
      doublePanelGapPx: clampDoublePanelGapPx(doublePanelGapPx.value),
      songSelectPanelWidthPx: clampSongSelectPanelWidthPx(songSelectPanelWidthPx.value),
      batteryLives: batteryLives.value,
      showParticles: showParticles.value,
      cursorEnabled: true,
      cursorStylePreset: cursorStylePreset.value,
      cursorScale: clampRange(cursorScale.value, 0.7, 1.6, 1),
      cursorOpacity: clamp01(cursorOpacity.value, 0.9),
      cursorGlow: clamp01(cursorGlow.value, 0.35),
      cursorTrailsEnabled: cursorTrailsEnabled.value,
      cursorRippleEnabled: cursorRippleEnabled.value,
      cursorRippleDurationMs: Math.round(clampRange(cursorRippleDurationMs.value, 180, 1200, 480)),
      cursorRippleMinScale: clampRange(cursorRippleMinScale.value, 0.2, 2.4, 0.65),
      cursorRippleMaxScale: clampRange(cursorRippleMaxScale.value, 1.2, 12, 6.2),
      cursorRippleOpacity: clamp01(cursorRippleOpacity.value, 0.7),
      cursorRippleLineWidth: clampRange(cursorRippleLineWidth.value, 0.5, 3, 1),
      cursorRippleGlow: clamp01(cursorRippleGlow.value, 0.26),
      chartCacheSize: 8,
      songDirectories: songDirectories.value,
      keyBindings: keyBindingsPayload,
    };
    try {
      await api.saveConfig(cfg);
    } catch (e: unknown) {
      console.error("Failed to save config:", e);
    }
  }

  /** Reset all persisted preferences to factory defaults (same as missing `config.toml`). */
  function resetToFactoryDefaults() {
    masterVolume.value = 80;
    musicVolume.value = 70;
    effectVolume.value = 90;
    metronomeSfxEnabled.value = false;
    metronomeSfxVolume.value = 100;
    metronomeSfxStyle.value = "bright";
    rhythmSfxEnabled.value = true;
    rhythmSfxVolume.value = 100;
    rhythmSfxStyle.value = "bright";
    uiSfxEnabled.value = true;
    uiSfxVolume.value = 70;
    uiSfxStyle.value = "classic";
    audioOffsetMs.value = 0;
    windowDisplayPreset.value = "normal";
    syncWindowBorderlessDom("normal");
    windowWidth.value = null;
    windowHeight.value = null;
    vsync.value = true;
    targetFps.value = 144;
    judgmentStyle.value = "ddr";
    showOffset.value = true;
    lifeType.value = "bar";
    autoPlay.value = false;
    playbackRate.value = 1.0;
    uiScale.value = 1.0;
    doublePanelGapPx.value = DOUBLE_PANEL_GAP_DEFAULT_PX;
    songSelectPanelWidthPx.value = SONG_SELECT_PANEL_WIDTH_DEFAULT_PX;
    batteryLives.value = 3;
    showParticles.value = true;
    cursorEnabled.value = true;
    cursorStylePreset.value = "a";
    cursorScale.value = 1;
    cursorOpacity.value = 0.9;
    cursorGlow.value = 0.35;
    cursorTrailsEnabled.value = true;
    cursorRippleEnabled.value = true;
    cursorRippleDurationMs.value = 480;
    cursorRippleMinScale.value = 0.65;
    cursorRippleMaxScale.value = 6.2;
    cursorRippleOpacity.value = 0.7;
    cursorRippleLineWidth.value = 1;
    cursorRippleGlow.value = 0.26;
    coopMode.value = "solo";
    player1Config.value = defaultPerPlayerConfig();
    player2Config.value = defaultPerPlayerConfig();
    language.value = factoryDefaultLanguage.value;
    theme.value = "default";
    // songDirectories is intentionally NOT reset — preserve user's song library paths
    gameplayPumpDoubleLanes.value = null;
    shortcutOverrides.value = {};
  }

  return {
    configLoaded,
    masterVolume, musicVolume, effectVolume,
    metronomeSfxEnabled, metronomeSfxVolume, metronomeSfxStyle,
    rhythmSfxEnabled, rhythmSfxVolume, rhythmSfxStyle,
    uiSfxEnabled, uiSfxVolume, uiSfxStyle,
    audioOffsetMs,
    windowDisplayPreset, windowWidth, windowHeight, vsync, targetFps,
    judgmentStyle, showOffset, lifeType, autoPlay,
    playbackRate, uiScale, doublePanelGapPx, songSelectPanelWidthPx, batteryLives, showParticles,
    cursorEnabled, cursorStylePreset, cursorScale, cursorOpacity, cursorGlow,
    cursorTrailsEnabled, cursorRippleEnabled, cursorRippleDurationMs,
    cursorRippleMinScale, cursorRippleMaxScale, cursorRippleOpacity,
    cursorRippleLineWidth, cursorRippleGlow,
    coopMode, player1Config, player2Config,
    language, theme, songDirectories,
    gameplayPumpDoubleLanes, shortcutOverrides,
    loadAppConfig, saveAppConfig, resetToFactoryDefaults,
  };
});

