import { useSessionStore } from "@/shared/stores/session";
import { useLibraryStore } from "@/shared/stores/library";
import { usePlayerStore } from "@/shared/stores/player";
import type { SongListItem } from "@/shared/api";

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

  if (filtered.length === 0) {
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
  if (
    !player.isDefaultMusic &&
    qIdx >= 0 &&
    queueMatchesLibrary
  ) {
    const playing = player.queue[qIdx];
    if (playing && inFilter.has(playing.path)) {
      const idx = library.songs.findIndex((s) => s.path === playing.path);
      if (idx >= 0) {
        if (session.currentSongIndex !== idx) {
          session.setCurrentSongIndexFromPlayer(idx);
        }
        loadBannerLazy(idx);
        return;
      }
    }
  }

  const cur = session.currentSong;
  if (cur && inFilter.has(cur.path)) {
    return;
  }

  const picked =
    cur ? filtered[0]! : filtered[Math.floor(Math.random() * filtered.length)]!;
  const idx = library.songs.findIndex((s) => s.path === picked.path);
  if (idx < 0) return;

  await session.selectSong(idx);
  const queueSynced =
    player.queue.length === library.songs.length &&
    player.queue.every((s, i) => s.path === library.songs[i]?.path);
  if (!queueSynced) {
    player.setQueue(library.songs, idx);
  } else {
    player.playSongAt(idx);
  }
  loadBannerLazy(idx);
}
