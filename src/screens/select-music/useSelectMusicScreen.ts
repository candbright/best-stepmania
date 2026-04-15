import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "@/stores/game";
import { useSessionStore } from "@/stores/session";
import { usePlayerStore } from "@/stores/player";
import { useLibraryStore } from "@/stores/library";
import { useI18n } from "@/i18n";
import * as api from "@/utils/api";
import { playMenuMove, playMenuConfirm, playMenuBack, setUiSfxVolume } from "@/utils/sfx";
import { syncSelectionToFilteredSongs } from "./syncSelectionToFilteredSongs";
import { ensureMinElapsed } from "@/utils/loadingGate";
import { useBlockingOverlayStore } from "@/stores/blockingOverlay";
import { displayPercentFromDpRatio } from "@/engine/types";
import { gradeTextGradientStyle } from "@/utils/gradeColors";
import { chartFitsPlayMode } from "@/utils/chartPlayMode";
import { PHYSICAL_ROOT_PACK } from "@/constants/songLibrary";

export function useSelectMusicScreen() {
  const router = useRouter();
  const game = useGameStore();
  const sessionStore = useSessionStore();
  const player = usePlayerStore();
  const library = useLibraryStore();
  const blockingOverlay = useBlockingOverlayStore();
  const { t } = useI18n();
  const bannerCache = ref<Record<string, string>>({});
  const showFilterModal = ref(false);
  const showClearTopScoresModal = ref(false);
  const clearingTopScores = ref(false);
  const confirmSelectionBusy = ref(false);
  const songScrollRef = ref<HTMLElement | null>(null);
  let loadAbortCtrl: AbortController | null = null;

  function formatPlayedAt(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  }

  function cancelScreenLoad() {
    loadAbortCtrl?.abort();
    loadAbortCtrl = null;
    blockingOverlay.hide();
  }

  const DIFF_COLORS: Record<string, string> = {
    Beginner: "#00e5ff",
    Easy: "#69f0ae",
    Medium: "#ffd740",
    Hard: "#ff6d00",
    Challenge: "#e040fb",
    Edit: "#78909c",
  };

  const diffMin = computed({
    get: () => game.selectFilterDiffMin,
    set: (v: number | null) => {
      game.selectFilterDiffMin = v;
    },
  });
  const diffMax = computed({
    get: () => game.selectFilterDiffMax,
    set: (v: number | null) => {
      game.selectFilterDiffMax = v;
    },
  });
  const filterSearch = computed({
    get: () => game.selectFilterSearch,
    set: (v: string) => {
      game.selectFilterSearch = v;
    },
  });
  const filterPack = computed({
    get: () => game.selectFilterPack,
    set: (v: string) => {
      game.selectFilterPack = v;
    },
  });

  const hasActiveFilter = computed(
    () =>
      diffMin.value !== null ||
      diffMax.value !== null ||
      filterSearch.value !== "" ||
      filterPack.value !== "" ||
      library.showFavoritesOnly,
  );

  const activeFilterCount = computed(() => {
    let n = 0;
    if (diffMin.value !== null || diffMax.value !== null) n++;
    if (filterSearch.value !== "") n++;
    if (filterPack.value !== "") n++;
    if (library.showFavoritesOnly) n++;
    return n;
  });

  const filteredSongs = computed(() => {
    return game.songs.filter((s) => {
      if (library.showFavoritesOnly && !library.favorites.has(s.path)) return false;
      if (filterSearch.value) {
        const q = filterSearch.value.toLowerCase();
        if (!s.title.toLowerCase().includes(q) && !(s.artist ?? "").toLowerCase().includes(q)) return false;
      }
      if (filterPack.value && s.pack !== filterPack.value) return false;

      const charts = s.charts ?? [];
      let hasMatchingChart = false;

      for (const c of charts) {
        if (game.playMode && !chartFitsPlayMode(c, game.playMode)) continue;
        if (diffMin.value !== null && c.meter < diffMin.value) continue;
        if (diffMax.value !== null && c.meter > diffMax.value) continue;
        hasMatchingChart = true;
        break;
      }

      return hasMatchingChart;
    });
  });

  const filteredCharts = computed(() => {
    let charts = game.charts ?? [];
    if (game.playMode) {
      charts = charts.filter((c) => chartFitsPlayMode(c, game.playMode));
    }
    if (diffMin.value !== null || diffMax.value !== null) {
      charts = charts.filter((c) => {
        const m = c.meter;
        if (diffMin.value !== null && m < diffMin.value) return false;
        if (diffMax.value !== null && m > diffMax.value) return false;
        return true;
      });
    }
    return charts;
  });

  const collapsedPacks = ref<Set<string>>(new Set());

  const ROOT_PACK_KEY = "__ROOT__";

  const groupedSongs = computed(() => {
    const indexByPath = new Map<string, number>();
    game.songs.forEach((s, i) => indexByPath.set(s.path, i));
    const groups: {
      packKey: string;
      packLabel: string;
      songs: { song: (typeof game.songs)[0]; idx: number }[];
    }[] = [];
    const packMap = new Map<string, (typeof groups)[0]>();
    filteredSongs.value.forEach((song) => {
      const idx = indexByPath.get(song.path) ?? -1;
      if (idx < 0) return;
      const pack = (song.pack ?? "").trim();
      const isRootPack = pack === "" || pack === PHYSICAL_ROOT_PACK;
      const packKey = isRootPack ? ROOT_PACK_KEY : pack;
      let g = packMap.get(packKey);
      if (!g) {
        g = {
          packKey,
          packLabel: isRootPack ? t("select.rootPack") : pack,
          songs: [] as (typeof groups)[0]["songs"],
        };
        packMap.set(packKey, g);
        groups.push(g);
      }
      g.songs.push({ song, idx });
    });
    const showEmptyRoot = filterPack.value === "" && !packMap.has(ROOT_PACK_KEY);
    if (showEmptyRoot) {
      groups.unshift({
        packKey: ROOT_PACK_KEY,
        packLabel: t("select.rootPack"),
        songs: [] as (typeof groups)[0]["songs"],
      });
    }
    return groups;
  });

  const existingPacks = computed(() => {
    const uniq = new Set<string>();
    for (const s of game.songs) {
      const p = (s.pack ?? "").trim();
      if (p && p !== PHYSICAL_ROOT_PACK) uniq.add(p);
    }
    return Array.from(uniq).sort((a, b) => a.localeCompare(b));
  });

  const canPlayCurrentSong = computed(() => {
    if (!game.currentSong) return false;
    return (game.currentSong.charts?.length ?? 0) > 0;
  });

  function ensureCurrentSongVisible() {
    requestAnimationFrame(() => {
      const container = songScrollRef.value;
      if (!container || game.currentSongIndex < 0) return;
      const selected = container.querySelector(".song-row.selected") as HTMLElement | null;
      selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  function loadBannerLazy(idx: number) {
    const song = game.songs[idx];
    if (!song || bannerCache.value[song.path]) return;
    const load = async () => {
      try {
        const assetPath = await api.getSongAssetPath(song.path, "banner");
        bannerCache.value[song.path] = await api.readFileBase64(assetPath);
      } catch {
        /* no banner */
      }
    };
    if (typeof requestIdleCallback !== "undefined") requestIdleCallback(() => load(), { timeout: 2000 });
    else setTimeout(load, 100);
  }

  function selectSong(idx: number) {
    game.selectSong(idx);
    playMenuMove();
    const queueSynced =
      player.queue.length === game.songs.length && player.queue.every((s, i) => s.path === game.songs[i]?.path);
    if (!queueSynced) {
      player.setQueue(game.songs, idx);
    } else {
      player.playSongAt(idx);
    }
    loadBannerLazy(idx);
  }

  function focusSongByDelta(delta: number) {
    if (groupedSongs.value.length === 0) return;

    const currentPath = game.currentSong?.path;
    const currentGroupIndex = groupedSongs.value.findIndex((group) =>
      group.songs.some(({ song }) => song.path === currentPath),
    );

    const fallbackGroupIndex = currentGroupIndex >= 0 ? currentGroupIndex : 0;
    const targetGroup = groupedSongs.value[fallbackGroupIndex];
    if (!targetGroup) return;

    const currentSongIndexInGroup = targetGroup.songs.findIndex(({ song }) => song.path === currentPath);
    const currentIndexInGroup = currentSongIndexInGroup >= 0 ? currentSongIndexInGroup : 0;
    const nextIndexInGroup = (currentIndexInGroup + delta + targetGroup.songs.length) % targetGroup.songs.length;
    const nextSong = targetGroup.songs[nextIndexInGroup];
    if (!nextSong) return;

    if (nextSong.idx !== game.currentSongIndex) {
      selectSong(nextSong.idx);
      ensureCurrentSongVisible();
    }
  }

  async function confirmSelection() {
    if (confirmSelectionBusy.value) return;
    if (!canPlayCurrentSong.value) {
      return;
    }
    confirmSelectionBusy.value = true;
    loadAbortCtrl = new AbortController();
    blockingOverlay.show({
      message: t("loadingPhase.preparing"),
      onCancel: cancelScreenLoad,
      onRetry: null,
    });
    const started = performance.now();
    try {
      blockingOverlay.updateMessage(t("loadingPhase.audio"));
      await player.waitForLoadComplete(10000, loadAbortCtrl.signal);
      if (loadAbortCtrl?.signal.aborted) return;
      if (player.status === "loading") {
        throw new Error("Audio load timeout");
      }
      await player.stopForGame();
      playMenuConfirm();
      blockingOverlay.updateMessage(t("loadingPhase.navigate"));
      if (game.playMode === "pump-single") {
        const i = game.currentChartIndex;
        const charts = game.charts;
        if (i >= 0 && i < charts.length && chartFitsPlayMode(charts[i]!, game.playMode)) {
          game.p1ChartIndex = i;
          game.p2ChartIndex = i;
        }
      }
      if (game.currentSong) await router.push("/player-options");
    } catch {
      blockingOverlay.setFailed(t("loadingOverlay.failed"), () => {
        void confirmSelection();
      });
    } finally {
      if (loadAbortCtrl?.signal.aborted) {
        loadAbortCtrl = null;
        confirmSelectionBusy.value = false;
        return;
      }
      await ensureMinElapsed(started, 1500);
      loadAbortCtrl = null;
      confirmSelectionBusy.value = false;
    }
  }

  function activateCurrentSelection() {
    if (game.currentSongIndex < 0 || !game.currentSong) return;
    void confirmSelection();
  }

  function cycleChartByDelta(delta: number) {
    if (filteredCharts.value.length === 0) return;
    const currentIdx = filteredCharts.value.findIndex((chart) => chart.chartIndex === game.currentChartIndex);
    const baseIdx = currentIdx >= 0 ? currentIdx : 0;
    const nextIdx = (baseIdx + delta + filteredCharts.value.length) % filteredCharts.value.length;
    const nextChart = filteredCharts.value[nextIdx];
    if (!nextChart || nextChart.chartIndex === game.currentChartIndex) return;
    game.selectChart(nextChart.chartIndex);
    playMenuMove();
  }

  function togglePack(packKey: string) {
    if (collapsedPacks.value.has(packKey)) collapsedPacks.value.delete(packKey);
    else collapsedPacks.value.add(packKey);
    collapsedPacks.value = new Set(collapsedPacks.value);
  }

  function onFilterClear() {
    diffMin.value = null;
    diffMax.value = null;
    filterSearch.value = "";
    filterPack.value = "";
  }

  function onFilterApply() {
    // filter state is already updated via v-model
  }

  function goBack() {
    playMenuBack();
    sessionStore.openPlayModeSelectAfterTitleEnter = true;
    void router.push("/");
  }

  function cycleSortMode() {
    const modes = ["title", "artist", "bpm", "pack"] as const;
    const cur = modes.indexOf(game.sortMode);
    game.setSortMode(modes[(cur + 1) % modes.length]);
  }

  async function toggleFavorite(songPath: string) {
    await library.toggleFavorite(songPath);
  }

  function cycleShowFavoritesOnly() {
    library.showFavoritesOnly = !library.showFavoritesOnly;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (showFilterModal.value || showClearTopScoresModal.value) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      focusSongByDelta(e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      cycleChartByDelta(e.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      activateCurrentSelection();
    }
  }

  function preloadAllBanners() {
    const batchSize = 5;
    let i = 0;
    function nextBatch() {
      const end = Math.min(i + batchSize, game.songs.length);
      for (; i < end; i++) {
        loadBannerLazy(i);
      }
      if (i < game.songs.length) {
        setTimeout(nextBatch, 50);
      }
    }
    nextBatch();
  }

  const sortLabel = computed(() => t(`select.sort.${game.sortMode}` as string));

  function difficultyLabel(diff: string) {
    const key = `difficulty.${diff}`;
    const translated = t(key);
    return translated === key ? diff : translated;
  }

  function stepsTypeLabel(stepsType: string) {
    const key = `stepsType.${stepsType}`;
    const translated = t(key);
    if (translated !== key) return translated;
    return stepsType.replace("pump-", "").replace("dance-", "");
  }

  function onClearTopScores() {
    if (!game.profileId || game.topScores.length === 0) return;
    showClearTopScoresModal.value = true;
  }

  async function onClearTopScoresConfirmed() {
    if (clearingTopScores.value) return;
    if (!game.profileId || game.topScores.length === 0) return;
    clearingTopScores.value = true;
    try {
      await game.clearCurrentChartTopScores();
    } catch (e: unknown) {
      console.error(e);
    } finally {
      clearingTopScores.value = false;
    }
  }

  onMounted(() => {
    setUiSfxVolume((game.uiSfxVolume ?? 70) / 100);
    void sessionStore.loadTopScores();
    void library.loadFavorites();
    window.addEventListener("keydown", onKeyDown);

    if (game.resumePlaybackOnReturn) {
      game.resumePlaybackOnReturn = false;
      if (game.currentSongIndex >= 0) {
        player.playSongAt(game.currentSongIndex);
      }
      ensureCurrentSongVisible();
      preloadAllBanners();
      void syncSelectionToFilteredSongs(filteredSongs.value, loadBannerLazy);
      return;
    }

    if (player.queue.length === 0 && game.songs.length > 0) {
      player.setQueue(game.songs, 0);
      if (player.status === "idle") {
        player.playDefaultMusic();
      }
      ensureCurrentSongVisible();
      preloadAllBanners();
    } else {
      ensureCurrentSongVisible();
      preloadAllBanners();
    }
    void syncSelectionToFilteredSongs(filteredSongs.value, loadBannerLazy);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", onKeyDown);
    cancelScreenLoad();
  });

  watch(() => game.currentSongIndex, () => ensureCurrentSongVisible());

  watch(
    () => filteredSongs.value.map((s) => s.path).join("\0"),
    () => {
      void syncSelectionToFilteredSongs(filteredSongs.value, loadBannerLazy);
    },
  );

  return {
    t,
    game,
    bannerCache,
    showFilterModal,
    showClearTopScoresModal,
    clearingTopScores,
    confirmSelectionBusy,
    songScrollRef,
    DIFF_COLORS,
    ROOT_PACK_KEY,
    groupedSongs,
    collapsedPacks,
    selectSong,
    confirmSelection,
    difficultyLabel,
    stepsTypeLabel,
    filteredCharts,
    onClearTopScores,
    onClearTopScoresConfirmed,
    formatPlayedAt,
    canPlayCurrentSong,
    diffMin,
    diffMax,
    filterSearch,
    filterPack,
    existingPacks,
    onFilterApply,
    onFilterClear,
    goBack,
    sortLabel,
    cycleSortMode,
    hasActiveFilter,
    activeFilterCount,
    togglePack,
    displayPercentFromDpRatio,
    gradeTextGradientStyle,
    toggleFavorite,
    cycleShowFavoritesOnly,
    showFavoritesOnly: computed(() => library.showFavoritesOnly),
    isFavorite: (path: string) => library.isFavorite(path),
  };
}
