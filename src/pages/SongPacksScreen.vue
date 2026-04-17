<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "@/shared/stores/game";
import { usePlayerStore } from "@/shared/stores/player";
import { useLibraryStore } from "@/shared/stores/library";
import { useI18n } from "@/shared/i18n";
import * as api from "@/utils/api";
import type { SongPackInfo, SongListItem } from "@/utils/api";
import { openDirectoryDialog, isTauri } from "@/utils/platform";

import EditSongModal from "./song-packs/EditSongModal.vue";
import DeletePackModal from "./song-packs/DeletePackModal.vue";
import DeleteSongModal from "./song-packs/DeleteSongModal.vue";
import ImportSongModal from "./song-packs/ImportSongModal.vue";
import CreateEmptyPackModal from "./song-packs/CreateEmptyPackModal.vue";

const router = useRouter();
const game = useGameStore();
const player = usePlayerStore();
const library = useLibraryStore();
const { t } = useI18n();

// ─── pack list (from library store cache) ──────────────────────────────────────
const loading = ref(false);
const refreshing = ref(false);
const importing = ref(false);
const statusMsg = ref("");
const statusOk = ref(true);

function normalizeSongName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function hasDuplicateSongNameInPack(packName: string, songName: string): boolean {
  const normalized = normalizeSongName(songName);
  if (!normalized) return false;
  return songsInPack(packName).some((song) => normalizeSongName(song.title || "") === normalized);
}

// packs from library store (cached)
const packs = computed(() => library.packs);

async function loadPacks(force = false) {
  loading.value = true;
  try {
    // 默认优先使用缓存；需要时可强制刷新（例如导入曲包成功后）。
    if (force || library.packs.length === 0) {
      await library.loadPacks();
    }
  } catch (e: unknown) {
    showStatus(String(e), false);
  } finally {
    loading.value = false;
  }
}

function shouldSwitchNowPlayingAfterRemoval(removedSongPath: string): boolean {
  const nowPlayingPath = player.currentSong?.path;
  return !!nowPlayingPath && nowPlayingPath === removedSongPath;
}

async function refreshSongs(opts?: { preserveCurrentPlayback?: boolean; removedSongPath?: string }) {
  const oldQueue = player.queue;
  const oldQueuePaths = oldQueue.map((s) => s.path);
  const oldCurrentPath = player.currentSong?.path ?? null;

  await game.refreshSongsList();
  // 与主界面同步：曲包页刷新后，标记主界面可直接复用这份已更新数据，不再重复拉取。
  game.needsSongRefresh = false;

  if (oldQueue.length === 0) return;

  const queueStillMatchesLibrary =
    oldQueuePaths.length > 0 && oldQueuePaths.every((path) => game.songs.some((song) => song.path === path));

  if (opts?.preserveCurrentPlayback) {
    if (opts.removedSongPath && shouldSwitchNowPlayingAfterRemoval(opts.removedSongPath)) {
      const candidateIndex = Math.min(player.queueIndex, Math.max(game.songs.length - 1, 0));
      player.setQueue(game.songs, candidateIndex);
      return;
    }

    const currentStillExists = !!oldCurrentPath && game.songs.some((song) => song.path === oldCurrentPath);
    if (currentStillExists) {
      player.syncQueuePreserveCurrent(game.songs, oldCurrentPath, player.queueIndex);
      return;
    }

    if (queueStillMatchesLibrary) {
      return;
    }
  }

  const fallbackIndex = oldCurrentPath
    ? game.songs.findIndex((song) => song.path === oldCurrentPath)
    : -1;
  const startIndex = fallbackIndex >= 0 ? fallbackIndex : Math.min(player.queueIndex, Math.max(game.songs.length - 1, 0));
  player.setQueue(game.songs, startIndex);
}

async function refreshPacks() {
  refreshing.value = true;
  try {
    await refreshSongs({ preserveCurrentPlayback: true });
    await library.loadPacks();
    showStatus(t('songPacks.refreshed'), true);
  } catch (e: unknown) {
    showStatus(String(e), false);
  } finally {
    refreshing.value = false;
  }
}

