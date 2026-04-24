import { ref } from "vue";
import { openDirectoryDialog, isTauri } from "@/shared/lib/platform";
import * as api from "@/shared/api";
import type { SongListItem } from "@/shared/api";
import type { useSessionStore } from "@/shared/stores/session";
import type { usePlayerStore } from "@/shared/stores/player";
import type { useLibraryStore } from "@/shared/stores/library";

interface UseEditorSongManagementOptions {
  session: ReturnType<typeof useSessionStore>;
  library: ReturnType<typeof useLibraryStore>;
  player: ReturnType<typeof usePlayerStore>;
  bannerCache: ReturnType<typeof ref<Record<string, string>>>;
  t: (key: string, ...args: unknown[]) => string;
  navigateToEditorWithPrefetch: (routeQuery?: Record<string, string>) => Promise<void>;
}

interface ImportSongFormData {
  packName: string;
  title: string;
  artist: string;
  subtitle: string;
  genre: string;
  bpm: number;
  offset: number;
  stepsType: string;
  difficulty: string;
  meter: number;
  createChart: boolean;
  musicSourcePath: string;
  coverSourcePath: string;
  backgroundSourcePath: string;
  chartSourcePath: string;
}

interface ImportSongDefaults {
  title: string;
  artist: string;
  subtitle: string;
  genre: string;
  bpm: number;
  offset: number;
  musicSourcePath: string;
  coverSourcePath: string;
  backgroundSourcePath: string;
  chartSourcePath: string;
}

