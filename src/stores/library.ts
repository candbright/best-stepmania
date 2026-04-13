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
    await api.scanSongs(dirs);
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

  return {
    songs, packs, sortMode, searchQuery, songsLoadedOnce,
    loadSongs, refreshSongsList, loadPacks, setSortMode, search,
  };
});
