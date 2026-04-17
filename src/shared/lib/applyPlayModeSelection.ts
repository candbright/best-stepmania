import type { SongListItem } from "@/shared/api";
import type { SessionPlayMode } from "@/shared/lib/chartPlayMode";
import { firstSongIndexMatchingPlayMode, songHasChartForPlayMode } from "@/shared/lib/chartPlayMode";
import type { useSessionStore } from "@/shared/stores/session";
import type { useSettingsStore } from "@/shared/stores/settings";
import type { useLibraryStore } from "@/shared/stores/library";

export interface ApplyPlayModePlayerLike {
  setQueue: (songs: SongListItem[], startIndex: number) => void;
}

/** 与标题「选模式」一致：写 playMode / coopMode，并在当前歌无谱时跳到第一本匹配歌。 */
export async function applyPlayModeSelection(
  session: ReturnType<typeof useSessionStore>,
  settings: ReturnType<typeof useSettingsStore>,
  library: ReturnType<typeof useLibraryStore>,
  player: ApplyPlayModePlayerLike,
  mode: SessionPlayMode,
): Promise<void> {
  session.playMode = mode;
  if (mode === "pump-single") {
    settings.coopMode = "solo";
  } else if (mode === "pump-double") {
    settings.coopMode = "double";
    session.hasPlayer2 = false;
  } else {
    settings.coopMode = "co-op";
  }

  const songs = library.songs;
  if (songs.length === 0) return;

  const idx = session.currentSongIndex;
  const cur = idx >= 0 && idx < songs.length ? songs[idx]! : null;
  if (!songHasChartForPlayMode(cur, mode)) {
    const firstIdx = firstSongIndexMatchingPlayMode(songs, mode);
    if (firstIdx >= 0) {
      await session.selectSong(firstIdx);
      player.setQueue(songs, firstIdx);
    }
  }
}
