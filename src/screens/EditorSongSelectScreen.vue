<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "@/stores/game";
import { usePlayerStore } from "@/stores/player";
import { useI18n } from "@/i18n";
import * as api from "@/utils/api";
import type { SongListItem } from "@/utils/api";
import { playMenuMove, playMenuBack, setUiSfxVolume } from "@/utils/sfx";
import { openDirectoryDialog, isTauri } from "@/utils/platform";

import CreateSongModal from "./select-music/CreateSongModal.vue";
import FilterModal from "./select-music/FilterModal.vue";
import DeleteSongModal from "./song-packs/DeleteSongModal.vue";
import { ensureMinElapsed } from "@/utils/loadingGate";
import { primeEditorEntryResources } from "./editor/editorEntryPrefetch";
import { useSessionStore } from "@/stores/session";
import { useBlockingOverlayStore } from "@/stores/blockingOverlay";

const router = useRouter();
const game = useGameStore();
const player = usePlayerStore();
const session = useSessionStore();
const blockingOverlay = useBlockingOverlayStore();
const { t } = useI18n();
const importing = ref(false);
const importStatus = ref("");
const bannerCache = ref<Record<string, string>>({});
const showCreateSongModal = ref(false);
const showFilterModal = ref(false);
const songScrollRef = ref<HTMLElement | null>(null);

/** Last query passed to `navigateToEditorWithPrefetch` (for retry). */
const pendingEditorRouteQuery = ref<Record<string, string> | undefined>(undefined);
/** True after prefetch OK and `router.push("/editor")` — unmount must not clear primed session. */
const editorNavHandoffToEditor = ref(false);
let editorLoadAbortCtrl: AbortController | null = null;

const diffMin = ref<number | null>(null);
const diffMax = ref<number | null>(null);
const filterSearch = ref("");
const filterPack = ref("");
const filterStepsType = ref("");

const hasActiveFilter = computed(() =>
  diffMin.value !== null ||
  diffMax.value !== null ||
  filterSearch.value !== "" ||
  filterPack.value !== "" ||
  filterStepsType.value !== "",
);

const activeFilterCount = computed(() => {
  let n = 0;
  if (diffMin.value !== null || diffMax.value !== null) n++;
  if (filterSearch.value !== "") n++;
  if (filterPack.value !== "") n++;
  if (filterStepsType.value !== "") n++;
  return n;
});

// 难度颜色
const DIFF_COLORS: Record<string, string> = {
  Beginner: "#00e5ff", Easy: "#69f0ae", Medium: "#ffd740",
  Hard: "#ff6d00", Challenge: "#e040fb", Edit: "#78909c",
};