onMounted(loadPacks);

function showStatus(msg: string, ok = true) {
  statusMsg.value = msg;
  statusOk.value = ok;
  setTimeout(() => { statusMsg.value = ""; }, 4000);
}

// ─── song grouping ────────────────────────────────────────────────────────────
// Songs in the root pack have pack_name === ".root" (the actual .root directory)
const ROOT_PACK_ID = ".root";
function songsInPack(packName: string): SongListItem[] {
  return game.songs.filter((s) => s.pack === packName);
}

// ─── pack expand state ────────────────────────────────────────────────────────
const expandedPacks = ref<Set<string>>(new Set([ROOT_PACK_ID]));
function togglePack(key: string) {
  if (expandedPacks.value.has(key)) expandedPacks.value.delete(key);
  else expandedPacks.value.add(key);
}

// ─── import pack ─────────────────────────────────────────────────────────────
function onDeleteSongLoading(val: boolean) {
  deletingSongPath.value = val ? (confirmDeleteSong.value?.path ?? "") : "";
}

async function importPack() {
  const selected = await openDirectoryDialog(t("songPacks.selectDirectory"));
  if (!selected || typeof selected !== "string") return;
  if (!isTauri()) {
    showStatus(t("select.importWebNotSupported"), false);
    return;
  }
  importing.value = true;
  try {
    const result = await api.importSongPack(selected, "");
    if (result.importedCount > 0) {
      showStatus(
        t("select.importSuccess")
          .replace("{0}", String(result.importedCount))
          .replace("{1}", String(result.skippedCount))
      );
      await refreshSongs();
      await loadPacks(true);
    } else if (result.skippedCount > 0) {
      showStatus(t("songPacks.allExist").replace("{0}", String(result.skippedCount)), true);
    } else {
      showStatus(t("songPacks.noSongsFound"), false);
    }
  } catch (e: unknown) {
    showStatus(t("songPacks.importFailed") + ": " + String(e), false);
  } finally {
    importing.value = false;
  }
}

// ─── import single song ──────────────────────────────────────────────────────
const showImportSongModal = ref(false);
const songSourcePath = ref("");
const prepareResult = ref<api.PrepareImportResult | null>(null);

async function startImportSong() {
  const selected = await openDirectoryDialog(t("songPacks.selectSongDirectory"));
  if (!selected || typeof selected !== "string") return;
  if (!isTauri()) {
    showStatus(t("select.importWebNotSupported"), false);
    return;
  }

  importing.value = true;
  try {
    // First, prepare the import - this copies the folder
    const prepResult = await api.prepareSongImport(selected, "");
    prepareResult.value = prepResult;
    songSourcePath.value = selected;

    if (prepResult.hasChart) {
      // Has chart file, just import normally
      if (hasDuplicateSongNameInPack(ROOT_PACK_ID, prepResult.folderName)) {
        showStatus(t("songPacks.duplicateSongName"), false);
        return;
      }
      const result = await api.importSingleSong(selected, "");
      if (result.importedCount > 0) {
        showStatus(t("songPacks.songImported"));
        await refreshSongs();
        // Update target pack song count dynamically (pack is root or existing)
        const targetPack = ROOT_PACK_ID;
        const pack = packs.value.find((p) => p.name === targetPack);
        if (pack) {
          pack.songCount = songsInPack(pack.name).length;
        }
      } else if (result.skippedCount > 0) {
        showStatus(t("songPacks.allExist").replace("{0}", String(result.skippedCount)), true);
      } else {
        showStatus(t("songPacks.noSongsFound"), false);
      }
    } else {
      // No chart file, need to ask user for info
      showImportSongModal.value = true;
    }
  } catch (e: unknown) {
    showStatus(t("songPacks.songImportFailed") + ": " + String(e), false);
  } finally {
    importing.value = false;
  }
}

