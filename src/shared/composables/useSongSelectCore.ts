import { ref, computed, watch } from "vue";
import { useGameStore } from "@/shared/stores/game";
import { usePlayerStore } from "@/shared/stores/player";
import { useLibraryStore } from "@/shared/stores/library";
import { useI18n } from "@/shared/i18n";
import { playMenuMove } from "@/shared/lib/sfx";
import * as api from "@/shared/api";
import { PHYSICAL_ROOT_PACK } from "@/shared/constants/songLibrary";

export interface UseSongSelectCoreOptions {
  /** Additional filter for filteredSongs (e.g., playMode filtering) */
  additionalSongFilter?: (song: ReturnType<typeof useGameStore>["songs"][0]) => boolean;
  /** Additional filter for filteredCharts */
  additionalChartFilter?: (chart: ReturnType<typeof useGameStore>["charts"][0]) => boolean;
  /** Called when song selection changes (can be overridden for custom behavior) */
  onSelectSong?: (idx: number) => void;
  /** Called on keyboard navigation */
  onKeyDown?: (e: KeyboardEvent) => void;
  /** Override default select song behavior */
  selectSongImpl?: (
    idx: number,
    ctx: {
      game: ReturnType<typeof useGameStore>;
      player: ReturnType<typeof usePlayerStore>;
      loadBannerLazy: (index: number) => void;
    },
  ) => void;
}

