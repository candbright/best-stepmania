import { setUiSfxVolume } from "@/shared/lib/sfx";
import { syncSelectionToFilteredSongs } from "../select-music/syncSelectionToFilteredSongs";
import type { SongListItem } from "@/utils/api";

interface GameLike {
  uiSfxVolume?: number;
  resumeFromEditor: boolean;
  currentSongIndex: number;
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

interface LibraryLike {
  loadFavorites: () => Promise<void>;
}

interface UseEditorSongSelectLifecycleOptions {
  game: GameLike;
  player: PlayerLike;
  library: LibraryLike;
  filteredSongs: () => SongListItem[];
  loadBannerLazy: (idx: number) => void;
  preloadAllBanners: () => void;
  ensureCurrentSongVisible: () => void;
}

export function useEditorSongSelectLifecycle(options: UseEditorSongSelectLifecycleOptions) {
  async function onMountedHandler() {
    setUiSfxVolume((options.game.uiSfxVolume ?? 70) / 100);
    void options.library.loadFavorites();

    if (options.game.resumeFromEditor) {
      options.game.resumeFromEditor = false;
      if (options.game.currentSongIndex >= 0) {
        options.player.cleanup();
        options.player.setQueue(options.game.songs, options.game.currentSongIndex);
        options.player.playSongAt(options.game.currentSongIndex, true);
      }
      options.ensureCurrentSongVisible();
      options.preloadAllBanners();
      void syncSelectionToFilteredSongs(options.filteredSongs(), options.loadBannerLazy);
      return;
    }

    // 初次加载由主界面统一完成；这里只消费缓存。
    if (options.player.queue.length === 0 && options.game.songs.length > 0) {
      options.player.setQueue(options.game.songs, 0);
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
