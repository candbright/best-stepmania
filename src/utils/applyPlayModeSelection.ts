import type { SongListItem } from "@/utils/api";
import type { CoopMode } from "@/engine/types";
import type { SessionPlayMode } from "@/utils/chartPlayMode";
import { firstSongIndexMatchingPlayMode, songHasChartForPlayMode } from "@/utils/chartPlayMode";

export interface ApplyPlayModeGameLike {
  playMode: SessionPlayMode;
  coopMode: CoopMode;
  songs: SongListItem[];
  currentSongIndex: number;
  selectSong: (index: number) => Promise<void>;
}

export interface ApplyPlayModePlayerLike {
  setQueue: (songs: SongListItem[], startIndex: number) => void;
}

/** 与标题「选模式」一致：写 playMode / coopMode，并在当前歌无谱时跳到第一本匹配歌。 */
export async function applyPlayModeSelection(
  game: ApplyPlayModeGameLike,
  player: ApplyPlayModePlayerLike,
  mode: SessionPlayMode,
): Promise<void> {
  game.playMode = mode;
  if (mode === "pump-single") {
    game.coopMode = "solo";
  } else if (mode === "pump-double") {
    game.coopMode = "double";
  } else {
    game.coopMode = "co-op";
  }

  const songs = game.songs;
  if (songs.length === 0) return;

  const idx = game.currentSongIndex;
  const cur = idx >= 0 && idx < songs.length ? songs[idx]! : null;
  if (!songHasChartForPlayMode(cur, mode)) {
    const firstIdx = firstSongIndexMatchingPlayMode(songs, mode);
    if (firstIdx >= 0) {
      await game.selectSong(firstIdx);
      player.setQueue(songs, firstIdx);
    }
  }
}
