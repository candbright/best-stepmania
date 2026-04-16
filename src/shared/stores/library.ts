import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { SongListItem, SongPackInfo } from "@/utils/api";
import * as api from "@/utils/api";

export type SortMode = "title" | "artist" | "bpm" | "pack";

/**
 * Library store — manages the song catalog, search, sorting, and pack list.
 * Separated from game session and settings for single-responsibility.
 */
export const useLibraryStore = defineStore("library", () => {
  const songs = ref<SongListItem[]>([]);
  const packs = ref<SongPackInfo[]>([]);
  const sortMode = ref<SortMode>("title");
  const searchQuery = ref("");
  const songsLoadedOnce = ref(false);
  const favorites = ref<Set<string>>(new Set());
  const showFavoritesOnly = ref(false);
  let songsRequestId = 0;
  let packsRequestId = 0;

  function nextSongsRequestId() {
    songsRequestId += 1;
    return songsRequestId;
  }

  function isLatestSongsRequest(requestId: number) {
    return requestId === songsRequestId;
  }

  function nextPacksRequestId() {
    packsRequestId += 1;
    return packsRequestId;
  }

  function isLatestPacksRequest(requestId: number) {
    return requestId === packsRequestId;
  }

  async function loadSongs(dirs: string[], options?: { force?: boolean }) {
    const force = options?.force === true;
    if (!force && songsLoadedOnce.value && songs.value.length > 0) {
      return;
    }
    const requestId = nextSongsRequestId();
    // Preserve multi-directory scans, but fall back to backend default when settings are empty
    // or contain stale relative paths like "songs".
    const normalizedDirs = dirs
      .map((dir) => dir.trim())
      .filter((dir) => dir.length > 0);
    const fallbackDir = await api.getSongsDir();
    const scanDirs = normalizedDirs.length > 0
      ? normalizedDirs
      : [fallbackDir];
    try {
      await api.scanSongs(scanDirs);
    } catch (error: unknown) {
      const shouldFallback = scanDirs.some((dir) => !dir.includes(":") && !dir.startsWith("/") && !dir.startsWith("\\"));
      if (!shouldFallback) {
        throw error;
      }
      await api.scanSongs([fallbackDir]);
    }
    const nextSongs = await api.getSongList(sortMode.value);
    if (!isLatestSongsRequest(requestId)) return;
    songs.value = nextSongs;
    songsLoadedOnce.value = true;
  }

  async function refreshSongsList() {
    const requestId = nextSongsRequestId();
    const nextSongs = await api.getSongList(sortMode.value);
    if (!isLatestSongsRequest(requestId)) return;
    songs.value = nextSongs;
    songsLoadedOnce.value = true;
  }

  async function loadPacks() {
    const requestId = nextPacksRequestId();
    const nextPacks = await api.listSongPacks();
    if (!isLatestPacksRequest(requestId)) return;
    packs.value = nextPacks;
  }

  async function setSortMode(mode: SortMode) {
    sortMode.value = mode;
    const requestId = nextSongsRequestId();
    const nextSongs = await api.getSongList(mode);
    if (!isLatestSongsRequest(requestId)) return;
    songs.value = nextSongs;
  }

  async function search(query: string) {
    searchQuery.value = query;
    const requestId = nextSongsRequestId();
    if (query.trim()) {
      const nextSongs = await api.searchSongs(query);
      if (!isLatestSongsRequest(requestId)) return;
      songs.value = nextSongs;
    } else {
      const nextSongs = await api.getSongList(sortMode.value);
      if (!isLatestSongsRequest(requestId)) return;
      songs.value = nextSongs;
    }
  }

  async function loadFavorites() {
    try {
      const favs = await api.getFavorites();
      favorites.value = new Set(favs);
    } catch {
      favorites.value = new Set();
    }
  }

  async function toggleFavorite(songPath: string) {
    try {
      const isFav = await api.toggleFavorite(songPath);
      if (isFav) {
        favorites.value.add(songPath);
      } else {
        favorites.value.delete(songPath);
      }
    } catch {
      // Silently fail
    }
  }

  function isFavorite(songPath: string): boolean {
    return favorites.value.has(songPath);
  }

  async function cleanupOrphanedFavorites() {
    try {
      await api.cleanupOrphanedFavorites();
      // Reload favorites to sync with cleaned-up state
      await loadFavorites();
    } catch {
      // Silently fail
    }
  }

  const filteredSongs = computed(() => {
    if (!showFavoritesOnly.value) return songs.value;
    return songs.value.filter(s => favorites.value.has(s.path));
  });

  return {
    songs, packs, sortMode, searchQuery, songsLoadedOnce,
    favorites, showFavoritesOnly, filteredSongs,
    loadSongs, refreshSongsList, loadPacks, setSortMode, search,
    loadFavorites, toggleFavorite, isFavorite, cleanupOrphanedFavorites,
  };
});
