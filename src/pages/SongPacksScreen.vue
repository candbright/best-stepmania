<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "@/shared/stores/session";
import { usePlayerStore } from "@/shared/stores/player";
import { useLibraryStore } from "@/shared/stores/library";
import { useSettingsStore } from "@/shared/stores/settings";
import { useI18n } from "@/shared/i18n";
import * as api from "@/shared/api";
import type { SongPackInfo, SongListItem } from "@/shared/api";
import { openDirectoryDialog, isTauri } from "@/shared/lib/platform";

import EditSongModal from "./song-packs/EditSongModal.vue";
import DeletePackModal from "./song-packs/DeletePackModal.vue";
import DeleteSongModal from "./song-packs/DeleteSongModal.vue";
import ImportSongModal from "./song-packs/ImportSongModal.vue";
import CreateEmptyPackModal from "./song-packs/CreateEmptyPackModal.vue";
import { useSongImportFlow } from "./song-packs/useSongImportFlow";

const router = useRouter();
const session = useSessionStore();
const player = usePlayerStore();
const library = useLibraryStore();
const settings = useSettingsStore();
const { t } = useI18n();

// ─── pack list (from library store cache) ──────────────────────────────────────
const loading = ref(false);
const refreshing = ref(false);
const importing = ref(false);
const importingAction = ref<"pack" | "song" | "createPack" | null>(null);
const statusMsg = ref("");
const statusOk = ref(true);

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

  await library.refreshSongsList();
  // 与主界面同步：曲包页刷新后，标记主界面可直接复用这份已更新数据，不再重复拉取。
  session.needsSongRefresh = false;

  if (oldQueue.length === 0) return;

  const queueStillMatchesLibrary =
    oldQueuePaths.length > 0 && oldQueuePaths.every((path) => library.songs.some((song) => song.path === path));

  if (opts?.preserveCurrentPlayback) {
    if (opts.removedSongPath && shouldSwitchNowPlayingAfterRemoval(opts.removedSongPath)) {
      const candidateIndex = Math.min(player.queueIndex, Math.max(library.songs.length - 1, 0));
      // 删除当前播放曲目后仅同步队列，避免在系统设置页触发新的预览播放。
      player.syncQueuePreserveCurrent(library.songs, null, candidateIndex);
      return;
    }

    const currentStillExists = !!oldCurrentPath && library.songs.some((song) => song.path === oldCurrentPath);
    if (currentStillExists) {
      player.syncQueuePreserveCurrent(library.songs, oldCurrentPath, player.queueIndex);
      return;
    }

    if (queueStillMatchesLibrary) {
      return;
    }
  }

  const fallbackIndex = oldCurrentPath
    ? library.songs.findIndex((song) => song.path === oldCurrentPath)
    : -1;
  const startIndex = fallbackIndex >= 0 ? fallbackIndex : Math.min(player.queueIndex, Math.max(library.songs.length - 1, 0));
  player.setQueue(library.songs, startIndex);
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
  return library.songs.filter((s) => s.pack === packName);
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
  if (importing.value) return;
  importingAction.value = "pack";
  const selected = await openDirectoryDialog(t("songPacks.selectDirectory"));
  if (!selected || typeof selected !== "string") {
    importingAction.value = null;
    return;
  }
  if (!isTauri()) {
    showStatus(t("select.importWebNotSupported"), false);
    importingAction.value = null;
    return;
  }
  importing.value = true;
  try {
    const result = await api.importSongPack(selected);
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
    importingAction.value = null;
  }
}

const {
  showImportSongModal,
  importSongError,
  importSongDefaults,
  startImportSong,
  handleImportSongConfirm,
  closeImportSongModal,
} = useSongImportFlow({
  packs,
  importing,
  importingAction,
  songsInPack,
  showStatus,
  refreshSongs: () => refreshSongs(),
  t,
});

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
  await refreshSongs(); // refreshSongs updates library.songs
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
    library.songs = library.songs.filter((s) => s.path !== song.path);
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
  importingAction.value = "createPack";
  importing.value = true;
  try {
    await api.createEmptyPack(packName);
    showCreateEmptyPackModal.value = false;
    showStatus(t('songPacks.packCreated').replace("{0}", packName));
    await refreshSongs();
    await library.loadPacks(); // refresh pack cache
  } catch (e: unknown) {
    showStatus(t('songPacks.packCreateFailed') + ": " + String(e), false);
  } finally {
    importing.value = false;
    importingAction.value = null;
  }
}
</script>