async function handleImportSongConfirm(data: {
  packName: string;
  title: string;
  artist: string;
  subtitle: string;
  genre: string;
  bpm: number;
  offset: number;
  stepsType: string;
  difficulty: string;
  meter: number;
  createChart: boolean;
  musicSourcePath: string;
  coverSourcePath: string;
  backgroundSourcePath: string;
}) {
  if (!prepareResult.value) return;

  importing.value = true;
  try {
    const targetPack = data.packName === "" ? ROOT_PACK_ID : (data.packName || ROOT_PACK_ID);
    if (hasDuplicateSongNameInPack(targetPack, data.title)) {
      showStatus(t("songPacks.duplicateSongName"), false);
      return;
    }

    // Create the chart file with user-provided info
    await api.createChartForImported(
      prepareResult.value.songDir,
      data.title,
      data.artist,
      data.subtitle,
      data.genre,
      data.bpm,
      data.offset,
      data.stepsType,
      data.difficulty,
      data.meter,
      data.createChart,
      data.musicSourcePath,
      data.coverSourcePath,
      data.backgroundSourcePath,
    );
    showImportSongModal.value = false;
    showStatus(t("songPacks.songImported"));
    // Dynamically update song list and target pack's count
    // data.packName is "" for root (no pack subdirectory) or ".root" for .root folder or a real pack name
    await refreshSongs();
    const pack = packs.value.find((p) => p.name === targetPack);
    if (pack) {
      pack.songCount = songsInPack(pack.name).length;
    }
  } catch (e: unknown) {
    showStatus(t("songPacks.songImportFailed") + ": " + String(e), false);
  } finally {
    importing.value = false;
    songSourcePath.value = "";
    prepareResult.value = null;
  }
}

// ─── delete pack ─────────────────────────────────────────────────────────────
const confirmDeletePack = ref<SongPackInfo | null>(null);

function askDeletePack(pack: SongPackInfo) {
  confirmDeletePack.value = pack;
}

async function handleDeletePackSuccess() {
  const pack = confirmDeletePack.value;
  confirmDeletePack.value = null;
  if (pack) {
    showStatus(t('songPacks.deleted').replace("{0}", pack.name));
    // Refresh pack list from library store (cache invalidation)
    await refreshSongs();
    await library.loadPacks();
  }
}

function handleDeletePackError(msg: string) {
  showStatus(t("songPacks.deleteFailed") + ": " + msg, false);
}

// ─── edit song ────────────────────────────────────────────────────────────────
const editingSong = ref<SongListItem | null>(null);

function openEditSong(song: SongListItem) {
  editingSong.value = song;
}

async function handleEditSongSuccess() {
  showStatus(t('songPacks.saveMetaSuccess'));
  await refreshSongs(); // refreshSongs updates game.songs
  editingSong.value = null;
}

function handleEditSongError(msg: string) {
  showStatus(t('songPacks.saveMetaFailed') + ": " + msg, false);
}

// ─── delete song ─────────────────────────────────────────────────────────────
const confirmDeleteSong = ref<SongListItem | null>(null);
const deletingSongPath = ref("");

async function handleDeleteSongSuccess() {
  const song = confirmDeleteSong.value;
  confirmDeleteSong.value = null;
  if (song) {
    showStatus(t('songPacks.songDeleted'));
    game.songs = game.songs.filter((s) => s.path !== song.path);
    await refreshSongs({ preserveCurrentPlayback: true, removedSongPath: song.path });
    await library.loadPacks();
  }
}

function handleDeleteSongError(msg: string) {
  showStatus(t('songPacks.songDeleteFailed') + ": " + msg, false);
}

// ─── create empty pack ─────────────────────────────────────────────────────────
const showCreateEmptyPackModal = ref(false);

function openCreateEmptyPackModal() {
  showCreateEmptyPackModal.value = true;
}