const filteredSongs = computed(() => {
  return game.songs.filter((s) => {
    if (filterSearch.value) {
      const q = filterSearch.value.toLowerCase();
      if (
        !s.title.toLowerCase().includes(q) &&
        !(s.artist ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (filterPack.value && s.pack !== filterPack.value) return false;

    const charts = s.charts ?? [];
    if (charts.length === 0) {
      return true;
    }
    let hasMatchingChart = false;
    for (const c of charts) {
      if (filterStepsType.value && c.stepsType !== filterStepsType.value) {
        continue;
      }
      if (diffMin.value !== null && c.meter < diffMin.value) continue;
      if (diffMax.value !== null && c.meter > diffMax.value) continue;
      hasMatchingChart = true;
      break;
    }
    return hasMatchingChart;
  });
});

const filteredCharts = computed(() => {
  let charts = game.charts ?? [];
  if (filterStepsType.value) {
    charts = charts.filter((c) => c.stepsType === filterStepsType.value);
  }
  if (diffMin.value !== null || diffMax.value !== null) {
    charts = charts.filter((c) => {
      const m = c.meter;
      if (diffMin.value !== null && m < diffMin.value) return false;
      if (diffMax.value !== null && m > diffMax.value) return false;
      return true;
    });
  }
  return charts;
});

const collapsedPacks = ref<Set<string>>(new Set());

const ROOT_PACK_KEY = "__ROOT__";
/** 磁盘上的根曲包目录名，扫描结果里 `pack` 为该值；与 `import::ROOT_PACK_ID` 一致 */
const PHYSICAL_ROOT_PACK = ".root";

const groupedSongs = computed(() => {
  const groups: { packKey: string; packLabel: string; songs: { song: typeof game.songs[0]; idx: number }[] }[] = [];
  const packMap = new Map<string, typeof groups[0]>();
  filteredSongs.value.forEach(song => {
    const idx = game.songs.indexOf(song);
    const pack = (song.pack ?? "").trim();
    const isRootPack = pack === "" || pack === PHYSICAL_ROOT_PACK;
    const packKey = isRootPack ? ROOT_PACK_KEY : pack;
    let g = packMap.get(packKey);
    if (!g) {
      g = {
        packKey,
        packLabel: isRootPack ? t("select.rootPack") : pack,
        songs: [] as typeof groups[0]["songs"],
      };
      packMap.set(packKey, g);
      groups.push(g);
    }
    g.songs.push({ song, idx });
  });
  const showEmptyRoot = filterPack.value === "" && !packMap.has(ROOT_PACK_KEY);
  if (showEmptyRoot) {
    groups.unshift({
      packKey: ROOT_PACK_KEY,
      packLabel: t("select.rootPack"),
      songs: [] as typeof groups[0]["songs"],
    });
  }
  return groups;
});

const existingPacks = computed(() => {
  const uniq = new Set<string>();
  for (const s of game.songs) {
    const p = (s.pack ?? "").trim();
    if (p && p !== PHYSICAL_ROOT_PACK) uniq.add(p);
  }
  return Array.from(uniq).sort((a, b) => a.localeCompare(b));
});

const confirmDeleteSong = ref<SongListItem | null>(null);

function askDeleteCurrentSong() {
  if (game.currentSong) confirmDeleteSong.value = game.currentSong;
}

async function handleDeleteSongSuccess() {
  const song = confirmDeleteSong.value;
  confirmDeleteSong.value = null;
  if (!song) return;

  const removedIndex = game.currentSongIndex;
  const { path: removedPath } = song;
  delete bannerCache.value[removedPath];

  await game.refreshSongsList();
  game.needsSongRefresh = false;

  if (game.songs.length === 0) {
    player.cleanup();
    await game.selectSong(-1);
    player.setQueue([], 0);
    if (player.status === "idle") {
      player.playDefaultMusic();
    }
  } else {
    const nextIndex = Math.min(Math.max(removedIndex, 0), game.songs.length - 1);
    await game.selectSong(nextIndex);
    player.setQueue(game.songs, nextIndex);
  }

  importStatus.value = t("songPacks.songDeleted");
  setTimeout(() => {
    importStatus.value = "";
  }, 4000);
}

function handleDeleteSongError(msg: string) {
  importStatus.value = `${t("songPacks.songDeleteFailed")}: ${msg}`;
  setTimeout(() => {
    importStatus.value = "";
  }, 5000);
}

const canEditCurrentSong = computed(() => {
  return game.currentSong != null;
});

function togglePack(packKey: string) {
  if (collapsedPacks.value.has(packKey)) collapsedPacks.value.delete(packKey);
  else collapsedPacks.value.add(packKey);
  collapsedPacks.value = new Set(collapsedPacks.value);
}

function ensureCurrentSongVisible() {
  requestAnimationFrame(() => {
    const container = songScrollRef.value;
    if (!container || game.currentSongIndex < 0) return;
    const selected = container.querySelector(".song-row.selected") as HTMLElement | null;
    selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

function selectSong(idx: number) {
  game.selectSong(idx); playMenuMove();
  player.playSongAt(idx);
  loadBannerLazy(idx);
}

function onFilterClear() {
  diffMin.value = null;
  diffMax.value = null;
  filterSearch.value = "";
  filterPack.value = "";
  filterStepsType.value = "";
}

function onFilterApply() {
  /* state already synced via v-model from FilterModal */
}

function cancelEditorNavLoad() {
  editorLoadAbortCtrl?.abort();
  editorLoadAbortCtrl = null;
  editorNavHandoffToEditor.value = false;
  session.clearEditorEntryPrime();
  blockingOverlay.hide();
}

async function navigateToEditorWithPrefetch(routeQuery?: Record<string, string>) {
  if (!canEditCurrentSong.value) return;
  pendingEditorRouteQuery.value = routeQuery;
  editorNavHandoffToEditor.value = false;
  editorLoadAbortCtrl = new AbortController();
  blockingOverlay.show({
    message: t("loadingPhase.preparing"),
    onCancel: cancelEditorNavLoad,
    onRetry: null,
  });
  const started = performance.now();
  try {
    await primeEditorEntryResources(
      (msg) => blockingOverlay.updateMessage(msg),
      t,
      editorLoadAbortCtrl.signal,
    );
    if (editorLoadAbortCtrl?.signal.aborted) return;
    blockingOverlay.updateMessage(t("loadingPhase.navigate"));
    editorNavHandoffToEditor.value = true;
    await router.push({ path: "/editor", query: routeQuery ?? {} });
  } catch (e: unknown) {
    editorNavHandoffToEditor.value = false;
    if (e instanceof DOMException && e.name === "AbortError") {
      editorLoadAbortCtrl = null;
      blockingOverlay.hide();
      return;
    }
    console.error(e);
    session.clearEditorEntryPrime();
    blockingOverlay.setFailed(t("loadingOverlay.failed"), () => {
      void navigateToEditorWithPrefetch(pendingEditorRouteQuery.value);
    });
  } finally {
    if (editorLoadAbortCtrl?.signal.aborted) {
      editorLoadAbortCtrl = null;
      return;
    }
    await ensureMinElapsed(started, 1500);
    editorLoadAbortCtrl = null;
  }
}

function openEditor() {
  void navigateToEditorWithPrefetch();
}

function goBack() {
  playMenuBack();
  router.push("/");
}

function cycleSortMode() {
  const modes = ["title", "artist", "bpm", "pack"] as const;
  const cur = modes.indexOf(game.sortMode);
  game.setSortMode(modes[(cur + 1) % modes.length]);
}

function loadBannerLazy(idx: number) {
  const song = game.songs[idx];
  if (!song || bannerCache.value[song.path]) return;
  const load = async () => {
    try {
      const assetPath = await api.getSongAssetPath(song.path, "banner");
      bannerCache.value[song.path] = await api.readFileBase64(assetPath);
    } catch { /* no banner */ }
  };
  if (typeof requestIdleCallback !== "undefined")
    requestIdleCallback(() => load(), { timeout: 2000 });
  else setTimeout(load, 100);
}

function preloadAllBanners() {
  const batchSize = 5;
  let i = 0;
  function nextBatch() {
    const end = Math.min(i + batchSize, game.songs.length);
    for (; i < end; i++) {
      loadBannerLazy(i);
    }
    if (i < game.songs.length) {
      setTimeout(nextBatch, 50);
    }
  }
  nextBatch();
}

async function importSongs() {
  try {
    const selected = await openDirectoryDialog(t("select.import"));
    if (!selected) return;
    importing.value = true; importStatus.value = "";

    if (!isTauri()) {
      importStatus.value = t("select.importWebNotSupported");
      return;
    }

    const result = await api.importSongPack(selected as string, "");
    importStatus.value = t("select.importSuccess")
      .replace("{0}", String(result.importedCount))
      .replace("{1}", String(result.skippedCount));
    if (result.importedCount > 0) {
      const oldPaths = new Set(game.songs.map((s) => s.path));
      const newSongs = await api.getSongList(game.sortMode);
      game.songs = newSongs;

      const firstImportedIdx = newSongs.findIndex((s) => !oldPaths.has(s.path));
      const nextIndex = firstImportedIdx >= 0
        ? firstImportedIdx
        : Math.max(0, Math.min(game.currentSongIndex, newSongs.length - 1));

      if (newSongs.length > 0) {
        await game.selectSong(nextIndex);
        player.setQueue(newSongs, nextIndex);
      }
    }
  } catch (e: unknown) {
    importStatus.value = t("select.importError") + ": " + String(e);
  } finally {
    importing.value = false;
    setTimeout(() => { importStatus.value = ""; }, 5000);
  }
}

function openCreateSongModal() {
  showCreateSongModal.value = true;
}

async function handleCreateSuccess(msg: string) {
  showCreateSongModal.value = false;
  importStatus.value = msg;
  setTimeout(() => { importStatus.value = ""; }, 3500);
  await navigateToEditorWithPrefetch({ newChart: "1" });
}

function handleCreateError(msg: string) {
  importStatus.value = msg;
  setTimeout(() => { importStatus.value = ""; }, 5000);
}

const sortLabel = computed(() => t(`select.sort.${game.sortMode}` as string));

function difficultyLabel(diff: string) {
  const key = `difficulty.${diff}`;
  const translated = t(key);
  return translated === key ? diff : translated;
}

function stepsTypeLabel(stepsType: string) {
  const key = `stepsType.${stepsType}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return stepsType.replace("pump-", "").replace("dance-", "");
}

onMounted(async () => {
  setUiSfxVolume((game.uiSfxVolume ?? 70) / 100);

  if (game.resumeFromEditor) {
    game.resumeFromEditor = false;
    if (game.currentSongIndex >= 0) {
      player.cleanup();
      player.setQueue(game.songs, game.currentSongIndex);
      player.playSongAt(game.currentSongIndex, true);
    }
    ensureCurrentSongVisible();
    preloadAllBanners();
    return;
  }

  // 初次加载由主界面统一完成；这里只消费缓存。
  if (player.queue.length === 0 && game.songs.length > 0) {
    player.setQueue(game.songs, 0);
    if (player.status === "idle") {
      player.playDefaultMusic();
    }
    ensureCurrentSongVisible();
    preloadAllBanners();
  } else {
    ensureCurrentSongVisible();
    preloadAllBanners();
  }
});

watch(() => game.currentSongIndex, () => ensureCurrentSongVisible());

onUnmounted(() => {
  editorLoadAbortCtrl?.abort();
  editorLoadAbortCtrl = null;
  if (editorNavHandoffToEditor.value) {
    editorNavHandoffToEditor.value = false;
    return;
  }
  session.clearEditorEntryPrime();
  blockingOverlay.hide();
});
</script>

<template>
  <div class="sms">
    <div class="sms-bg">
      <div class="bg-grid" />
      <div class="bg-glow g1" />
      <div class="bg-glow g2" />
    </div>

    <header class="topbar">
      <button class="tb-btn" @click="goBack">←</button>
      <div class="topbar-center">
        <span class="topbar-title">{{ t('editorSelect.title') }}</span>
      </div>
      <div class="topbar-actions">
        <button
          class="tb-btn filter-btn"
          :class="{ active: hasActiveFilter }"
          @click="showFilterModal = true"
        >
          {{ t('select.filter') }}
          <span v-if="activeFilterCount > 0" class="filter-badge">{{ activeFilterCount }}</span>
        </button>
        <button class="tb-btn sort-btn" @click="cycleSortMode">{{ sortLabel }}</button>
        <button class="tb-btn" @click="openCreateSongModal">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="tb-btn" @click="importSongs" :disabled="importing">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        </button>
      </div>
    </header>

    <div v-if="importStatus" class="import-toast" :class="{ error: importStatus.includes('error') || importStatus.includes('\u51fa\u9519') }">
      {{ importStatus }}
    </div>

    <div class="sms-body">
      <!-- Song list -->
      <div class="song-panel">
        <div ref="songScrollRef" class="song-scroll">
          <div v-for="group in groupedSongs" :key="group.packKey" class="pack-group">
            <button class="pack-header" @click="togglePack(group.packKey)">
              <span class="pack-arrow" :class="{ open: !collapsedPacks.has(group.packKey) }">▶</span>
              <span class="pack-name">{{ group.packLabel }}</span>
              <span class="pack-count">{{ group.songs.length }}</span>
            </button>
            <div v-if="!collapsedPacks.has(group.packKey)" class="pack-songs">
              <div
                v-if="group.packKey === ROOT_PACK_KEY && group.songs.length === 0 && game.songs.length === 0"
                class="empty-state empty-state--in-pack"
              >
                <div class="empty-icon">♪</div>
                <p class="empty-title">{{ t('select.noSongs') }}</p>
                <p class="empty-hint">{{ t('select.noSongsHint') }}</p>
                <button class="cta-btn" @click="importSongs">{{ t('select.import') }}</button>
              </div>
              <button v-for="{ song, idx } in group.songs" :key="song.path"
                class="song-row"
                :class="{
                  selected: game.currentSongIndex === idx,
                  'song-row--no-charts': (song.charts?.length ?? 0) === 0,
                }"
                @click="selectSong(idx)" @dblclick="openEditor">
                <div class="song-thumb">
                  <img v-if="bannerCache[song.path]" :src="bannerCache[song.path]" class="thumb-img" />
                  <div v-else class="thumb-ph" :style="{ '--h': idx * 37 % 360 }">{{ song.title[0] }}</div>
                </div>
                <div class="song-text">
                  <div class="song-name">{{ song.title }}</div>
                  <div class="song-artist">{{ song.artist }}</div>
                </div>
                <span
                  v-if="(song.charts?.length ?? 0) === 0"
                  class="song-no-charts-pill"
                >{{ t('editorSelect.noChartsBadge') }}</span>
                <div class="song-bpm">{{ song.displayBpm }}</div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Detail panel -->
      <div class="detail-panel">
        <template v-if="game.currentSong">
          <div class="hero">
            <div class="hero-art">
              <img v-if="bannerCache[game.currentSong.path]" :src="bannerCache[game.currentSong.path]" class="hero-img" />
              <div v-else class="hero-ph" :style="{ '--h': game.currentSongIndex * 37 % 360 }">{{ game.currentSong.title[0] }}</div>
              <div class="hero-fade" />
            </div>
            <div class="hero-info">
              <h2 class="hero-title">{{ game.currentSong.title }}</h2>
              <p v-if="game.currentSong.subtitle" class="hero-subtitle">{{ game.currentSong.subtitle }}</p>
              <p class="hero-artist">{{ game.currentSong.artist }}</p>
              <span class="bpm-badge">♪ {{ game.currentSong.displayBpm }} {{ t('select.bpmUnit') }}</span>
            </div>
          </div>

          <div class="detail-panel-inner">
            <div class="section-label">{{ t('select.charts') }}</div>
            <div class="diff-list">
              <button
                v-for="chart in filteredCharts"
                :key="chart.chartIndex"
                type="button"
                class="diff-btn"
                :class="{ active: chart.chartIndex === game.currentChartIndex }"
                :style="{ '--dc': DIFF_COLORS[chart.difficulty] || '#888' }"
                @click="game.selectChart(chart.chartIndex)"
              >
                <span class="diff-gem" />
                <span class="diff-name">{{ difficultyLabel(chart.difficulty) }}</span>
                <span class="diff-meter">{{ chart.meter }}</span>
                <span class="diff-type">{{ stepsTypeLabel(chart.stepsType) }}</span>
                <span class="diff-notes">{{ chart.noteCount }} {{ t('select.notes') }}</span>
              </button>
              <div v-if="filteredCharts.length === 0" class="no-charts">
                {{ (game.charts?.length ?? 0) === 0
                  ? t('editorSelect.noChartsInSong')
                  : t('select.noMatchingCharts') }}
              </div>
            </div>
          </div>

          <div class="action-row">
            <button type="button" class="play-btn" :disabled="!canEditCurrentSong" @click="openEditor">
              {{ t('editorSelect.openEditor') }} ▶
            </button>
            <button
              type="button"
              class="delete-song-btn"
              :disabled="!canEditCurrentSong"
              @click="askDeleteCurrentSong"
            >
              {{ t('editorSelect.deleteSong') }}
            </button>
          </div>
        </template>
        <div v-else class="no-selection">
          <div class="no-sel-icon">▶</div>
          <p>{{ t('select.selectSong') }}</p>
        </div>
      </div>
    </div>

    <FilterModal
      v-if="showFilterModal"
      :diffMin="diffMin"
      :diffMax="diffMax"
      :searchQuery="filterSearch"
      :filterPack="filterPack"
      :existingPacks="existingPacks"
      :showStepsTypeFilter="true"
      :filterStepsType="filterStepsType"
      @update:diffMin="diffMin = $event"
      @update:diffMax="diffMax = $event"
      @update:searchQuery="filterSearch = $event"
      @update:filterPack="filterPack = $event"
      @update:filterStepsType="filterStepsType = $event"
      @apply="onFilterApply"
      @clear="onFilterClear"
      @close="showFilterModal = false"
    />

    <DeleteSongModal
      :song="confirmDeleteSong"
      @close="confirmDeleteSong = null"
      @success="handleDeleteSongSuccess"
      @error="handleDeleteSongError"
    />

    <CreateSongModal
      :show="showCreateSongModal"
      :existingPacks="existingPacks"
      @close="showCreateSongModal = false"
      @success="handleCreateSuccess"
      @error="handleCreateError"
    />
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Orbitron:wght@700;900&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.sms {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  font-family: 'Rajdhani', sans-serif;
  color: var(--text-color);
  background: linear-gradient(165deg, var(--bg-gradient-start) 0%, var(--bg-color) 48%, var(--bg-gradient-end) 100%);
  overflow: hidden;
  position: relative;
  padding-top: 52px;
}

/* ── Background ── */
.sms-bg { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.bg-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--primary-color) 14%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--primary-color) 14%, transparent) 1px, transparent 1px);
  background-size: 40px 40px;
  animation: gridDrift 20s linear infinite;
}
@keyframes gridDrift { to { background-position: 40px 40px; } }
.bg-glow {
  position: absolute; border-radius: 50%;
  filter: blur(80px); opacity: 0.18;
  animation: glowPulse 8s ease-in-out infinite alternate;
}
.g1 { width: 500px; height: 500px; background: var(--primary-color); top: -100px; left: -100px; }
.g2 { width: 400px; height: 400px; background: var(--primary-color-hover); bottom: -100px; right: 20%; animation-delay: -4s; }
@keyframes glowPulse { from { opacity: 0.12; } to { opacity: 0.22; } }

/* ── Topbar ── */
.topbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 1001;
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.6rem 1rem;
  background: color-mix(in srgb, var(--bg-color) 82%, transparent);
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(12px);
}

.topbar-center { flex: 1; display: flex; justify-content: center; }
.topbar-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.75rem; letter-spacing: 0.35em;
  color: var(--text-muted);
  text-transform: uppercase;
}
.topbar-actions { display: flex; gap: 0.4rem; }
.tb-btn,
.play-btn,
.cta-btn,
.path-btn,
.modal-btn {
  justify-content: center;
}
.tb-btn {
  padding: 0.35rem 0.65rem; border-radius: 6px;
  background: var(--section-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem; font-family: 'Rajdhani', sans-serif;
  transition: all 0.15s;
}
.tb-btn:hover {
  background: var(--primary-color-bg);
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  color: var(--text-color);
}
.tb-btn.active {
  background: color-mix(in srgb, var(--primary-color) 18%, var(--section-bg));
  border-color: var(--primary-color);
  color: var(--text-color);
}
.tb-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.sort-btn,
.filter-btn {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
}
.filter-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.filter-badge {
  margin-left: 0.35rem;
  min-width: 1.15em;
  padding: 0.04rem 0.32rem;
  border-radius: 999px;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.2;
  background: color-mix(in srgb, var(--primary-color-hover) 38%, transparent);
  color: var(--text-color);
}

.import-toast {
  position: relative; z-index: 10;
  padding: 0.4rem 1rem; text-align: center;
  font-size: 0.8rem; font-weight: 600;
  background: rgba(0,230,118,0.12); color: #00e676;
  border-bottom: 1px solid rgba(0,230,118,0.2);
}
.import-toast.error { background: rgba(255,23,68,0.1); color: #ff1744; border-color: rgba(255,23,68,0.2); }

/* ── Body ── */
.sms-body {
  flex: 1; display: flex; overflow: hidden;
  position: relative; z-index: 1;
}

/* ── Song panel ── */
.song-panel {
  width: 320px; flex-shrink: 0;
  display: flex; flex-direction: column;
  border-right: 1px solid var(--border-color);
  overflow: hidden;
  background: var(--section-bg);
}
.song-scroll { flex: 1; overflow-y: auto; padding: 0.5rem 0; }
.song-scroll::-webkit-scrollbar { width: 4px; }
.song-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--primary-color) 45%, transparent);
  border-radius: 2px;
}

/* Empty state */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 100%;
  gap: 0.5rem;
  color: var(--text-subtle);
  margin: 0.75rem;
  border: 1px dashed var(--border-color);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--surface-elevated), var(--section-bg));
}
.empty-icon { font-size: 3rem; opacity: 0.3; }
.empty-title { font-size: 1rem; font-weight: 700; }
.empty-hint { font-size: 0.75rem; color: var(--text-subtle); max-width: 24ch; text-align: center; }
.empty-state--in-pack {
  height: auto;
  min-height: 10rem;
  flex: 1;
}
.cta-btn {
  margin-top: 0.5rem; min-height: 44px; padding: 0.6rem 1.4rem;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-color-hover));
  border: none; border-radius: 10px; color: var(--text-color);
  font-family: 'Rajdhani', sans-serif; font-size: 0.9rem; font-weight: 700;
  cursor: pointer; transition: filter 0.15s;
  box-shadow: 0 4px 18px var(--primary-color-glow);
}
.cta-btn:hover { filter: brightness(1.12); }

/* Pack groups */
.pack-group {
  display: flex; flex-direction: column;
}
.pack-header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: color-mix(in srgb, var(--surface-elevated) 92%, var(--bg-color));
  border: none;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer; text-align: left; width: 100%;
  font-family: 'Orbitron', sans-serif; font-size: 0.65rem; letter-spacing: 0.15em;
  position: sticky; top: 0; z-index: 10;
  transition: background 0.15s, color 0.15s;
  backdrop-filter: blur(8px);
}
.pack-header:hover {
  background: var(--primary-color-bg);
  color: var(--text-color);
}
.pack-arrow {
  font-size: 0.55rem; transition: transform 0.2s; display: inline-block;
}
.pack-arrow.open { transform: rotate(90deg); }
.pack-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pack-count {
  background: var(--primary-color-bg);
  border-radius: 10px;
  padding: 0.1rem 0.4rem;
  font-size: 0.6rem;
  color: var(--text-muted);
}

/* Song rows */
.pack-songs { display: flex; flex-direction: column; }
.song-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.45rem 0.75rem;
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 55%, transparent);
  color: inherit; cursor: pointer; text-align: left; width: 100%;
  transition: background 0.1s;
  position: relative;
}
.song-row:hover { background: var(--section-bg); }
.song-row.selected {
  background: linear-gradient(90deg, var(--primary-color-bg), color-mix(in srgb, var(--primary-color-bg) 40%, transparent));
  border-left: 3px solid color-mix(in srgb, var(--primary-color) 82%, white);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 34%, transparent),
    inset 0 0 16px color-mix(in srgb, var(--primary-color) 20%, transparent);
}
.song-row:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.song-row--no-charts {
  border-left: 2px solid color-mix(in srgb, var(--text-subtle) 55%, transparent);
}
.song-no-charts-pill {
  flex-shrink: 0;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0.12rem 0.35rem;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--text-subtle) 45%, transparent);
  color: var(--text-subtle);
  background: color-mix(in srgb, var(--surface-elevated) 80%, transparent);
}
.song-thumb { width: 48px; height: 32px; border-radius: 4px; overflow: hidden; flex-shrink: 0; }
.thumb-img { width: 100%; height: 100%; object-fit: cover; }
.thumb-ph {
  width: 100%; height: 100%;
  background: hsl(var(--h), 45%, 22%);
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; font-weight: 700;
  color: color-mix(in srgb, var(--text-color) 32%, transparent);
}
.song-text { flex: 1; min-width: 0; }
.song-name {
  font-size: 0.85rem; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--text-color);
}
.song-artist {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 1px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.song-bpm {
  font-size: 0.65rem;
  color: var(--primary-color);
  font-weight: 700;
  flex-shrink: 0;
}

/* ── Detail panel ── */
.detail-panel {
  flex: 1; display: flex; flex-direction: column;
  overflow: hidden;
  background: color-mix(in srgb, var(--section-bg) 65%, transparent);
}
.detail-panel::-webkit-scrollbar { width: 4px; }
.detail-panel::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--primary-color) 35%, transparent);
  border-radius: 2px;
}

.detail-panel-inner {
  flex: 1; overflow-y: auto; overflow-x: hidden;
}

.no-selection {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 0.75rem;
  color: var(--text-subtle);
}
.no-sel-icon { font-size: 3rem; opacity: 0.15; }
.no-selection p { font-family: 'Orbitron', sans-serif; font-size: 0.7rem; letter-spacing: 0.2em; }

/* Hero */
.hero { position: relative; min-height: 160px; flex-shrink: 0; overflow: hidden; }
.hero-art { position: absolute; inset: 0; }
.hero-img { width: 100%; height: 100%; object-fit: cover; opacity: 0.5; }
.hero-ph {
  width: 100%; height: 100%;
  background: linear-gradient(135deg, hsl(var(--h),45%,18%), hsl(calc(var(--h) + 40),45%,12%));
  display: flex; align-items: center; justify-content: center;
  font-size: 4rem; font-weight: 900;
  color: color-mix(in srgb, var(--text-color) 10%, transparent);
  font-family: 'Orbitron', sans-serif;
}
.hero-fade {
  position: absolute; inset: 0;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--bg-color) 12%, transparent) 0%,
    color-mix(in srgb, var(--bg-color) 78%, transparent) 60%,
    var(--bg-color) 100%
  );
}
.hero-info { position: relative; z-index: 1; padding: 1rem 1.25rem 1.25rem; margin-top: 60px; }
.hero-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.15rem; font-weight: 900;
  color: var(--text-color);
  line-height: 1.2;
  text-shadow: 0 2px 12px color-mix(in srgb, var(--bg-color) 82%, transparent);
}
.hero-subtitle { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.15rem; }
.hero-artist { font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem; }
.bpm-badge {
  display: inline-block; margin-top: 0.5rem;
  padding: 0.2rem 0.65rem;
  background: var(--primary-color-bg);
  border: 1px solid color-mix(in srgb, var(--primary-color) 38%, transparent);
  border-radius: 20px; font-size: 0.72rem; font-weight: 700;
  color: var(--primary-color-hover);
  letter-spacing: 0.05em;
}

/* Section labels */
.section-label {
  padding: 0.5rem 1.25rem 0.25rem;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.55rem; letter-spacing: 0.3em;
  color: color-mix(in srgb, var(--primary-color) 72%, var(--text-muted));
}

/* Diff list */
.diff-list { display: flex; flex-direction: column; gap: 3px; padding: 0 1.25rem 0.75rem; }
.diff-btn {
  display: flex; align-items: center; gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.75rem; border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--section-bg);
  color: var(--text-muted);
  cursor: pointer;
  font-family: 'Rajdhani', sans-serif;
  font-size: inherit;
  transition: all 0.12s; text-align: left;
}
.diff-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.diff-btn:hover {
  background: var(--surface-elevated);
  border-color: color-mix(in srgb, var(--border-color) 80%, var(--text-subtle));
}
.diff-btn.active {
  border-color: var(--dc);
  background: color-mix(in srgb, var(--dc) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dc) 30%, transparent);
}
.diff-gem {
  width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0;
  background: var(--dc);
  box-shadow: 0 0 6px var(--dc);
  transform: rotate(45deg);
}
.diff-name { font-weight: 700; font-size: 0.82rem; color: var(--dc); min-width: 78px; }
.diff-meter { font-weight: 900; font-size: 1.05rem; color: var(--text-color); }
.diff-type {
  font-size: 0.62rem;
  color: var(--text-muted);
  padding: 0.1rem 0.3rem;
  background: var(--surface-elevated);
  border-radius: 3px;
}
.diff-notes { margin-left: auto; font-size: 0.68rem; color: var(--text-subtle); }
.no-charts { padding: 0.75rem; text-align: center; font-size: 0.75rem; color: var(--text-subtle); }

/* Actions */
.action-row {
  display: flex; gap: 0.5rem;
  padding: 0.75rem 1.25rem 1.25rem;
}
.play-btn {
  flex: 1; padding: 0.85rem;
  font-family: 'Orbitron', sans-serif; font-size: 0.85rem; font-weight: 900;
  letter-spacing: 0.15em;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-color-hover) 100%);
  border: none; border-radius: 10px; color: var(--text-color);
  cursor: pointer; transition: all 0.15s;
  box-shadow: 0 4px 20px var(--primary-color-glow);
}
.play-btn:hover {
  filter: brightness(1.12);
  box-shadow: 0 6px 28px var(--primary-color-glow);
  transform: translateY(-1px);
}
.play-btn:active { transform: translateY(0); }
.play-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  filter: grayscale(0.2);
  box-shadow: none;
}

.delete-song-btn {
  flex-shrink: 0;
  padding: 0.85rem 1rem;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, #ff6b6b 55%, var(--border-color));
  background: color-mix(in srgb, #ff6b6b 12%, var(--section-bg));
  color: color-mix(in srgb, #ff6b6b 92%, var(--text-color));
  cursor: pointer;
  transition: filter 0.15s, border-color 0.15s;
}
.delete-song-btn:hover:not(:disabled) {
  filter: brightness(1.12);
  border-color: color-mix(in srgb, #ff6b6b 75%, var(--border-color));
}
.delete-song-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  filter: grayscale(0.35);
}

@media (max-width: 880px) {
  .sms-body { flex-direction: column; }
  .song-panel { width: 100%; min-height: 42vh; border-right: none; border-bottom: 1px solid var(--border-color); }
  .detail-panel { min-height: 0; }
  .action-row { flex-wrap: wrap; }
  .play-btn { flex: 1 1 100%; width: 100%; }
  .delete-song-btn { flex: 1 1 100%; width: 100%; }
}
@media (max-width: 640px) {
  .topbar { flex-wrap: wrap; }
  .topbar-center { order: 3; width: 100%; }
  .search-input { width: 100%; }
  .path-row { flex-wrap: wrap; }
  .path-btn { flex: 1 1 120px; }
}
</style>
