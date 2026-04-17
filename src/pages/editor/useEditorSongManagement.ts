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

export function useEditorSongManagement(options: UseEditorSongManagementOptions) {
  const showCreateSongModal = ref(false);
  const confirmDeleteSong = ref<SongListItem | null>(null);
  const importing = ref(false);
  const importStatus = ref("");

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
      const selected = await openDirectoryDialog(options.t("select.import"));
      if (!selected) return;
      importing.value = true;
      importStatus.value = "";

      if (!isTauri()) {
        importStatus.value = options.t("select.importWebNotSupported");
        return;
      }

      const result = await api.importSongPack(selected as string, "");
      importStatus.value = options.t("select.importSuccess")
        .replace("{0}", String(result.importedCount))
        .replace("{1}", String(result.skippedCount));
      if (result.importedCount > 0) {
        const oldPaths = new Set(options.library.songs.map((s) => s.path));
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
      }
    } catch (e: unknown) {
      importStatus.value = options.t("select.importError") + ": " + String(e);
    } finally {
      importing.value = false;
      setTimeout(() => {
        importStatus.value = "";
      }, 5000);
    }
  }

  return {
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
  };
}
