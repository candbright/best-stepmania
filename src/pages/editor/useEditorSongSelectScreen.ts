import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "@/shared/stores/game";
import { useSessionStore } from "@/shared/stores/session";
import { usePlayerStore } from "@/shared/stores/player";
import { useLibraryStore } from "@/shared/stores/library";
import { useI18n } from "@/shared/i18n";
import { useBlockingOverlayStore } from "@/shared/stores/blockingOverlay";
import { playMenuMove, playMenuBack } from "@/shared/lib/sfx";
import type { SongListItem } from "@/utils/api";
import { useEditorEntryNavigation } from "./useEditorEntryNavigation";
import { useEditorSongManagement } from "./useEditorSongManagement";
import { useSongSelectCore } from "@/shared/composables/useSongSelectCore";
import { useEditorSongSelectLifecycle } from "./useEditorSongSelectLifecycle";

type SongSelectCoreReturn = ReturnType<typeof useSongSelectCore>;

export interface UseEditorSongSelectScreenReturn {
  // === Shared state from core ===
  t: ReturnType<typeof useI18n>["t"];
  game: ReturnType<typeof useGameStore>;
  bannerCache: ReturnType<typeof ref<Record<string, string>>>;
  showFilterModal: ReturnType<typeof ref<boolean>>;
  songScrollRef: ReturnType<typeof ref<HTMLElement | null>>;
  DIFF_COLORS: Record<string, string>;
  ROOT_PACK_KEY: string;
  groupedSongs: SongSelectCoreReturn["groupedSongs"];
  filteredCharts: SongSelectCoreReturn["filteredCharts"];
  filteredSongs: SongSelectCoreReturn["filteredSongs"];
  collapsedPacks: ReturnType<typeof ref<Set<string>>>;
  diffMin: SongSelectCoreReturn["diffMin"];
  diffMax: SongSelectCoreReturn["diffMax"];
  filterSearch: SongSelectCoreReturn["filterSearch"];
  filterPack: SongSelectCoreReturn["filterPack"];
  existingPacks: SongSelectCoreReturn["existingPacks"];
  sortLabel: SongSelectCoreReturn["sortLabel"];
  hasActiveFilter: ReturnType<typeof computed<boolean>>;
  activeFilterCount: ReturnType<typeof computed<number>>;
  refreshing: ReturnType<typeof ref<boolean>>;
  filterStepsType: ReturnType<typeof ref<string>>;
  showCreateSongModal: ReturnType<typeof ref<boolean>>;
  confirmDeleteSong: ReturnType<typeof ref<SongListItem | null>>;
  importing: ReturnType<typeof ref<boolean>>;
  importStatus: ReturnType<typeof ref<string>>;
  canEditCurrentSong: ReturnType<typeof computed<boolean>>;
  showFavoritesOnly: SongSelectCoreReturn["showFavoritesOnly"];
  favoriteSet: SongSelectCoreReturn["favoriteSet"];
  isFavorite: (path: string) => boolean;

  // === Actions ===
  selectSong: (idx: number) => void;
  focusSongByDelta: (delta: number) => void;
  ensureCurrentSongVisible: () => void;
  togglePack: (packKey: string) => void;
  onFilterClear: () => void;
  onFilterApply: () => void;
  cycleSortMode: () => void;
  refreshSongs: () => Promise<void>;
  toggleFavorite: (songPath: string) => Promise<void>;
  setShowFavoritesOnly: (value: boolean) => void;
  difficultyLabel: (diff: string) => string;
  stepsTypeLabel: (stepsType: string) => string;
  onKeyDown: (e: KeyboardEvent) => void;
  loadBannerLazy: (idx: number) => void;
  preloadAllBanners: () => void;

  // === Editor-specific actions ===
  openEditor: () => void;
  goBack: () => void;
  openCreateSongModal: () => void;
  handleCreateSuccess: (msg: string) => Promise<void>;
  handleCreateError: (msg: string) => void;
  askDeleteCurrentSong: () => void;
  handleDeleteSongSuccess: () => Promise<void>;
  handleDeleteSongError: (msg: string) => void;
  importSongs: () => Promise<void>;
  cancelEditorNavLoad: () => void;

  // === Lifecycle ===
  onMountedHandler: () => Promise<void>;
  onUnmountedHandler: () => void;
}

/**
 * Editor-specific song selection composable.
 * Extends core song selection with editor-specific functionality.
 */
