import { useSessionStore } from "@/shared/stores/session";
import { useLibraryStore } from "@/shared/stores/library";
import { usePlayerStore } from "@/shared/stores/player";
import type { SongListItem } from "@/shared/api";

/**
 * 筛选列表变化时：当前选中不在列表中则选中第一项；列表为空则清空选中并停止预览音频。
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
  const cur = session.currentSong;
  if (cur && inFilter.has(cur.path)) {
    return;
  }

  const first = filtered[0]!;
  const idx = library.songs.findIndex((s) => s.path === first.path);
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
