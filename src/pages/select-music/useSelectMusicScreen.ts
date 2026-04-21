import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "@/shared/stores/session";
import { usePlayerStore } from "@/shared/stores/player";
import { useLibraryStore } from "@/shared/stores/library";
import { useSettingsStore } from "@/shared/stores/settings";
import { useSongRandomStore } from "@/shared/stores/songRandom";
import { useI18n } from "@/shared/i18n";
import * as api from "@/shared/api";
import { playMenuMove, playMenuConfirm, playMenuBack, setUiSfxVolume } from "@/shared/lib/sfx";
import { syncSelectionToFilteredSongs } from "./syncSelectionToFilteredSongs";
import { ensureMinElapsed } from "@/shared/lib/loadingGate";
import { useBlockingOverlayStore } from "@/shared/stores/blockingOverlay";
import { displayPercentFromDpRatio } from "@/shared/lib/engine/types";
import { gradeTextGradientStyle } from "@/shared/constants/gradeColors";
import { chartFitsPlayMode } from "@/shared/lib/chartPlayMode";
import { PHYSICAL_ROOT_PACK } from "@/shared/constants/songLibrary";
import { logDebug, logError, logEvent } from "@/shared/lib/devLog";

export function useSelectMusicScreen() {
  const router = useRouter();
  const session = useSessionStore();
  const player = usePlayerStore();
  const library = useLibraryStore();
  const settings = useSettingsStore();
  const songRandom = useSongRandomStore();
  const blockingOverlay = useBlockingOverlayStore();
  const { t } = useI18n();
  const bannerCache = ref<Record<string, string>>({});
  const bannerLoadQueue: number[] = [];
  const queuedBannerIndices = new Set<number>();
  const bannerTouchOrder: string[] = [];
  let bannerLoadsInFlight = 0;
  const BANNER_CONCURRENCY = 3;
  const BANNER_CACHE_LIMIT = 80;
  const showFilterModal = ref(false);
  const showClearTopScoresModal = ref(false);
  const clearingTopScores = ref(false);
  const confirmSelectionBusy = ref(false);
  const refreshing = ref(false);
  const randomToast = ref("");
  const songScrollRef = ref<HTMLElement | null>(null);
  let randomToastTimer: ReturnType<typeof setTimeout> | null = null;
  let loadAbortCtrl: AbortController | null = null;

  function markPerf(name: string, started: number) {
    if (!import.meta.env.DEV) return;
    const ms = performance.now() - started;
    logDebug("SelectMusicPerf", `${name}=${ms.toFixed(2)}ms`);
  }

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
    get: () => session.selectFilterDiffMin,
    set: (v: number | null) => {
      session.selectFilterDiffMin = v;
    },
  });
  const diffMax = computed({
    get: () => session.selectFilterDiffMax,
    set: (v: number | null) => {
      session.selectFilterDiffMax = v;
    },
  });
  const filterSearch = computed({
    get: () => session.selectFilterSearch,
    set: (v: string) => {
      session.selectFilterSearch = v;
    },
  });
  const filterPack = computed({
    get: () => session.selectFilterPack,
    set: (v: string) => {
      session.selectFilterPack = v;
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
    const started = performance.now();
    const result = library.songs.filter((s) => {
      if (library.showFavoritesOnly && !library.favorites.has(s.path)) return false;
      if (filterSearch.value) {
        const q = filterSearch.value.toLowerCase();
        if (!s.title.toLowerCase().includes(q) && !(s.artist ?? "").toLowerCase().includes(q)) return false;
      }
      if (filterPack.value && s.pack !== filterPack.value) return false;

      const charts = s.charts ?? [];
      // Allow songs with no charts to pass through (consistent with EditorSongSelectScreen)
      if (charts.length === 0) return true;

      let hasMatchingChart = false;
      for (const c of charts) {
        if (session.playMode && !chartFitsPlayMode(c, session.playMode)) continue;
        if (diffMin.value !== null && c.meter < diffMin.value) continue;
        if (diffMax.value !== null && c.meter > diffMax.value) continue;
        hasMatchingChart = true;
        break;
      }

      return hasMatchingChart;
    });
    markPerf("select.filter.ms", started);
    return result;
  });

  const filteredCharts = computed(() => {
    let charts = session.charts ?? [];
    if (session.playMode) {
      charts = charts.filter((c) => chartFitsPlayMode(c, session.playMode));
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
    const started = performance.now();
    const indexByPath = new Map<string, number>();
    library.songs.forEach((s, i) => indexByPath.set(s.path, i));
    const groups: {
      packKey: string;
      packLabel: string;
      songs: { song: (typeof library.songs)[0]; idx: number }[];
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
    markPerf("select.group.ms", started);
    return groups;
  });

  const existingPacks = computed(() => {
    const uniq = new Set<string>();
    for (const s of library.songs) {
      const p = (s.pack ?? "").trim();
      if (p && p !== PHYSICAL_ROOT_PACK) uniq.add(p);
    }
    return Array.from(uniq).sort((a, b) => a.localeCompare(b));
  });

  const canPlayCurrentSong = computed(() => {
    if (!session.currentSong) return false;
    return (session.currentSong.charts?.length ?? 0) > 0;
  });

  function ensureCurrentSongVisible() {
    requestAnimationFrame(() => {
      const container = songScrollRef.value;
      if (!container || session.currentSongIndex < 0) return;
      const selected = container.querySelector(".song-row.selected") as HTMLElement | null;
      selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  function touchBanner(path: string) {
    const pos = bannerTouchOrder.indexOf(path);
    if (pos >= 0) {
      bannerTouchOrder.splice(pos, 1);
    }
    bannerTouchOrder.push(path);
    while (bannerTouchOrder.length > BANNER_CACHE_LIMIT) {
      const evictPath = bannerTouchOrder.shift();
      if (!evictPath) break;
      if (evictPath in bannerCache.value) {
        const next = { ...bannerCache.value };
        delete next[evictPath];
        bannerCache.value = next;
      }
    }
  }

  async function runBannerQueue() {
    while (bannerLoadsInFlight < BANNER_CONCURRENCY && bannerLoadQueue.length > 0) {
      const idx = bannerLoadQueue.shift();
      if (idx == null) break;
      queuedBannerIndices.delete(idx);
      const song = library.songs[idx];
      if (!song || bannerCache.value[song.path]) continue;
      bannerLoadsInFlight++;
      try {
        const assetPath = await api.getSongAssetPath(song.path, "banner");
        const encoded = await api.readFileBase64(assetPath);
        bannerCache.value[song.path] = encoded;
        touchBanner(song.path);
      } catch {
        /* no banner */
      } finally {
        bannerLoadsInFlight--;
      }
    }
  }

  function loadBannerLazy(idx: number) {
    const song = library.songs[idx];
    if (!song || bannerCache.value[song.path]) return;
    if (queuedBannerIndices.has(idx)) return;
    queuedBannerIndices.add(idx);
    bannerLoadQueue.push(idx);
    void runBannerQueue();
  }

  function selectSong(idx: number) {
    void session.selectSong(idx);
    playMenuMove();
    const queueSynced =
      player.queue.length === library.songs.length && player.queue.every((s, i) => s.path === library.songs[i]?.path);
    if (!queueSynced) {
      player.setQueue(library.songs, idx);
    } else {
      player.playSongAt(idx);
    }
    loadBannerLazy(idx);
  }

  function showRandomToast(message: string) {
    randomToast.value = message;
    if (randomToastTimer) {
      clearTimeout(randomToastTimer);
    }
    randomToastTimer = setTimeout(() => {
      randomToast.value = "";
      randomToastTimer = null;
    }, 1600);
  }

  function pickRandomSong() {
    const filteredPaths = filteredSongs.value.map((song) => song.path);
    const randomResult = songRandom.pickFromFiltered(filteredPaths);
    if (randomResult.empty || !randomResult.picked) {
      showRandomToast(t("select.random.empty"));
      logEvent({
        namespace: "SelectMusic",
        op: "SelectMusic.random.empty",
        severity: "info",
        recoverable: true,
      });
      return;
    }
    if (randomResult.reset) {
      logEvent({
        namespace: "SelectMusic",
        op: "SelectMusic.random.pool_reset",
        severity: "info",
        recoverable: true,
        context: { size: filteredPaths.length },
      });
    }
    const pickedIndex = library.songs.findIndex((song) => song.path === randomResult.picked);
    if (pickedIndex < 0) {
      logError("SelectMusic", "random pick not found in library songs:", randomResult.picked);
      return;
    }
    selectSong(pickedIndex);
    ensureCurrentSongVisible();
    logEvent({
      namespace: "SelectMusic",
      op: "SelectMusic.random.pick",
      severity: "info",
      recoverable: true,
      context: { songPath: randomResult.picked, filteredCount: filteredPaths.length },
    });
  }

  function focusSongByDelta(delta: number) {
    if (groupedSongs.value.length === 0) return;

    const currentPath = session.currentSong?.path;
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

    if (nextSong.idx !== session.currentSongIndex) {
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
      if (session.playMode === "pump-single") {
        const i = session.currentChartIndex;
        const charts = session.charts;
        if (i >= 0 && i < charts.length && chartFitsPlayMode(charts[i]!, session.playMode)) {
          session.p1ChartIndex = i;
          session.p2ChartIndex = i;
        }
      }
      if (session.currentSong) await router.push("/player-options");
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
    if (session.currentSongIndex < 0 || !session.currentSong) return;
    void confirmSelection();
  }

  function cycleChartByDelta(delta: number) {
    if (filteredCharts.value.length === 0) return;
    const currentIdx = filteredCharts.value.findIndex((chart) => chart.chartIndex === session.currentChartIndex);
    const baseIdx = currentIdx >= 0 ? currentIdx : 0;
    const nextIdx = (baseIdx + delta + filteredCharts.value.length) % filteredCharts.value.length;
    const nextChart = filteredCharts.value[nextIdx];
    if (!nextChart || nextChart.chartIndex === session.currentChartIndex) return;
    session.selectChart(nextChart.chartIndex);
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
    library.showFavoritesOnly = false;
  }

  function onFilterApply() {
    // filter state is already updated via v-model
  }

  function goBack() {
    playMenuBack();
    session.openPlayModeSelectAfterTitleEnter = true;
    void router.push("/");
  }

  function cycleSortMode() {
    const modes = ["title", "artist", "bpm", "pack"] as const;
    const cur = modes.indexOf(library.sortMode);
    void library.setSortMode(modes[(cur + 1) % modes.length]);
  }

  async function refreshSongs() {
    refreshing.value = true;
    try {
      await library.refreshSongsList();
      session.needsSongRefresh = false;
      await library.loadPacks();
    } finally {
      refreshing.value = false;
    }
  }

  async function toggleFavorite(songPath: string) {
    await library.toggleFavorite(songPath);
  }

  function setShowFavoritesOnly(value: boolean) {
    library.showFavoritesOnly = value;
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
    const center = Math.max(0, session.currentSongIndex);
    const maxPreload = Math.min(library.songs.length, 80);
    for (let step = 0; step < maxPreload; step++) {
      const right = center + step;
      const left = center - step;
      if (right < library.songs.length) {
        loadBannerLazy(right);
      }
      if (left >= 0) {
        loadBannerLazy(left);
      }
      if (bannerLoadQueue.length >= maxPreload) {
        break;
      }
    }
  }

  const sortLabel = computed(() => {
    const key = `select.sort.${library.sortMode}` as const;
    const translated = t(key);
    if (translated !== key) return translated;
    return t("select.sort.default");
  });

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
    if (!session.profileId || session.topScores.length === 0) return;
    showClearTopScoresModal.value = true;
  }

  async function onClearTopScoresConfirmed() {
    if (clearingTopScores.value) return;
    if (!session.profileId || session.topScores.length === 0) return;
    clearingTopScores.value = true;
    try {
      await session.clearCurrentChartTopScores();
    } catch (e: unknown) {
      logError("SelectMusic", "clearCurrentChartTopScores failed:", e);
    } finally {
      clearingTopScores.value = false;
    }
  }

  onMounted(() => {
    setUiSfxVolume((settings.uiSfxVolume ?? 70) / 100);
    void session.loadTopScores();
    void library.loadFavorites();
    window.addEventListener("keydown", onKeyDown);

    if (session.resumePlaybackOnReturn) {
      session.resumePlaybackOnReturn = false;
      if (session.currentSongIndex >= 0 && library.songs.length > 0) {
        const idx = session.currentSongIndex;
        const queueSynced =
          player.queue.length === library.songs.length &&
          player.queue.every((s, i) => s.path === library.songs[i]?.path);
        if (!queueSynced) {
          player.setQueue(library.songs, idx);
        }
        player.playSongAt(idx);
      }
      ensureCurrentSongVisible();
      preloadAllBanners();
      void syncSelectionToFilteredSongs(filteredSongs.value, loadBannerLazy);
      return;
    }

    if (player.queue.length === 0 && library.songs.length > 0) {
      const startIdx =
        session.currentSongIndex >= 0
          ? session.currentSongIndex
          : Math.floor(Math.random() * library.songs.length);
      logDebug("SelectMusic", "initial select-music playback setQueue", {
        reason: "empty_player_queue_on_mount",
        songsCount: library.songs.length,
        sessionSongIndex: session.currentSongIndex,
        startIdx,
        startSongPath: library.songs[startIdx]?.path ?? null,
      });
      player.setQueue(library.songs, startIdx);
      if (player.status === "idle") {
        logDebug("SelectMusic", "play default music after initial setQueue", {
          reason: "player_idle_after_setQueue",
        });
        player.playDefaultMusic();
      }
      ensureCurrentSongVisible();
      preloadAllBanners();
      player.preloadAll(library.songs);
    } else {
      ensureCurrentSongVisible();
      preloadAllBanners();
    }
    void syncSelectionToFilteredSongs(filteredSongs.value, loadBannerLazy);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", onKeyDown);
    cancelScreenLoad();
    if (randomToastTimer) {
      clearTimeout(randomToastTimer);
      randomToastTimer = null;
    }
    songRandom.clearState();
  });

  watch(() => session.currentSongIndex, () => ensureCurrentSongVisible());

  watch(
    () => [
      filteredSongs.value.length,
      filterSearch.value,
      filterPack.value,
      diffMin.value,
      diffMax.value,
      library.showFavoritesOnly,
      session.playMode,
      library.songs.length,
    ] as const,
    () => {
      void syncSelectionToFilteredSongs(filteredSongs.value, loadBannerLazy);
    },
  );

  return {
    t,
    session,
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
    refreshSongs,
    refreshing,
    hasActiveFilter,
    activeFilterCount,
    togglePack,
    displayPercentFromDpRatio,
    gradeTextGradientStyle,
    toggleFavorite,
    cycleShowFavoritesOnly,
    pickRandomSong,
    randomToast,
    setShowFavoritesOnly,
    showFavoritesOnly: computed(() => library.showFavoritesOnly),
    isFavorite: (path: string) => library.isFavorite(path),
    favoriteSet: computed(() => library.favorites),
  };
}