async function handleCreateEmptyPackConfirm(packName: string) {
  showCreateEmptyPackModal.value = false;
  importing.value = true;
  try {
    await api.createEmptyPack(packName);
    showStatus(t('songPacks.packCreated').replace("{0}", packName));
    await refreshSongs();
    await library.loadPacks(); // refresh pack cache
  } catch (e: unknown) {
    showStatus(t('songPacks.packCreateFailed') + ": " + String(e), false);
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <div class="song-packs-screen">
    <!-- Header -->
    <header class="top-bar">
      <button class="back-btn" @click="router.push('/options')">&larr; {{ t('back') }}</button>
      <h2>{{ t('songPacks.title') }}</h2>
      <div class="header-actions">
        <button class="icon-btn refresh-btn" :title="t('songPacks.refresh')" @click="refreshPacks" :disabled="refreshing">
          <svg v-if="!refreshing" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          <span v-else class="spinner">&#x27F3;</span>
        </button>
        <button class="icon-btn import-btn secondary" :title="t('songPacks.importSong')" @click="startImportSong">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        </button>
        <button class="icon-btn import-btn secondary" :title="t('songPacks.createEmptyPack')" @click="openCreateEmptyPackModal">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </button>
        <button class="icon-btn import-btn" :title="t('songPacks.importPack')" @click="importPack">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        </button>
      </div>
    </header>

    <div class="top-status-anchor">
      <transition name="fade">
        <div v-if="statusMsg" class="status-bar" :class="statusOk ? 'ok' : 'err'">{{ statusMsg }}</div>
      </transition>
    </div>

    <!-- Main content -->
    <div class="content">
      <div v-if="loading" class="loading">
        <span class="spinner">&#x27F3;</span> {{ t('loading') }}
      </div>
      <template v-else>
        <!-- Root pack section (always shown since root pack always exists) -->
        <section
          v-for="pack in packs"
          :key="pack.name"
          class="pack-section"
          :class="{ 'pack-root': pack.isRoot }"
        >
          <div class="pack-header" @click="togglePack(pack.name)">
            <button class="expand-btn" :class="{ expanded: expandedPacks.has(pack.name) }">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <svg class="pack-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h3l2 2h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            <div class="pack-info">
              <div class="pack-name">
                {{ pack.isRoot ? t('songPacks.rootPack') : pack.name }}
              </div>
              <div class="pack-meta">
                <span>{{ songsInPack(pack.name).length }} {{ t('songPacks.songs') }}</span>
                <template v-if="!pack.isRoot">
                  <span class="dot">·</span>
                  <span>{{ pack.sizeMb }} MB</span>
                </template>
              </div>
              <div class="pack-path">{{ pack.path }}</div>
            </div>
            <span v-if="pack.isRoot" class="root-badge">{{ t('songPacks.rootBadge') }}</span>
            <button
              v-else
              class="del-btn"
              @click.stop="askDeletePack(pack)"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              {{ t('songPacks.delete') }}
            </button>
          </div>
          <div v-if="expandedPacks.has(pack.name)" class="song-list">
            <div v-if="songsInPack(pack.name).length === 0" class="no-songs">{{ t('songPacks.noSongsInPack') }}</div>
            <div v-for="song in songsInPack(pack.name)" :key="song.path" class="song-row">
              <div class="song-info">
                <span class="song-title">{{ song.title || song.path.split('/').pop() }}</span>
                <span class="song-artist">{{ song.artist }}</span>
              </div>
              <div class="song-actions">
                <button class="song-btn edit-btn" @click.stop="openEditSong(song)">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  {{ t('songPacks.editSong') }}
                </button>
                <button class="song-btn del-song-btn" @click.stop="confirmDeleteSong = song">
                  <span v-if="deletingSongPath === song.path" class="spinner">&#x27F3;</span>
                  <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  {{ deletingSongPath === song.path ? t('loading') : t('songPacks.deleteSong') }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Empty state (when no packs at all, should not happen since root always exists) -->
        <div v-if="packs.length === 0" class="empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.3"><path d="M3 7a2 2 0 0 1 2-2h3l2 2h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          <p>{{ t('songPacks.noPacks') }}</p>
          <button class="import-cta" @click="importPack">{{ t('songPacks.clickToImport') }}</button>
        </div>
      </template>
    </div>

    <!-- Songs directory footer -->
    <div class="dir-footer">
      <span class="dir-label">{{ t('songPacks.songDirectory') }}</span>
      <span class="dir-path">{{ game.songDirectories[0] || t('songPacks.notSet') }}</span>
    </div>

    <EditSongModal
      :song="editingSong"
      @close="editingSong = null"
      @success="handleEditSongSuccess"
      @error="handleEditSongError"
    />

    <DeleteSongModal
      :song="confirmDeleteSong"
      @close="confirmDeleteSong = null"
      @success="handleDeleteSongSuccess"
      @error="handleDeleteSongError"
      @loading="onDeleteSongLoading"
    />

    <DeletePackModal
      :pack="confirmDeletePack"
      @close="confirmDeletePack = null"
      @success="handleDeletePackSuccess"
      @error="handleDeletePackError"
    />

    <ImportSongModal
      :show="showImportSongModal"
      :packs="packs"
      :default-title="prepareResult?.folderName ?? ''"
      @close="showImportSongModal = false"
      @confirm="handleImportSongConfirm"
    />

    <CreateEmptyPackModal
      :show="showCreateEmptyPackModal"
      :existing-packs="packs.map(p => p.name)"
      @close="showCreateEmptyPackModal = false"
      @confirm="handleCreateEmptyPackConfirm"
    />

    <!-- Import loading overlay -->
    <transition name="fade">
      <div v-if="importing" class="import-overlay" role="dialog" aria-modal="true">
        <div class="import-overlay-box">
          <div class="import-overlay-spinner">&#x27F3;</div>
          <div class="import-overlay-msg">{{ t('loading') }}</div>
          <button class="import-overlay-cancel" @click="importing = false">{{ t('cancel') }}</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Orbitron:wght@700&display=swap');

.song-packs-screen {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  overflow: hidden;
  position: relative;
  background: linear-gradient(180deg, var(--bg-gradient-start, #0d0d1a) 0%, var(--bg-gradient-end, #15101f) 100%);
  font-family: 'Rajdhani', sans-serif;
  color: var(--text-color);
}

.top-bar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid color-mix(in srgb, var(--primary-color) 15%, transparent);
  background: color-mix(in srgb, var(--primary-color) 4%, transparent);
}
.top-bar > * { min-width: 0; }
.top-bar h2 {
  text-align: center;
  justify-self: center;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.8rem; letter-spacing: 0.25em;
  color: rgba(255,255,255,0.35);
}
.back-btn {
  background: none; border: none; color: rgba(255,255,255,0.45);
  cursor: pointer; font-size: 0.85rem; font-family: 'Rajdhani', sans-serif;
  padding: 0.3rem 0.6rem; border-radius: 6px;
}
.back-btn:hover { color: var(--text-color); background: rgba(255,255,255,0.06); }
.header-actions {
  display: flex; align-items: center; justify-self: end; gap: 0.5rem;
}
.icon-btn {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 8px;
}
.refresh-btn {
  font-size: 0.78rem; font-weight: 700;
  font-family: 'Orbitron', sans-serif;
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
  color: color-mix(in srgb, var(--primary-color) 62%, var(--text-color)); cursor: pointer;
}
.refresh-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--primary-color) 25%, transparent); color: var(--text-color); }
.refresh-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.import-btn {
  font-size: 0.78rem; font-weight: 700;
  font-family: 'Orbitron', sans-serif;
  background: linear-gradient(135deg, var(--primary-color), var(--accent-secondary));
  border: none; color: var(--text-on-primary); cursor: pointer;
}
.import-btn:hover:not(:disabled) { filter: brightness(1.15); }
.import-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.import-btn.secondary {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
  color: color-mix(in srgb, var(--primary-color) 62%, var(--text-color));
}
.import-btn.secondary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary-color) 25%, transparent);
  color: var(--text-color);
  filter: none;
}

