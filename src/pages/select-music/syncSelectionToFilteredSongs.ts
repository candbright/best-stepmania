import { useGameStore } from "@/shared/stores/game";
import { usePlayerStore } from "@/shared/stores/player";
import type { SongListItem } from "@/shared/api";

/**
 * 筛选列表变化时：当前选中不在列表中则选中第一项；列表为空则清空选中并停止预览音频。
 */
export async function syncSelectionToFilteredSongs(
  filtered: SongListItem[],
  loadBannerLazy: (idx: number) => void,
): Promise<void> {
  const game = useGameStore();
  const player = usePlayerStore();

  if (filtered.length === 0) {
    if (game.currentSongIndex !== -1) {
      await game.selectSong(-1);
    }
    player.cleanup();
    return;
  }

  const inFilter = new Set(filtered.map((s) => s.path));
  const cur = game.currentSong;
  if (cur && inFilter.has(cur.path)) {
    return;
  }

  const first = filtered[0]!;
  const idx = game.songs.findIndex((s) => s.path === first.path);
  if (idx < 0) return;

  await game.selectSong(idx);
  const queueSynced =
    player.queue.length === game.songs.length &&
    player.queue.every((s, i) => s.path === game.songs[i]?.path);
  if (!queueSynced) {
    player.setQueue(game.songs, idx);
  } else {
    player.playSongAt(idx);
  }
  loadBannerLazy(idx);
}
