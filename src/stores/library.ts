import { defineStore } from "pinia";
import { ref } from "vue";
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

  async function loadSongs(dirs: string[], options?: { force?: boolean }) {
    const force = options?.force === true;
    if (!force && songsLoadedOnce.value && songs.value.length > 0) {
      return;
    }
    await api.scanSongs(dirs);
    songs.value = await api.getSongList(sortMode.value);
    songsLoadedOnce.value = true;
  }

  async function refreshSongsList() {
    songs.value = await api.getSongList(sortMode.value);
    songsLoadedOnce.value = true;
  }

  async function loadPacks() {
    packs.value = await api.listSongPacks();
  }

  async function setSortMode(mode: SortMode) {
    sortMode.value = mode;
    songs.value = await api.getSongList(mode);
  }

  async function search(query: string) {
    searchQuery.value = query;
    if (query.trim()) {
      songs.value = await api.searchSongs(query);
    } else {
      songs.value = await api.getSongList(sortMode.value);
    }
  }

  return {
    songs, packs, sortMode, searchQuery, songsLoadedOnce,
    loadSongs, refreshSongsList, loadPacks, setSortMode, search,
  };
});