export function useEditorSongSelectScreen() {
  const router = useRouter();
  const game = useGameStore();
  const session = useSessionStore();
  const player = usePlayerStore();
  const library = useLibraryStore();
  const blockingOverlay = useBlockingOverlayStore();
  const { t } = useI18n();

  const filterStepsType = ref("");
  const core = useSongSelectCore({
    additionalSongFilter: (song) => {
      const charts = song.charts ?? [];
      if (charts.length === 0) return true;
      if (!filterStepsType.value) return true;
      return charts.some((c) => c.stepsType === filterStepsType.value);
    },
    additionalChartFilter: (chart) => {
      if (!filterStepsType.value) return true;
      return chart.stepsType === filterStepsType.value;
    },
    selectSongImpl: (idx, ctx) => {
      ctx.game.selectSong(idx);
      playMenuMove();
      ctx.player.playSongAt(idx);
      ctx.loadBannerLazy(idx);
    },
  });
  const {
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
    refreshing,
    selectSong,
    focusSongByDelta,
    ensureCurrentSongVisible,
    togglePack,
    onFilterApply,
    cycleSortMode,
    refreshSongs,
    toggleFavorite,
    setShowFavoritesOnly,
    loadBannerLazy,
    preloadAllBanners,
    difficultyLabel,
    stepsTypeLabel,
    showFavoritesOnly,
    favoriteSet,
    isFavorite,
  } = core;
  const hasActiveFilter = computed(
    () => core.hasActiveFilter.value || filterStepsType.value !== "",
  );
  const activeFilterCount = computed(
    () => core.activeFilterCount.value + (filterStepsType.value !== "" ? 1 : 0),
  );
  function onFilterClear() {
    core.onFilterClear();
    filterStepsType.value = "";
  }

  // === Computed ===
  const canEditCurrentSong = computed(() => {
    return game.currentSong != null;
  });
  const canEditCurrentSongFn = () => canEditCurrentSong.value;
  const {
    cancelEditorNavLoad,
    navigateToEditorWithPrefetch,
    openEditor,
    onUnmountedEditorEntryNavigation,
  } = useEditorEntryNavigation({
    canEditCurrentSong: canEditCurrentSongFn,
    router,
    session,
    blockingOverlay,
    t,
  });
  const {
    showCreateSongModal,
    confirmDeleteSong,
    importing,
    importStatus,
    openCreateSongModal,
    handleCreateSuccess,
    handleCreateError,
    askDeleteCurrentSong,
    handleDeleteSongSuccess,
    handleDeleteSongError,
    importSongs,
  } = useEditorSongManagement({
    game,
    player,
    library,
    bannerCache,
    t,
    navigateToEditorWithPrefetch,
  });
  const { onMountedHandler: onMountedCore, syncFilteredSelection } = useEditorSongSelectLifecycle({
    game,
    player,
    library,
    filteredSongs: () => filteredSongs.value,
    loadBannerLazy,
    preloadAllBanners,
    ensureCurrentSongVisible,
  });

  // === Keyboard Navigation ===
  function onKeyDown(e: KeyboardEvent) {
    if (showFilterModal.value || confirmDeleteSong.value) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      focusSongByDelta(e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      openEditor();
    }
  }

  // === Navigation ===
  function goBack() {
    playMenuBack();
    router.push("/");
  }

  // === Lifecycle ===
  async function onMountedHandler() {
    window.addEventListener("keydown", onKeyDown);
    await onMountedCore();
  }

  function onUnmountedHandler() {
    window.removeEventListener("keydown", onKeyDown);
    onUnmountedEditorEntryNavigation();
  }

  watch(
    () => filteredSongs.value.map((s) => s.path).join("\0"),
    () => {
      syncFilteredSelection();
    },
  );

  return {
    // Shared state
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
    filterStepsType,
    showCreateSongModal,
    confirmDeleteSong,
    importing,
    importStatus,
    canEditCurrentSong,
    showFavoritesOnly,
    favoriteSet,
    isFavorite,

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
    difficultyLabel,
    stepsTypeLabel,
    onKeyDown,
    loadBannerLazy,
    preloadAllBanners,

    // Editor-specific
    openEditor,
    goBack,
    openCreateSongModal,
    handleCreateSuccess,
    handleCreateError,
    askDeleteCurrentSong,
    handleDeleteSongSuccess,
    handleDeleteSongError,
    importSongs,
    cancelEditorNavLoad,

    // Lifecycle
    onMountedHandler,
    onUnmountedHandler,
  };
}