.top-status-anchor {
  position: relative;
  min-height: 0;
  z-index: 20;
}

.status-bar {
  position: absolute;
  top: 0.35rem;
  right: 1.25rem;
  padding: 0.5rem 1rem; font-size: 0.78rem; font-weight: 700; text-align: center;
  border-radius: 10px; border: 1px solid transparent;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  z-index: 10;
}
.status-bar.ok { background: rgba(105,240,174,0.1); color: #69f0ae; border-color: rgba(105,240,174,0.18); }
.status-bar.err { background: rgba(255,82,82,0.1); color: #ff5252; border-color: rgba(255,82,82,0.2); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.content {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 0.75rem 1.25rem;
  width: 100%; max-width: 760px; align-self: center;
  display: flex; flex-direction: column; gap: 0.5rem;
  position: relative;
}

.loading {
  display: flex; align-items: center; justify-content: center;
  gap: 0.5rem; height: 200px; color: rgba(255,255,255,0.25);
}

.empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 1rem; height: 260px;
  color: rgba(255,255,255,0.25);
  border: 1px dashed rgba(255,255,255,0.08);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
}
.empty p { font-size: 0.9rem; }
.import-cta {
  min-height: 44px;
  padding: 0.6rem 1.5rem; font-size: 0.85rem; font-weight: 700;
  background: color-mix(in srgb, var(--primary-color) 12%, transparent); border: 1px dashed color-mix(in srgb, var(--primary-color) 40%, transparent);
  border-radius: 10px; color: color-mix(in srgb, var(--primary-color) 62%, var(--text-color)); cursor: pointer;
}
.import-cta:hover { background: color-mix(in srgb, var(--primary-color) 22%, transparent); color: var(--text-color); }