export function useSongSelectCore(options: UseSongSelectCoreOptions = {}) {
  const game = useGameStore();
  const player = usePlayerStore();
  const library = useLibraryStore();
  const { t } = useI18n();

  // === Refs ===
  const bannerCache = ref<Record<string, string>>({});
  const showFilterModal = ref(false);
  const refreshing = ref(false);
  const songScrollRef = ref<HTMLElement | null>(null);
  const collapsedPacks = ref<Set<string>>(new Set());

  // === Constants ===
  const DIFF_COLORS: Record<string, string> = {
    Beginner: "#00e5ff",
    Easy: "#69f0ae",
    Medium: "#ffd740",
    Hard: "#ff6d00",
    Challenge: "#e040fb",
    Edit: "#78909c",
  };

  const ROOT_PACK_KEY = "__ROOT__";

  // === Filter State (bidirectional with game store) ===
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

  // === Computed: Filtered Songs ===
  const filteredSongs = computed(() => {
    return game.songs.filter((s) => {
      if (library.showFavoritesOnly && !library.favorites.has(s.path)) return false;
      if (filterSearch.value) {
        const q = filterSearch.value.toLowerCase();
        if (!s.title.toLowerCase().includes(q) && !(s.artist ?? "").toLowerCase().includes(q)) return false;
      }
      if (filterPack.value && s.pack !== filterPack.value) return false;

      if (options.additionalSongFilter && !options.additionalSongFilter(s)) return false;

      const charts = s.charts ?? [];
      if (charts.length === 0) return true;

      let hasMatchingChart = false;
      for (const c of charts) {
        if (diffMin.value !== null && c.meter < diffMin.value) continue;
        if (diffMax.value !== null && c.meter > diffMax.value) continue;
        hasMatchingChart = true;
        break;
      }
      return hasMatchingChart;
    });
  });

  // === Computed: Filtered Charts ===
  const filteredCharts = computed(() => {
    let charts = game.charts ?? [];
    if (options.additionalChartFilter) {
      charts = charts.filter(options.additionalChartFilter);
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

  // === Computed: Grouped Songs ===
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

  // === Computed: Existing Packs ===
  const existingPacks = computed(() => {
    const uniq = new Set<string>();
    for (const s of game.songs) {
      const p = (s.pack ?? "").trim();
      if (p && p !== PHYSICAL_ROOT_PACK) uniq.add(p);
    }
    return Array.from(uniq).sort((a, b) => a.localeCompare(b));
  });

  // === Computed: Sort Label ===
  const sortLabel = computed(() => {
    const key = `select.sort.${game.sortMode}` as const;
    const translated = t(key);
    if (translated !== key) return translated;
    return t("select.sort.default");
  });

  // === Banner Loading ===
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

  // === Song Selection ===
  function selectSong(idx: number) {
    if (options.selectSongImpl) {
      options.selectSongImpl(idx, { game, player, loadBannerLazy });
    } else {
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
    options.onSelectSong?.(idx);
  }

  // === Navigation ===
  function focusSongByDelta(delta: number) {
    if (filteredSongs.value.length === 0) return;

    const currentPath = game.currentSong?.path;
    const currentFilteredIndex = currentPath ? filteredSongs.value.findIndex((s) => s.path === currentPath) : -1;
    const baseIndex = currentFilteredIndex >= 0 ? currentFilteredIndex : 0;
    const nextFilteredIndex = (baseIndex + delta + filteredSongs.value.length) % filteredSongs.value.length;
    const nextSong = filteredSongs.value[nextFilteredIndex];
    if (!nextSong) return;

    const nextIndex = game.songs.findIndex((s) => s.path === nextSong.path);
    if (nextIndex >= 0 && nextIndex !== game.currentSongIndex) {
      selectSong(nextIndex);
      ensureCurrentSongVisible();
    }
  }

  function ensureCurrentSongVisible() {
    requestAnimationFrame(() => {
      const container = songScrollRef.value;
      if (!container || game.currentSongIndex < 0) return;
      const selected = container.querySelector(".song-row.selected") as HTMLElement | null;
      selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  // === Pack Toggle ===
  function togglePack(packKey: string) {
    if (collapsedPacks.value.has(packKey)) collapsedPacks.value.delete(packKey);
    else collapsedPacks.value.add(packKey);
    collapsedPacks.value = new Set(collapsedPacks.value);
  }

  // === Filter Actions ===
  function onFilterClear() {
    diffMin.value = null;
    diffMax.value = null;
    filterSearch.value = "";
    filterPack.value = "";
  }

  function onFilterApply() {
    // filter state is already updated via v-model
  }

  // === Sort ===
  function cycleSortMode() {
    const modes = ["title", "artist", "bpm", "pack"] as const;
    const cur = modes.indexOf(game.sortMode);
    game.setSortMode(modes[(cur + 1) % modes.length]);
  }

  // === Favorites ===
  async function toggleFavorite(songPath: string) {
    await library.toggleFavorite(songPath);
  }

  function setShowFavoritesOnly(value: boolean) {
    library.showFavoritesOnly = value;
  }

  function cycleShowFavoritesOnly() {
    library.showFavoritesOnly = !library.showFavoritesOnly;
  }

  // === Refresh ===
  async function refreshSongs() {
    refreshing.value = true;
    try {
      await game.refreshSongsList();
      game.needsSongRefresh = false;
      await library.loadPacks();
    } finally {
      refreshing.value = false;
    }
  }

  // === Labels ===
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

  // === Keyboard Navigation ===
  function handleKeyDown(e: KeyboardEvent) {
    if (showFilterModal.value) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      focusSongByDelta(e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    options.onKeyDown?.(e);
  }

  // === Watch: Ensure visible on song change ===
  watch(() => game.currentSongIndex, () => ensureCurrentSongVisible());

  return {
    // State
    t,
    game,
    bannerCache,
    showFilterModal,
    songScrollRef,
    DIFF_COLORS,
    ROOT_PACK_KEY,
    groupedSongs,
    filteredCharts,
    filteredSongs,
    collapsedPacks,
    diffMin,
    diffMax,
    filterSearch,
    filterPack,
    existingPacks,
    sortLabel,
    hasActiveFilter,
    activeFilterCount,
    refreshing,

    // Actions
    selectSong,
    focusSongByDelta,
    ensureCurrentSongVisible,
    togglePack,
    onFilterClear,
    onFilterApply,
    cycleSortMode,
    refreshSongs,
    toggleFavorite,
    setShowFavoritesOnly,
    cycleShowFavoritesOnly,
    loadBannerLazy,
    preloadAllBanners,
    difficultyLabel,
    stepsTypeLabel,
    handleKeyDown,

    // Favorites
    showFavoritesOnly: computed(() => library.showFavoritesOnly),
    isFavorite: (path: string) => library.isFavorite(path),
    favoriteSet: computed(() => library.favorites),
  };
}
