import { useSessionStore } from "@/shared/stores/session";
import { useLibraryStore } from "@/shared/stores/library";
import { usePlayerStore } from "@/shared/stores/player";
import type { SongListItem } from "@/shared/api";
import { logDebug } from "@/shared/lib/devLog";

/**
 * 筛选列表变化时：无当前选中则从筛选结果中随机一首；有选中但不在列表中则选中第一项；
 * 列表为空则清空选中并停止预览音频。
 * 若播放器正在播真实曲目（非默认音乐）且队列与曲库一致、当前曲在筛选内，则只对齐 session，不触发 playSongAt，避免换歌。
 */
export async function syncSelectionToFilteredSongs(
  filtered: SongListItem[],
  loadBannerLazy: (idx: number) => void,
): Promise<void> {
  const session = useSessionStore();
  const library = useLibraryStore();
  const player = usePlayerStore();
  logDebug("SelectMusicSync", "start", {
    filteredCount: filtered.length,
    libraryCount: library.songs.length,
    sessionSongIndex: session.currentSongIndex,
    sessionSongPath: session.currentSong?.path ?? null,
    playerQueueIndex: player.queueIndex,
    playerQueueCount: player.queue.length,
    isDefaultMusic: player.isDefaultMusic,
  });

  if (filtered.length === 0) {
    logDebug("SelectMusicSync", "filtered empty: clear selection and cleanup player");
    if (session.currentSongIndex !== -1) {
      await session.selectSong(-1);
    }
    player.cleanup();
    return;
  }

  const inFilter = new Set(filtered.map((s) => s.path));
  const queueMatchesLibrary =
    player.queue.length === library.songs.length &&
    player.queue.every((s, i) => s.path === library.songs[i]?.path);
  const qIdx = player.queueIndex;
  logDebug("SelectMusicSync", "player alignment check", {
    queueMatchesLibrary,
    queueIndex: qIdx,
    isDefaultMusic: player.isDefaultMusic,
  });
  if (
    !player.isDefaultMusic &&
    qIdx >= 0 &&
    queueMatchesLibrary
  ) {
    const playing = player.queue[qIdx];
    logDebug("SelectMusicSync", "player-driven sync candidate", {
      playingPath: playing?.path ?? null,
      playingInFilter: playing ? inFilter.has(playing.path) : false,
    });
    if (playing && inFilter.has(playing.path)) {
      const idx = library.songs.findIndex((s) => s.path === playing.path);
      if (idx >= 0) {
        if (session.currentSongIndex !== idx) {
          logDebug("SelectMusicSync", "align session to currently playing song", {
            fromIndex: session.currentSongIndex,
            fromSongPath: session.currentSong?.path ?? null,
            toIndex: idx,
            toSongPath: playing.path,
          });
          session.setCurrentSongIndexFromPlayer(idx);
        } else {
          logDebug("SelectMusicSync", "session already aligned with playing song", {
            index: idx,
            songPath: playing.path,
          });
        }
        loadBannerLazy(idx);
        return;
      }
      logDebug("SelectMusicSync", "playing song not found in library list", {
        playingPath: playing.path,
      });
    }
  }

  const cur = session.currentSong;
  if (cur && inFilter.has(cur.path)) {
    logDebug("SelectMusicSync", "keep session selection: current song still in filter", {
      currentSongIndex: session.currentSongIndex,
      currentSongPath: cur.path,
    });
    return;
  }

  const picked =
    cur ? filtered[0]! : filtered[Math.floor(Math.random() * filtered.length)]!;
  const idx = library.songs.findIndex((s) => s.path === picked.path);
  logDebug("SelectMusicSync", "pick replacement song", {
    reason: cur ? "current song filtered out" : "no current selection",
    strategy: cur ? "filtered_first" : "filtered_random",
    pickedPath: picked.path,
    pickedIndex: idx,
  });
  if (idx < 0) {
    logDebug("SelectMusicSync", "skip: picked song not found in library", {
      pickedPath: picked.path,
    });
    return;
  }

  await session.selectSong(idx);
  const queueSynced =
    player.queue.length === library.songs.length &&
    player.queue.every((s, i) => s.path === library.songs[i]?.path);
  if (!queueSynced) {
    logDebug("SelectMusicSync", "switch via setQueue (queue mismatch)", {
      targetIndex: idx,
      targetSongPath: picked.path,
    });
    player.setQueue(library.songs, idx);
  } else {
    logDebug("SelectMusicSync", "switch via playSongAt (queue already synced)", {
      targetIndex: idx,
      targetSongPath: picked.path,
    });
    player.playSongAt(idx);
  }
  loadBannerLazy(idx);
}