<template>
  <div class="song-packs-screen">
    <!-- Header -->
    <header class="top-bar">
      <div class="top-bar-lead">
        <button class="tb-btn" :aria-label="t('back')" @click="router.push('/options')">&larr;</button>
      </div>
      <h2 class="top-bar-title">{{ t('songPacks.title') }}</h2>
      <div class="top-bar-trail header-actions">
        <button class="icon-btn refresh-btn" :title="t('songPacks.refresh')" @click="refreshPacks" :disabled="refreshing">
          <svg v-if="!refreshing" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          <span v-else class="spinner">&#x27F3;</span>
        </button>
        <button class="icon-btn import-btn secondary" :title="t('songPacks.importSong')" @click="startImportSong" :disabled="importing">
          <span v-if="importingAction === 'song'" class="spinner">&#x27F3;</span>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        </button>
        <button class="icon-btn import-btn secondary" :title="t('songPacks.createEmptyPack')" @click="openCreateEmptyPackModal" :disabled="importing">
          <span v-if="importingAction === 'createPack'" class="spinner">&#x27F3;</span>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="icon-btn import-btn" :title="t('songPacks.importPack')" @click="importPack" :disabled="importing">
          <span v-if="importingAction === 'pack'" class="spinner">&#x27F3;</span>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
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
      <span class="dir-path">{{ settings.songDirectories[0] || t('songPacks.notSet') }}</span>
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
      :error-message="importSongError"
      :default-title="importSongDefaults.title"
      :default-artist="importSongDefaults.artist"
      :default-subtitle="importSongDefaults.subtitle"
      :default-genre="importSongDefaults.genre"
      :default-bpm="importSongDefaults.bpm"
      :default-offset="importSongDefaults.offset"
      :default-music-source-path="importSongDefaults.musicSourcePath"
      :default-cover-source-path="importSongDefaults.coverSourcePath"
      :default-background-source-path="importSongDefaults.backgroundSourcePath"
      :default-chart-source-path="importSongDefaults.chartSourcePath"
      :force-create-chart="true"
      :submitting="importing"
      @close="closeImportSongModal"
      @confirm="handleImportSongConfirm"
    />

    <CreateEmptyPackModal
      :show="showCreateEmptyPackModal"
      :existing-packs="packs.map(p => p.name)"
      :submitting="importingAction === 'createPack' && importing"
      @close="showCreateEmptyPackModal = false"
      @confirm="handleCreateEmptyPackConfirm"
    />
  </div>
</template>

<style scoped>
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
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-color) 82%, transparent);
  backdrop-filter: blur(12px);
  position: relative;
}
.top-bar-lead,
.top-bar-trail {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
}
.top-bar-lead { justify-content: flex-start; }
.top-bar-trail { justify-content: flex-end; }
.top-bar-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  text-align: center;
  font-family: "Orbitron", sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.3em;
  color: var(--text-muted);
  text-transform: uppercase;
}
.tb-btn {
  width: 2rem;
  height: 2rem;
  padding: 0;
  border-radius: 6px;
  background: var(--section-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem;
  font-family: "Rajdhani", sans-serif;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.tb-btn:hover {
  background: var(--primary-color-bg);
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  color: var(--text-color);
}
.header-actions {
  display: flex; align-items: center; gap: 0.5rem;
  margin-left: auto;
  flex-wrap: nowrap;
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
  padding: 1rem 1rem 1.25rem;
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
  padding: 0.6rem 1rem;
  border-top: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-color) 86%, transparent);
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

@media (max-width: 760px) {
  .top-bar {
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .top-bar-title {
    position: static;
    transform: none;
    order: -1;
    width: 100%;
  }
  .top-bar-lead,
  .top-bar-trail {
    flex: 1 1 auto;
  }
  .header-actions {
    justify-content: flex-end;
  }
  .pack-header { align-items: flex-start; }
  .song-row { flex-wrap: wrap; align-items: flex-start; padding-left: 1.25rem; }
  .song-actions { width: 100%; flex-wrap: wrap; }
  .dir-footer { flex-direction: column; align-items: flex-start; }
}
</style>