export function useEditorSongManagement(options: UseEditorSongManagementOptions) {
  const ROOT_PACK_ID = ".root";
  const showCreateSongModal = ref(false);
  const showImportSongModal = ref(false);
  const confirmDeleteSong = ref<SongListItem | null>(null);
  const importing = ref(false);
  const importStatus = ref("");
  const importSongSourcePath = ref("");
  const importSongDefaults = ref<ImportSongDefaults>({
    title: "",
    artist: "",
    subtitle: "",
    genre: "",
    bpm: 120,
    offset: 0,
    musicSourcePath: "",
    coverSourcePath: "",
    backgroundSourcePath: "",
    chartSourcePath: "",
  });

  function normalizeSongName(name: string): string {
    return name.trim().toLocaleLowerCase();
  }

  function hasDuplicateSongNameInPack(packName: string, songName: string): boolean {
    const normalized = normalizeSongName(songName);
    if (!normalized) return false;
    return options.library.songs.some((song) => {
      if (song.pack !== packName) return false;
      return normalizeSongName(song.title || "") === normalized;
    });
  }

  function openCreateSongModal() {
    showCreateSongModal.value = true;
  }

  async function handleCreateSuccess(msg: string) {
    showCreateSongModal.value = false;
    importStatus.value = msg;
    setTimeout(() => {
      importStatus.value = "";
    }, 3500);
    await options.navigateToEditorWithPrefetch({ newChart: "1" });
  }

  function handleCreateError(msg: string) {
    importStatus.value = msg;
    setTimeout(() => {
      importStatus.value = "";
    }, 5000);
  }

  function askDeleteCurrentSong() {
    if (options.session.currentSong) confirmDeleteSong.value = options.session.currentSong;
  }

  async function handleDeleteSongSuccess() {
    const song = confirmDeleteSong.value;
    confirmDeleteSong.value = null;
    if (!song) return;

    const removedIndex = options.session.currentSongIndex;
    const { path: removedPath } = song;
    if (!options.bannerCache.value) {
      options.bannerCache.value = {};
    }
    delete options.bannerCache.value[removedPath];

    await options.library.refreshSongsList();
    options.session.needsSongRefresh = false;
    await options.library.cleanupOrphanedFavorites();

    if (options.library.songs.length === 0) {
      options.player.cleanup();
      await options.session.selectSong(-1);
      options.player.setQueue([], 0);
      if (options.player.status === "idle") {
        options.player.playDefaultMusic();
      }
    } else {
      const nextIndex = Math.min(Math.max(removedIndex, 0), options.library.songs.length - 1);
      await options.session.selectSong(nextIndex);
      options.player.setQueue(options.library.songs, nextIndex);
    }

    importStatus.value = options.t("songPacks.songDeleted");
    setTimeout(() => {
      importStatus.value = "";
    }, 4000);
  }

  function handleDeleteSongError(msg: string) {
    importStatus.value = `${options.t("songPacks.songDeleteFailed")}: ${msg}`;
    setTimeout(() => {
      importStatus.value = "";
    }, 5000);
  }

  async function importSongs() {
    try {
      const selected = await openDirectoryDialog(options.t("songPacks.selectSongDirectory"));
      if (!selected || typeof selected !== "string") return;
      importStatus.value = "";
      if (!isTauri()) {
        importStatus.value = options.t("select.importWebNotSupported");
        return;
      }
      importSongSourcePath.value = selected;
      const sourceInfo = await api.inspectSongImportSource(selected);
      importSongDefaults.value = {
        title: sourceInfo.title?.trim() || sourceInfo.folderName?.trim() || "",
        artist: sourceInfo.artist ?? "",
        subtitle: sourceInfo.subtitle ?? "",
        genre: sourceInfo.genre ?? "",
        bpm: Number.isFinite(sourceInfo.bpm) ? sourceInfo.bpm : 120,
        offset: Number.isFinite(sourceInfo.offset) ? sourceInfo.offset : 0,
        musicSourcePath: sourceInfo.musicSourcePath ?? "",
        coverSourcePath: sourceInfo.coverSourcePath ?? "",
        backgroundSourcePath: sourceInfo.backgroundSourcePath ?? "",
        chartSourcePath: sourceInfo.chartSourcePath ?? "",
      };
      showImportSongModal.value = true;
    } catch (e: unknown) {
      importStatus.value = options.t("select.importError") + ": " + String(e);
      setTimeout(() => {
        importStatus.value = "";
      }, 5000);
    }
  }

  async function handleImportSongConfirm(data: ImportSongFormData) {
    if (!importSongSourcePath.value) return;
    importing.value = true;
    importStatus.value = "";
    const oldPaths = new Set(options.library.songs.map((s) => s.path));
    try {
      const targetPack = data.packName || ROOT_PACK_ID;
      if (hasDuplicateSongNameInPack(targetPack, data.title)) {
        importStatus.value = options.t("songPacks.duplicateSongName");
        return;
      }
      const prepareResult = await api.prepareSongImport(importSongSourcePath.value, targetPack);
      await api.createChartForImported(
        prepareResult.songDir,
        data.title,
        data.artist,
        data.subtitle,
        data.genre,
        data.bpm,
        data.offset,
        data.stepsType,
        data.difficulty,
        data.meter,
        true,
        data.musicSourcePath,
        data.coverSourcePath,
        data.backgroundSourcePath,
        data.chartSourcePath,
      );
      const newSongs = await api.getSongList(options.library.sortMode);
      options.library.songs = newSongs;
      const firstImportedIdx = newSongs.findIndex((s) => !oldPaths.has(s.path));
      const nextIndex = firstImportedIdx >= 0
        ? firstImportedIdx
        : Math.max(0, Math.min(options.session.currentSongIndex, newSongs.length - 1));

      if (newSongs.length > 0) {
        await options.session.selectSong(nextIndex);
        options.player.setQueue(newSongs, nextIndex);
      }
      showImportSongModal.value = false;
      importStatus.value = options.t("songPacks.songImported");
    } catch (e: unknown) {
      importStatus.value = options.t("songPacks.songImportFailed") + ": " + String(e);
    } finally {
      importing.value = false;
      importSongSourcePath.value = "";
      importSongDefaults.value = {
        title: "",
        artist: "",
        subtitle: "",
        genre: "",
        bpm: 120,
        offset: 0,
        musicSourcePath: "",
        coverSourcePath: "",
        backgroundSourcePath: "",
        chartSourcePath: "",
      };
      setTimeout(() => {
        importStatus.value = "";
      }, 5000);
    }
  }

  return {
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
  };
}