.pack-section {
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px; overflow: hidden;
  background: rgba(255,255,255,0.015);
  flex-shrink: 0;
}
.pack-header {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.75rem 1rem; cursor: pointer;
  transition: background 0.15s;
}
.pack-header:hover { background: color-mix(in srgb, var(--primary-color) 6%, transparent); }

.expand-btn {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border: none; background: none;
  color: rgba(255,255,255,0.35); cursor: pointer; flex-shrink: 0;
  transition: transform 0.2s;
}
.expand-btn.expanded { transform: rotate(0deg); }
.expand-btn:not(.expanded) { transform: rotate(-90deg); }

.pack-icon-svg { flex-shrink: 0; color: color-mix(in srgb, var(--primary-color) 70%, transparent); }

.pack-info { flex: 1; min-width: 0; }
.pack-name { font-size: 0.92rem; font-weight: 700; color: var(--text-color); }
.pack-meta {
  font-size: 0.72rem; color: rgba(255,255,255,0.3);
  display: flex; align-items: center; gap: 0.4rem; margin-top: 1px;
}
.dot { color: rgba(255,255,255,0.15); }
.pack-path {
  font-size: 0.65rem; color: rgba(255,255,255,0.2);
  font-family: monospace; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; margin-top: 2px;
}
.root-badge {
  font-size: 0.6rem; font-family: 'Orbitron', sans-serif; letter-spacing: 0.1em;
  padding: 0.15rem 0.45rem; border-radius: 4px;
  background: color-mix(in srgb, var(--primary-color) 18%, transparent); color: color-mix(in srgb, var(--primary-color) 72%, var(--text-color));
  border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
}

.pack-root {
  border-color: color-mix(in srgb, var(--primary-color) 25%, rgba(255,255,255,0.06));
}

