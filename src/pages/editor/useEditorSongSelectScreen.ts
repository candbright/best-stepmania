import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "@/shared/stores/session";
import { usePlayerStore } from "@/shared/stores/player";
import { useLibraryStore } from "@/shared/stores/library";
import { useSettingsStore } from "@/shared/stores/settings";
import { useI18n } from "@/shared/i18n";
import { useBlockingOverlayStore } from "@/shared/stores/blockingOverlay";
import { playMenuMove, playMenuBack } from "@/shared/lib/sfx";
import { useEditorEntryNavigation } from "./useEditorEntryNavigation";
import { useEditorSongManagement } from "./useEditorSongManagement";
import { useSongSelectCore } from "@/shared/composables/useSongSelectCore";
import { useEditorSongSelectLifecycle } from "./useEditorSongSelectLifecycle";

/**
 * Editor-specific song selection composable.
 * Extends core song selection with editor-specific functionality.
 */
export function useEditorSongSelectScreen() {
  const router = useRouter();
  const session = useSessionStore();
  const player = usePlayerStore();
  const library = useLibraryStore();
  const settings = useSettingsStore();
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
      void ctx.session.selectSong(idx);
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

  function pickRandomSong() {
    if (filteredSongs.value.length === 0) return;
    const randomIdx = Math.floor(Math.random() * filteredSongs.value.length);
    const randomSong = filteredSongs.value[randomIdx];
    if (!randomSong) return;
    const libraryIndex = library.songs.findIndex((song) => song.path === randomSong.path);
    if (libraryIndex < 0) return;
    selectSong(libraryIndex);
    ensureCurrentSongVisible();
  }

  // === Computed ===
  const canEditCurrentSong = computed(() => {
    return session.currentSong != null;
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
    showImportSongModal,
    confirmDeleteSong,
    importing,
    importStatus,
    importSongDefaults,
    openCreateSongModal,
    handleCreateSuccess,
    handleCreateError,
    askDeleteCurrentSong,
    handleDeleteSongSuccess,
    handleDeleteSongError,
    importSongs,
    handleImportSongConfirm,
  } = useEditorSongManagement({
    session,
    library,
    player,
    bannerCache,
    t,
    navigateToEditorWithPrefetch,
  });
  const { onMountedHandler: onMountedCore, syncFilteredSelection } = useEditorSongSelectLifecycle({
    session,
    settings,
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
    session,
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
    showImportSongModal,
    confirmDeleteSong,
    importing,
    importStatus,
    importSongDefaults,
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
    pickRandomSong,
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
    handleImportSongConfirm,
    cancelEditorNavLoad,

    // Lifecycle
    onMountedHandler,
    onUnmountedHandler,
  };
}
