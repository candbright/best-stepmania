import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { SongListItem, ChartInfoItem, ChartInfo, HighScoreInfo } from "@/utils/api";
import type { LastResults } from "@/engine/types";
import type { RoutinePlayerColorId } from "@/constants/routinePlayerColors";
import * as api from "@/utils/api";
import { useLibraryStore } from "./library";
import { useSettingsStore } from "./settings";
import { chartFitsPlayMode, playModeAndCoopForStepsType } from "@/utils/chartPlayMode";

export type PlayMode = "pump-single" | "pump-double" | "pump-routine";

/**
 * Session store — manages the current game session state:
 * selected song/chart, profile, and last results.
 * Separated from persistent settings for single-responsibility.
 */
export const useSessionStore = defineStore("session", () => {
  const library = useLibraryStore();
  const songs = computed<SongListItem[]>({
    get: () => library.songs,
    set: (val) => { library.songs = val; },
  });
  const currentSongIndex = ref(-1);
  const currentChartIndex = ref(0);
  const charts = ref<ChartInfoItem[]>([]);
  const playMode = ref<PlayMode>("pump-single");
  const hasPlayer1 = ref(true);
  const hasPlayer2 = ref(false);
  const p1ChartIndex = ref(0);
  const p2ChartIndex = ref(0);
  const profileId = ref<string | null>(null);
  const profileName = ref("Player");
  const topScores = ref<HighScoreInfo[]>([]);

  const lastResults = ref<LastResults | null>(null);
  const lastResults2 = ref<LastResults | null>(null);
  /** Tracks whether the last score-save IPC call succeeded (null = no save attempted yet). */
  const lastScoreSaved = ref<boolean | null>(null);
  /** When set, gameplay starts from this audio-second with a lead-in instead of from the beginning. */
  const previewFromSecond = ref<number | null>(null);
  /** If true, quitting gameplay should return to editor (used by editor preview play). */
  const previewReturnToEditor = ref(false);
  /** If true, next EditorScreen activation skips full chart reload (keep-alive return from preview). */
  const editorWarmResume = ref(false);
  /** Prefetched chart list + path; consumed by editor `loadAllCharts` after navigating from song select. */
  const editorPrimedCharts = ref<{ path: string; charts: ChartInfo[] } | null>(null);
  /** True when audio pipeline + `audioLoad` already ran before `router.push("/editor")`. */
  const editorEntryAudioPrimed = ref(false);

  function clearEditorEntryPrime(): void {
    editorPrimedCharts.value = null;
    editorEntryAudioPrimed.value = false;
  }
  /** Flag: the editor created/deleted/saved a chart; song list needs re-fetch */
  const needsSongRefresh = ref(false);
  /** Flag: when returning from player options, resume song playback */
  const resumePlaybackOnReturn = ref(false);
  /** Title → 设置：若进入设置前正在播/加载预览，回主界面时恢复播放（与 pauseTitleMusicForOptions / resumeTitleMusicAfterOptions 配套） */
  const resumeTitleMusicAfterOptions = ref(false);
  /** 游玩选歌页返回主界面时置 true，TitleScreen 下次进入 `/` 时打开模式选择（避免仅依赖 URL query，全局 Esc 也会设此标志） */
  const openPlayModeSelectAfterTitleEnter = ref(false);
  /** Flag: when returning from editor, play from beginning */
  const resumeFromEditor = ref(false);
  /** SelectMusic filter state should survive gameplay round trips. */
  const selectFilterDiffMin = ref<number | null>(null);
  const selectFilterDiffMax = ref<number | null>(null);
  const selectFilterSearch = ref("");
  const selectFilterPack = ref("");

  /** Pump Routine: per-layer note display colors (chart '&' layers; default note shape only). */
  const routineP1ColorId = ref<RoutinePlayerColorId>("blue");
  const routineP2ColorId = ref<RoutinePlayerColorId>("red");

  const currentSong = computed(() =>
    currentSongIndex.value >= 0 ? songs.value[currentSongIndex.value] : null,
  );

  const currentChart = computed(() =>
    charts.value[currentChartIndex.value] ?? null,
  );

  const currentDifficulty = computed(
    () => currentChart.value?.difficulty ?? "Medium",
  );

  function syncSessionModeFromChartAtIndex(idx: number): void {
    const chart = charts.value[idx];
    const mapped = playModeAndCoopForStepsType(chart?.stepsType);
    if (!mapped) return;
    playMode.value = mapped.playMode;
    useSettingsStore().coopMode = mapped.coopMode;
    if (mapped.playMode === "pump-double") {
      hasPlayer2.value = false;
      p2ChartIndex.value = p1ChartIndex.value;
    }
  }

  /** Shared core: update index, charts list and default chart selection. */
  function applySelectedSong(index: number): void {
    currentSongIndex.value = index;
    const song = songs.value[index];
    charts.value = song?.charts ?? [];

    // Default chart must match current play mode when possible. Otherwise (e.g. routine mode
    // with p1 still on pump-single) Gameplay loads the same 5-lane chart twice and mirrors it
    // to tracks 5–9 — left/right panels look identical.
    const mode = playMode.value;
    const modeMatches =
      mode === "pump-single" || mode === "pump-double" || mode === "pump-routine";
    const pool = modeMatches
      ? charts.value.filter((c) => chartFitsPlayMode(c, mode))
      : charts.value;
    const pickFrom = pool.length > 0 ? pool : charts.value;

    const medIdx = pickFrom.findIndex((c) => c.difficulty === "Medium");
    const chosen = medIdx >= 0 ? pickFrom[medIdx]! : pickFrom[0];
    let idxInFull = chosen ? charts.value.indexOf(chosen) : 0;
    if (idxInFull < 0) idxInFull = 0;

    currentChartIndex.value = idxInFull;
    p1ChartIndex.value = idxInFull;
    p2ChartIndex.value = idxInFull;
    syncSessionModeFromChartAtIndex(idxInFull);
  }

  async function selectSong(index: number) {
    applySelectedSong(index);
    topScores.value = [];
    await loadTopScores();
  }

  function selectChart(index: number) {
    currentChartIndex.value = index;
    // PlayerOptionsScreen keys off p1ChartIndex / p2ChartIndex; keep them aligned so
    // difficulty picked here survives confirm() (it assigns currentChartIndex from P1/P2).
    p1ChartIndex.value = index;
    p2ChartIndex.value = index;
    syncSessionModeFromChartAtIndex(index);
    void loadTopScores();
  }

  async function loadTopScores() {
    if (!profileId.value || !currentSong.value || !currentChart.value) {
      topScores.value = [];
      return;
    }
    topScores.value = await api.getTopScores(
      profileId.value,
      currentSong.value.path,
      currentChart.value.stepsType,
      currentChart.value.difficulty,
    );
  }

  async function clearCurrentChartTopScores(): Promise<void> {
    if (!profileId.value || !currentSong.value || !currentChart.value) {
      topScores.value = [];
      return;
    }
    await api.clearChartTopScores(
      profileId.value,
      currentSong.value.path,
      currentChart.value.stepsType,
      currentChart.value.difficulty,
    );
    topScores.value = [];
  }

  function setCurrentSongIndexFromPlayer(index: number) {
    if (index < 0 || index >= songs.value.length) return;
    applySelectedSong(index);
    void loadTopScores();
  }

  async function initProfile() {
    const profiles = await api.getProfiles();
    if (profiles.length > 0) {
      profileId.value = profiles[0].id;
      profileName.value = profiles[0].displayName;
    } else {
      const p = await api.createProfile("Player");
      profileId.value = p.id;
      profileName.value = p.displayName;
    }
  }

  return {
    songs, currentSongIndex, currentChartIndex, charts,
    playMode, hasPlayer1, hasPlayer2, p1ChartIndex, p2ChartIndex,
    routineP1ColorId, routineP2ColorId,
    profileId, profileName, topScores, lastResults, lastResults2, lastScoreSaved, previewFromSecond, previewReturnToEditor, editorWarmResume,
    editorPrimedCharts, editorEntryAudioPrimed, clearEditorEntryPrime,
    needsSongRefresh, resumePlaybackOnReturn, resumeTitleMusicAfterOptions, openPlayModeSelectAfterTitleEnter, resumeFromEditor,
    selectFilterDiffMin, selectFilterDiffMax, selectFilterSearch, selectFilterPack,
    currentSong, currentChart, currentDifficulty,
    selectSong, selectChart, initProfile,
    setCurrentSongIndexFromPlayer,
    loadTopScores,
    clearCurrentChartTopScores,
  };
});