.del-btn {
  display: flex; align-items: center; justify-content: center; gap: 0.3rem;
  padding: 0.28rem 0.65rem; font-size: 0.72rem;
  background: rgba(255,82,82,0.07); border: 1px solid rgba(255,82,82,0.2);
  border-radius: 6px; color: #ff7070; cursor: pointer; flex-shrink: 0;
}
.del-btn:hover:not(:disabled) { background: rgba(255,82,82,0.16); }
.del-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.song-list {
  border-top: 1px solid rgba(255,255,255,0.04);
  padding: 0.25rem 0;
  max-height: 400px;
  overflow-y: auto;
}
.no-songs {
  padding: 0.75rem 1rem 0.75rem 3rem;
  font-size: 0.75rem; color: rgba(255,255,255,0.2); font-style: italic;
}
.song-row {
  display: flex; align-items: center;
  padding: 0.5rem 1rem 0.5rem 3.25rem; gap: 0.75rem;
  transition: background 0.12s;
}
.song-row:hover { background: rgba(255,255,255,0.025); }
.song-info { flex: 1; min-width: 0; }
.song-title {
  font-size: 0.82rem; font-weight: 600; color: rgba(255,255,255,0.85);
  display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.song-artist {
  font-size: 0.7rem; color: rgba(255,255,255,0.3);
  display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.song-actions { display: flex; gap: 0.35rem; flex-shrink: 0; }
.song-btn {
  display: flex; align-items: center; justify-content: center; gap: 0.25rem;
  padding: 0.22rem 0.55rem; font-size: 0.68rem;
  border-radius: 5px; cursor: pointer; border: 1px solid;
  font-family: 'Rajdhani', sans-serif;
}
.edit-btn {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent); border-color: color-mix(in srgb, var(--primary-color) 25%, transparent); color: color-mix(in srgb, var(--primary-color) 62%, var(--text-color));
}
.edit-btn:hover { background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
.del-song-btn {
  background: rgba(255,82,82,0.07); border-color: rgba(255,82,82,0.2); color: #ff7070;
}
.del-song-btn:hover { background: rgba(255,82,82,0.16); }

.dir-footer {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.55rem 1.25rem;
  border-top: 1px solid rgba(255,255,255,0.04);
  background: rgba(0,0,0,0.2);
}
.dir-label {
  font-size: 0.66rem; color: rgba(255,255,255,0.2);
  letter-spacing: 0.1em; text-transform: uppercase; flex-shrink: 0;
}
.dir-path {
  font-size: 0.7rem; color: rgba(255,255,255,0.25);
  font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.spinner { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Import loading overlay */
.import-overlay {
  position: absolute; inset: 0; z-index: 200;
  display: flex; align-items: center; justify-content: center;
  background: var(--overlay-bg, rgba(13, 13, 26, 0.72));
  backdrop-filter: blur(10px);
}
.import-overlay-box {
  display: flex; flex-direction: column; align-items: center; gap: 1rem;
  padding: 2.5rem 3rem;
  background: var(--section-bg, rgba(20, 12, 40, 0.92));
  border: 1px solid var(--border-color, color-mix(in srgb, var(--primary-color) 30%, transparent));
  border-radius: 20px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
}
.import-overlay-spinner {
  font-size: 2.5rem; color: var(--primary-color);
  animation: spin 1s linear infinite;
}
.import-overlay-msg {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.78rem; letter-spacing: 0.2em;
  color: var(--text-color, rgba(255,255,255,0.5));
}
.import-overlay-cancel {
  margin-top: 0.5rem; padding: 0.45rem 1.6rem;
  background: transparent;
  border: 1px solid var(--border-color, rgba(255,255,255,0.12));
  border-radius: 8px; color: var(--text-color, rgba(255,255,255,0.35));
  font-size: 0.8rem; cursor: pointer; transition: all 0.15s;
  font-family: 'Rajdhani', sans-serif;
}
.import-overlay-cancel:hover {
  border-color: var(--accent-red, rgba(255, 80, 80, 0.45));
  color: var(--accent-red-hover, rgba(255, 110, 110, 0.85));
  background: var(--accent-red-bg, rgba(255, 80, 80, 0.07));
}

@media (max-width: 760px) {
  .top-bar {
    grid-template-columns: 1fr;
    justify-items: stretch;
    gap: 0.5rem;
  }
  .top-bar h2 {
    order: -1;
    width: 100%;
  }
  .header-actions {
    justify-self: stretch;
    justify-content: flex-end;
  }
  .pack-header { align-items: flex-start; }
  .song-row { flex-wrap: wrap; align-items: flex-start; padding-left: 1.25rem; }
  .song-actions { width: 100%; flex-wrap: wrap; }
  .dir-footer { flex-direction: column; align-items: flex-start; }
}
</style>
