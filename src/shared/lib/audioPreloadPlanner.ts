import * as api from "@/utils/api";
import type { SongListItem } from "@/utils/api";

interface AudioPreloadPlannerOptions {
  getCachedMusicPath: (songPath: string) => string | undefined;
  resolveMusicPath: (songPath: string) => Promise<string>;
  onResolveError: (scope: string, error: unknown) => void;
}

type PreloadDirection = "auto" | "up" | "down";

function collectIndices(
  songsLength: number,
  center: number,
  direction: PreloadDirection,
  count: number,
): number[] {
  const indices: number[] = [];

  if (direction === "auto") {
    for (let off = 0; indices.length < Math.min(count, songsLength); off++) {
      if (center + off < songsLength) indices.push(center + off);
      if (off > 0 && center - off >= 0) indices.push(center - off);
    }
    return indices;
  }

  const step = direction === "down" ? 1 : -1;
  for (let off = 0; indices.length < Math.min(count, songsLength); off++) {
    const idx = center + off * step;
    if (idx >= 0 && idx < songsLength) indices.push(idx);
  }
  return indices;
}

export function createAudioPreloadPlanner(options: AudioPreloadPlannerOptions) {
  async function preloadPaths(paths: string[]) {
    if (paths.length === 0) return;
    await api.audioPreloadBatch(paths);
  }

  function preloadSelectedSongs(
    songs: SongListItem[],
    center: number,
    direction: PreloadDirection = "auto",
    count = 10,
  ) {
    const indices = collectIndices(songs.length, Math.max(0, center), direction, count);
    const cachedPaths: string[] = [];
    const uncachedPromises: Promise<string>[] = [];

    for (const idx of indices) {
      const song = songs[idx];
      if (!song) continue;

      const cached = options.getCachedMusicPath(song.path);
      if (cached) {
        cachedPaths.push(cached);
        continue;
      }

      uncachedPromises.push(
        options.resolveMusicPath(song.path).catch((error) => {
          options.onResolveError("player.preloadAll.resolvePath", error);
          return "";
        }),
      );
    }

    if (cachedPaths.length > 0) {
      void preloadPaths(cachedPaths);
    }

    if (uncachedPromises.length > 0) {
      void Promise.all(uncachedPromises).then((paths) => {
        const validPaths = paths.filter((path) => path.length > 0);
        if (validPaths.length > 0) {
          void preloadPaths(validPaths);
        }
      });
    }
  }

  function preloadIdleSongs(songs: SongListItem[]) {
    const cachedPaths = songs
      .map((song) => options.getCachedMusicPath(song.path))
      .filter((path): path is string => typeof path === "string");

    if (cachedPaths.length > 0) {
      void preloadPaths(cachedPaths);
    }
  }

  return {
    preloadSelectedSongs,
    preloadIdleSongs,
  };
}
