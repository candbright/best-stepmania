import type { SongListItem } from "@/shared/api";
import type { SessionPlayMode } from "@/shared/lib/chartPlayMode";
import {
  firstSongIndexMatchingPlayMode,
  songHasChartForPlayMode,
} from "@/shared/lib/chartPlayMode";
import { logDebug } from "@/shared/lib/devLog";
import type { useSessionStore } from "@/shared/stores/session";
import type { useSettingsStore } from "@/shared/stores/settings";
import type { useLibraryStore } from "@/shared/stores/library";

export interface ApplyPlayModePlayerLike {
  setQueue: (songs: SongListItem[], startIndex: number) => void;
  queueIndex: number;
  queue: SongListItem[];
}

/** 与标题「选模式」一致：写 playMode / coopMode，并在当前歌无谱时跳到第一本匹配歌。 */
export async function applyPlayModeSelection(
  session: ReturnType<typeof useSessionStore>,
  settings: ReturnType<typeof useSettingsStore>,
  library: ReturnType<typeof useLibraryStore>,
  player: ApplyPlayModePlayerLike,
  mode: SessionPlayMode,
): Promise<void> {
  logDebug("PlayModeSelect", "start", {
    mode,
    currentSongIndex: session.currentSongIndex,
    songsCount: library.songs.length,
    playerQueueIndex: player.queueIndex,
    playerQueueCount: player.queue.length,
  });
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
  if (songs.length === 0) {
    logDebug("PlayModeSelect", "skip: songs list empty");
    return;
  }

  const sessionIdx = session.currentSongIndex;
  const sessionCur = sessionIdx >= 0 && sessionIdx < songs.length ? songs[sessionIdx]! : null;
  let baseIdx = sessionIdx;
  let baseSong = sessionCur;
  let baseSource: "session" | "player" = "session";

  if (!baseSong) {
    const playerIdx = player.queueIndex;
    const playerSong = playerIdx >= 0 ? player.queue[playerIdx] : null;
    const mappedIndex = playerSong ? songs.findIndex((song) => song.path === playerSong.path) : -1;
    if (mappedIndex >= 0) {
      baseIdx = mappedIndex;
      baseSong = songs[mappedIndex]!;
      baseSource = "player";
    }
  }

  const currentMatchesMode = songHasChartForPlayMode(baseSong, mode);
  logDebug("PlayModeSelect", "base song mode check", {
    baseSource,
    baseSongPath: baseSong?.path ?? null,
    baseSongIndex: baseIdx,
    currentMatchesMode,
  });
  if (!currentMatchesMode) {
    const nextIdx = firstSongIndexMatchingPlayMode(songs, mode);
    if (nextIdx >= 0) {
      logDebug("PlayModeSelect", "switch song: current not match mode", {
        mode,
        strategy: "firstSongIndexMatchingPlayMode",
        fromSource: baseSource,
        fromIndex: baseIdx,
        fromSongPath: baseSong?.path ?? null,
        toIndex: nextIdx,
        toSongPath: songs[nextIdx]?.path ?? null,
      });
      await session.selectSong(nextIdx);
      player.setQueue(songs, nextIdx);
    } else {
      logDebug("PlayModeSelect", "no candidate song matched target mode", { mode });
    }
    return;
  }
  if (baseIdx >= 0 && session.currentSongIndex !== baseIdx) {
    await session.selectSong(baseIdx);
    logDebug("PlayModeSelect", "sync session with base song", {
      baseSource,
      syncedIndex: baseIdx,
      syncedSongPath: baseSong?.path ?? null,
    });
  }
  logDebug("PlayModeSelect", "keep current song: already matches mode", {
    mode,
    baseSource,
    currentSongIndex: baseIdx,
    currentSongPath: baseSong?.path ?? null,
  });
}
