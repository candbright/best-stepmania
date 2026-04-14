import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { SongListItem, ChartInfoItem, HighScoreInfo } from "@/utils/api";
import type { CoopMode, PerPlayerConfig } from "@/engine/types";
import {
  mergeShortcutBindings,
  resolveGameplayKeyMap10,
  eventMatchesBinding,
  type ShortcutId,
} from "@/engine/keyBindings";
import type { RoutinePlayerColorId } from "@/constants/routinePlayerColors";
import { useSettingsStore } from "./settings";
import { useSessionStore } from "./session";
import { useLibraryStore } from "./library";
import type { WindowDisplayPresetId } from "@/constants/windowDisplay";

export type SortMode = "title" | "artist" | "bpm" | "pack";

/**
 * Game store — backwards-compatible facade composing settings, session, and library stores.
 *
 * New code should prefer importing the specific sub-stores directly:
 *   - useSettingsStore() for persistent settings
 *   - useSessionStore() for current game session
 *   - useLibraryStore() for song catalog/search
 *
 * This composite store delegates to the sub-stores so existing code continues to work.
 */
export const useGameStore = defineStore("game", () => {
  const settings = useSettingsStore();
  const session = useSessionStore();
  const library = useLibraryStore();

  // --- Proxy: songs list (shared between library and session for index-based access) ---
  const songs = computed({
    get: () => library.songs,
    set: (val: SongListItem[]) => {
      library.songs = val;
    },
  });

  // --- Delegated session state ---
  const currentSongIndex = computed({
    get: () => session.currentSongIndex,
    set: (v: number) => { session.currentSongIndex = v; },
  });
  const currentChartIndex = computed({
    get: () => session.currentChartIndex,
    set: (v: number) => { session.currentChartIndex = v; },
  });
  const charts = computed({
    get: () => session.charts,
    set: (v: ChartInfoItem[]) => { session.charts = v; },
  });
  const profileId = computed({
    get: () => session.profileId,
    set: (v: string | null) => { session.profileId = v; },
  });
  const profileName = computed({
    get: () => session.profileName,
    set: (v: string) => { session.profileName = v; },
  });
  const topScores = computed({
    get: () => session.topScores,
    set: (v: HighScoreInfo[]) => { session.topScores = v; },
  });
  const lastResults = computed({
    get: () => session.lastResults,
    set: (v) => { session.lastResults = v; },
  });
  const lastResults2 = computed({
    get: () => session.lastResults2,
    set: (v) => { session.lastResults2 = v; },
  });
  const lastScoreSaved = computed({
    get: () => session.lastScoreSaved,
    set: (v: boolean | null) => { session.lastScoreSaved = v; },
  });
  const currentSong = computed(() => session.currentSong);
  const currentChart = computed(() => session.currentChart);
  const currentDifficulty = computed(() => session.currentDifficulty);

  // --- Delegated library state ---
  const sortMode = computed({
    get: () => library.sortMode as SortMode,
    set: (v: SortMode) => { library.sortMode = v; },
  });
  const searchQuery = computed({
    get: () => library.searchQuery,
    set: (v: string) => { library.searchQuery = v; },
  });

  // --- Delegated settings state (writable computed for reactivity) ---
  const configLoaded = computed(() => settings.configLoaded);
  const masterVolume = computed({ get: () => settings.masterVolume, set: (v: number) => { settings.masterVolume = v; } });
  const musicVolume = computed({ get: () => settings.musicVolume, set: (v: number) => { settings.musicVolume = v; } });
  const effectVolume = computed({ get: () => settings.effectVolume, set: (v: number) => { settings.effectVolume = v; } });
  const metronomeSfxEnabled = computed({ get: () => settings.metronomeSfxEnabled, set: (v: boolean) => { settings.metronomeSfxEnabled = v; } });
  const metronomeSfxVolume = computed({ get: () => settings.metronomeSfxVolume, set: (v: number) => { settings.metronomeSfxVolume = v; } });
  const metronomeSfxStyle = computed({
    get: () => settings.metronomeSfxStyle,
    set: (v) => { settings.metronomeSfxStyle = v; },
  });
  const rhythmSfxEnabled = computed({ get: () => settings.rhythmSfxEnabled, set: (v: boolean) => { settings.rhythmSfxEnabled = v; } });
  const rhythmSfxVolume = computed({ get: () => settings.rhythmSfxVolume, set: (v: number) => { settings.rhythmSfxVolume = v; } });
  const rhythmSfxStyle = computed({
    get: () => settings.rhythmSfxStyle,
    set: (v) => { settings.rhythmSfxStyle = v; },
  });
  const uiSfxEnabled = computed({ get: () => settings.uiSfxEnabled, set: (v: boolean) => { settings.uiSfxEnabled = v; } });
  const uiSfxVolume = computed({ get: () => settings.uiSfxVolume, set: (v: number) => { settings.uiSfxVolume = v; } });
  const uiSfxStyle = computed({ get: () => settings.uiSfxStyle, set: (v) => { settings.uiSfxStyle = v; } });
  const audioOffsetMs = computed({ get: () => settings.audioOffsetMs, set: (v: number) => { settings.audioOffsetMs = v; } });
  const windowDisplayPreset = computed({
    get: () => settings.windowDisplayPreset,
    set: (v: WindowDisplayPresetId) => { settings.windowDisplayPreset = v; },
  });
  const windowWidth = computed({ get: () => settings.windowWidth, set: (v: number | null) => { settings.windowWidth = v; } });
  const windowHeight = computed({ get: () => settings.windowHeight, set: (v: number | null) => { settings.windowHeight = v; } });
  const vsync = computed({ get: () => settings.vsync, set: (v: boolean) => { settings.vsync = v; } });
  const targetFps = computed({ get: () => settings.targetFps, set: (v: number) => { settings.targetFps = v; } });
  const judgmentStyle = computed({ get: () => settings.judgmentStyle, set: (v: string) => { settings.judgmentStyle = v; } });
  const showOffset = computed({ get: () => settings.showOffset, set: (v: boolean) => { settings.showOffset = v; } });
  const lifeType = computed({ get: () => settings.lifeType, set: (v: string) => { settings.lifeType = v; } });
  const autoPlay = computed({ get: () => settings.autoPlay, set: (v: boolean) => { settings.autoPlay = v; } });
  const playbackRate = computed({ get: () => settings.playbackRate, set: (v: number) => { settings.playbackRate = v; } });
  const showParticles = computed({ get: () => settings.showParticles, set: (v: boolean) => { settings.showParticles = v; } });
  const cursorEnabled = computed({ get: () => settings.cursorEnabled, set: (v: boolean) => { settings.cursorEnabled = v; } });
  const cursorStylePreset = computed({ get: () => settings.cursorStylePreset, set: (v) => { settings.cursorStylePreset = v; } });
  const cursorScale = computed({ get: () => settings.cursorScale, set: (v: number) => { settings.cursorScale = v; } });
  const cursorOpacity = computed({ get: () => settings.cursorOpacity, set: (v: number) => { settings.cursorOpacity = v; } });
  const cursorGlow = computed({ get: () => settings.cursorGlow, set: (v: number) => { settings.cursorGlow = v; } });
  const cursorTrailsEnabled = computed({ get: () => settings.cursorTrailsEnabled, set: (v: boolean) => { settings.cursorTrailsEnabled = v; } });
  const cursorRippleEnabled = computed({ get: () => settings.cursorRippleEnabled, set: (v: boolean) => { settings.cursorRippleEnabled = v; } });
  const cursorRippleDurationMs = computed({ get: () => settings.cursorRippleDurationMs, set: (v: number) => { settings.cursorRippleDurationMs = v; } });
  const cursorRippleMinScale = computed({ get: () => settings.cursorRippleMinScale, set: (v: number) => { settings.cursorRippleMinScale = v; } });
  const cursorRippleMaxScale = computed({ get: () => settings.cursorRippleMaxScale, set: (v: number) => { settings.cursorRippleMaxScale = v; } });
  const cursorRippleOpacity = computed({ get: () => settings.cursorRippleOpacity, set: (v: number) => { settings.cursorRippleOpacity = v; } });
  const cursorRippleLineWidth = computed({ get: () => settings.cursorRippleLineWidth, set: (v: number) => { settings.cursorRippleLineWidth = v; } });
  const cursorRippleGlow = computed({ get: () => settings.cursorRippleGlow, set: (v: number) => { settings.cursorRippleGlow = v; } });
  const uiScale = computed({ get: () => settings.uiScale, set: (v: number) => { settings.uiScale = v; } });
  const doublePanelGapPx = computed({
    get: () => settings.doublePanelGapPx,
    set: (v: number) => { settings.doublePanelGapPx = v; },
  });
  const batteryLives = computed({ get: () => settings.batteryLives, set: (v: number) => { settings.batteryLives = v; } });
  const coopMode = computed({ get: () => settings.coopMode, set: (v: CoopMode) => { settings.coopMode = v; } });
  const player1Config = computed({ get: () => settings.player1Config, set: (v: PerPlayerConfig) => { settings.player1Config = v; } });
  const player2Config = computed({ get: () => settings.player2Config, set: (v: PerPlayerConfig) => { settings.player2Config = v; } });
  const playMode = computed({ get: () => session.playMode, set: (v) => { session.playMode = v; } });
  const hasPlayer1 = computed({ get: () => session.hasPlayer1, set: (v: boolean) => { session.hasPlayer1 = v; } });
  const hasPlayer2 = computed({ get: () => session.hasPlayer2, set: (v: boolean) => { session.hasPlayer2 = v; } });
  const p1ChartIndex = computed({ get: () => session.p1ChartIndex, set: (v: number) => { session.p1ChartIndex = v; } });
  const p2ChartIndex = computed({ get: () => session.p2ChartIndex, set: (v: number) => { session.p2ChartIndex = v; } });
  const language = computed({ get: () => settings.language, set: (v: string) => { settings.language = v; } });
  const theme = computed({ get: () => settings.theme, set: (v: string) => { settings.theme = v; } });
  const songDirectories = computed({ get: () => settings.songDirectories, set: (v: string[]) => { settings.songDirectories = v; } });

  const mergedShortcutBindings = computed(() => mergeShortcutBindings(settings.shortcutOverrides));
  const resolvedGameplayKeyMap10 = computed(() => resolveGameplayKeyMap10(settings.gameplayPumpDoubleLanes));

  function shortcutMatches(e: KeyboardEvent, id: ShortcutId): boolean {
    const binding = mergedShortcutBindings.value[id];
    return eventMatchesBinding(e, binding);
  }

  const previewFromSecond = computed({
    get: () => session.previewFromSecond,
    set: (v: number | null) => { session.previewFromSecond = v; },
  });
  const previewReturnToEditor = computed({
    get: () => session.previewReturnToEditor,
    set: (v: boolean) => { session.previewReturnToEditor = v; },
  });
  const editorWarmResume = computed({
    get: () => session.editorWarmResume,
    set: (v: boolean) => { session.editorWarmResume = v; },
  });
  const needsSongRefresh = computed({
    get: () => session.needsSongRefresh,
    set: (v: boolean) => { session.needsSongRefresh = v; },
  });
  const resumePlaybackOnReturn = computed({
    get: () => session.resumePlaybackOnReturn,
    set: (v: boolean) => { session.resumePlaybackOnReturn = v; },
  });
  const resumeFromEditor = computed({
    get: () => session.resumeFromEditor,
    set: (v: boolean) => { session.resumeFromEditor = v; },
  });
  const selectFilterDiffMin = computed({
    get: () => session.selectFilterDiffMin,
    set: (v: number | null) => { session.selectFilterDiffMin = v; },
  });
  const selectFilterDiffMax = computed({
    get: () => session.selectFilterDiffMax,
    set: (v: number | null) => { session.selectFilterDiffMax = v; },
  });
  const selectFilterSearch = computed({
    get: () => session.selectFilterSearch,
    set: (v: string) => { session.selectFilterSearch = v; },
  });
  const selectFilterPack = computed({
    get: () => session.selectFilterPack,
    set: (v: string) => { session.selectFilterPack = v; },
  });
  const routineP1ColorId = computed({
    get: () => session.routineP1ColorId,
    set: (v: RoutinePlayerColorId) => { session.routineP1ColorId = v; },
  });
  const routineP2ColorId = computed({
    get: () => session.routineP2ColorId,
    set: (v: RoutinePlayerColorId) => { session.routineP2ColorId = v; },
  });

  /** EditorScreen registers this to block global back / toolbar back when there are unsaved edits. */
  const editorBackGuard = ref<null | (() => Promise<boolean>)>(null);
  function setEditorBackGuard(fn: null | (() => Promise<boolean>)) {
    editorBackGuard.value = fn;
  }
  async function runEditorBackGuard(): Promise<boolean> {
    const fn = editorBackGuard.value;
    if (!fn) return true;
    return fn();
  }

  // --- Delegated actions ---
  async function loadAppConfig() { return settings.loadAppConfig(); }
  async function saveAppConfig() { return settings.saveAppConfig(session.profileName); }

  async function resetAllSettingsToDefaults() {
    settings.resetToFactoryDefaults();
    await settings.saveAppConfig(session.profileName);
  }

  async function loadSongs(paths?: string[], options?: { force?: boolean }) {
    const dirs = paths ?? settings.songDirectories;
    await library.loadSongs(dirs, options);
  }

  async function refreshSongsList() {
    await library.refreshSongsList();
  }

  async function setSortMode(mode: SortMode) {
    await library.setSortMode(mode);
  }

  async function search(query: string) {
    await library.search(query);
  }

  async function selectSong(index: number) { return session.selectSong(index); }
  function selectChart(index: number) { return session.selectChart(index); }
  async function clearCurrentChartTopScores() {
    return session.clearCurrentChartTopScores();
  }
  async function initProfile() { return session.initProfile(); }
  function setCurrentSongIndexFromPlayer(index: number) {
    return session.setCurrentSongIndexFromPlayer(index);
  }

  return {
    songs, currentSongIndex, currentChartIndex, charts,
    sortMode, searchQuery, profileId, profileName, topScores, lastResults, lastResults2, lastScoreSaved, previewFromSecond, previewReturnToEditor, editorWarmResume, needsSongRefresh, resumePlaybackOnReturn, resumeFromEditor,
    selectFilterDiffMin, selectFilterDiffMax, selectFilterSearch, selectFilterPack,
    configLoaded,
    masterVolume, musicVolume, effectVolume,
    metronomeSfxEnabled, metronomeSfxVolume, metronomeSfxStyle,
    rhythmSfxEnabled, rhythmSfxVolume, rhythmSfxStyle,
    uiSfxEnabled, uiSfxVolume, uiSfxStyle,
    audioOffsetMs,
    windowDisplayPreset, windowWidth, windowHeight, vsync, targetFps, judgmentStyle, showOffset,
    lifeType, autoPlay, playbackRate, showParticles,
    cursorEnabled, cursorStylePreset, cursorScale, cursorOpacity, cursorGlow,
    cursorTrailsEnabled, cursorRippleEnabled, cursorRippleDurationMs,
    cursorRippleMinScale, cursorRippleMaxScale, cursorRippleOpacity,
    cursorRippleLineWidth, cursorRippleGlow,
    uiScale, doublePanelGapPx, batteryLives,
    coopMode, player1Config, player2Config,
    playMode, hasPlayer1, hasPlayer2, p1ChartIndex, p2ChartIndex,
    routineP1ColorId, routineP2ColorId,
    setEditorBackGuard, runEditorBackGuard,
    language, theme, songDirectories,
    gameplayPumpDoubleLanes: computed({
      get: () => settings.gameplayPumpDoubleLanes,
      set: (v: string[] | null) => { settings.gameplayPumpDoubleLanes = v; },
    }),
    shortcutOverrides: computed({
      get: () => settings.shortcutOverrides,
      set: (v) => { settings.shortcutOverrides = v; },
    }),
    mergedShortcutBindings,
    resolvedGameplayKeyMap10,
    shortcutMatches,
    currentSong, currentChart, currentDifficulty,
    loadAppConfig, saveAppConfig, resetAllSettingsToDefaults,
    loadSongs, refreshSongsList, setSortMode, search, selectSong, selectChart, clearCurrentChartTopScores, initProfile,
    setCurrentSongIndexFromPlayer,
  };
});
