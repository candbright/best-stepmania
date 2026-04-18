import { setUiSfxVolume } from "@/shared/lib/sfx";
import { syncSelectionToFilteredSongs } from "../select-music/syncSelectionToFilteredSongs";
import type { SongListItem } from "@/shared/api";

interface SettingsLike {
  uiSfxVolume?: number;
}

interface SessionLike {
  resumeFromEditor: boolean;
  currentSongIndex: number;
}

interface LibraryLikeSongs {
  songs: SongListItem[];
}

interface PlayerLike {
  queue: SongListItem[];
  status: string;
  cleanup: () => void;
  setQueue: (songs: SongListItem[], index: number) => void;
  playSongAt: (index: number, forceRestart?: boolean) => void;
  playDefaultMusic: () => void;
}

interface LibraryLike extends LibraryLikeSongs {
  loadFavorites: () => Promise<void>;
}

interface UseEditorSongSelectLifecycleOptions {
  settings: SettingsLike;
  session: SessionLike;
  player: PlayerLike;
  library: LibraryLike;
  filteredSongs: () => SongListItem[];
  loadBannerLazy: (idx: number) => void;
  preloadAllBanners: () => void;
  ensureCurrentSongVisible: () => void;
}

export function useEditorSongSelectLifecycle(options: UseEditorSongSelectLifecycleOptions) {
  async function onMountedHandler() {
    setUiSfxVolume((options.settings.uiSfxVolume ?? 70) / 100);
    void options.library.loadFavorites();

    if (options.session.resumeFromEditor) {
      options.session.resumeFromEditor = false;
      if (options.session.currentSongIndex >= 0) {
        options.player.cleanup();
        options.player.setQueue(options.library.songs, options.session.currentSongIndex);
        options.player.playSongAt(options.session.currentSongIndex, true);
      }
      options.ensureCurrentSongVisible();
      options.preloadAllBanners();
      void syncSelectionToFilteredSongs(options.filteredSongs(), options.loadBannerLazy);
      return;
    }

    // 初次加载由主界面统一完成；这里只消费缓存。
    if (options.player.queue.length === 0 && options.library.songs.length > 0) {
      const startIdx =
        options.session.currentSongIndex >= 0
          ? options.session.currentSongIndex
          : Math.floor(Math.random() * options.library.songs.length);
      options.player.setQueue(options.library.songs, startIdx);
      if (options.player.status === "idle") {
        options.player.playDefaultMusic();
      }
      options.ensureCurrentSongVisible();
      options.preloadAllBanners();
    } else {
      options.ensureCurrentSongVisible();
      options.preloadAllBanners();
    }
    void syncSelectionToFilteredSongs(options.filteredSongs(), options.loadBannerLazy);
  }

  function syncFilteredSelection() {
    void syncSelectionToFilteredSongs(options.filteredSongs(), options.loadBannerLazy);
  }

  return {
    onMountedHandler,
    syncFilteredSelection,
  };
}
