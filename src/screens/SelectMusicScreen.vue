<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "@/stores/game";
import { useSessionStore } from "@/stores/session";
import { usePlayerStore } from "@/stores/player";
import { useI18n } from "@/i18n";
import * as api from "@/utils/api";
import { playMenuMove, playMenuConfirm, playMenuBack, setUiSfxVolume } from "@/utils/sfx";

import FilterModal from "./select-music/FilterModal.vue";
import { syncSelectionToFilteredSongs } from "./select-music/syncSelectionToFilteredSongs";
import TwoStepDangerModal from "@/components/TwoStepDangerModal.vue";
import { ensureMinElapsed } from "@/utils/loadingGate";
import { useBlockingOverlayStore } from "@/stores/blockingOverlay";
import { displayPercentFromDpRatio } from "@/engine/types";
import { gradeTextGradientStyle } from "@/utils/gradeColors";
import { chartFitsPlayMode } from "@/utils/chartPlayMode";

const router = useRouter();
const game = useGameStore();
const sessionStore = useSessionStore();
const player = usePlayerStore();
const blockingOverlay = useBlockingOverlayStore();
const { t } = useI18n();
const bannerCache = ref<Record<string, string>>({});
const showFilterModal = ref(false);
const showClearTopScoresModal = ref(false);
const clearingTopScores = ref(false);
const songScrollRef = ref<HTMLElement | null>(null);
let loadAbortCtrl: AbortController | null = null;

function formatPlayedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function cancelScreenLoad() {
  loadAbortCtrl?.abort();
  loadAbortCtrl = null;
  blockingOverlay.hide();
}

// 难度颜色（用于谱面列表左侧宝石）
const DIFF_COLORS: Record<string, string> = {
  Beginner: "#00e5ff", Easy: "#69f0ae", Medium: "#ffd740",
  Hard: "#ff6d00", Challenge: "#e040fb", Edit: "#78909c",
};

// 筛选状态（持久到 session，返回选歌页时保留）
const diffMin = computed({
  get: () => game.selectFilterDiffMin,
  set: (v: number | null) => { game.selectFilterDiffMin = v; },
});
const diffMax = computed({
  get: () => game.selectFilterDiffMax,
  set: (v: number | null) => { game.selectFilterDiffMax = v; },
});
const filterSearch = computed({
  get: () => game.selectFilterSearch,
  set: (v: string) => { game.selectFilterSearch = v; },
});
const filterPack = computed({
  get: () => game.selectFilterPack,
  set: (v: string) => { game.selectFilterPack = v; },
});

const hasActiveFilter = computed(() =>
  diffMin.value !== null || diffMax.value !== null ||
  filterSearch.value !== "" || filterPack.value !== ""
);

const activeFilterCount = computed(() => {
  let n = 0;
  if (diffMin.value !== null || diffMax.value !== null) n++;
  if (filterSearch.value !== "") n++;
  if (filterPack.value !== "") n++;
  return n;
});

const filteredSongs = computed(() => {
  return game.songs.filter(s => {
    // Filter by search text
    if (filterSearch.value) {
      const q = filterSearch.value.toLowerCase();
      if (!s.title.toLowerCase().includes(q) &&
          !(s.artist ?? "").toLowerCase().includes(q)) return false;
    }
    // Filter by pack
    if (filterPack.value && s.pack !== filterPack.value) return false;
    
    // Filter out songs without matching charts
    const charts = s.charts ?? [];
    let hasMatchingChart = false;
    
    for (const c of charts) {
      // Check play mode filter
      if (game.playMode && !chartFitsPlayMode(c, game.playMode)) continue;
      // Check difficulty range filter
      if (diffMin.value !== null && c.meter < diffMin.value) continue;
      if (diffMax.value !== null && c.meter > diffMax.value) continue;
      // If we get here, this chart matches all filters
      hasMatchingChart = true;
      break;
    }
    
    // Only include song if it has at least one matching chart
    return hasMatchingChart;
  });
});

const filteredCharts = computed(() => {
  let charts = game.charts ?? [];
  // Filter by play mode (stepsType)
  if (game.playMode) {
    charts = charts.filter((c) => chartFitsPlayMode(c, game.playMode));
  }
  // Filter by difficulty range
  if (diffMin.value !== null || diffMax.value !== null) {
    charts = charts.filter(c => {
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
const PHYSICAL_ROOT_PACK = ".root";

const groupedSongs = computed(() => {
  const indexByPath = new Map<string, number>();
  game.songs.forEach((s, i) => indexByPath.set(s.path, i));
  const groups: { packKey: string; packLabel: string; songs: { song: typeof game.songs[0]; idx: number }[] }[] = [];
  const packMap = new Map<string, typeof groups[0]>();
  filteredSongs.value.forEach(song => {
    const idx = indexByPath.get(song.path) ?? -1;
    if (idx < 0) return;
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

const canPlayCurrentSong = computed(() => {
  if (!game.currentSong) return false;
  return (game.currentSong.charts?.length ?? 0) > 0;
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
  // Ensure queue order matches current song list before switching by index.
  const queueSynced =
    player.queue.length === game.songs.length &&
    player.queue.every((s, i) => s.path === game.songs[i]?.path);
  if (!queueSynced) {
    player.setQueue(game.songs, idx);
  } else {
    player.playSongAt(idx);
  }
  loadBannerLazy(idx);
}

function onFilterClear() {
  diffMin.value = null;
  diffMax.value = null;
  filterSearch.value = "";
  filterPack.value = "";
}

function onFilterApply() {
  // filter state is already updated via v-model
}

async function confirmSelection() {
  if (!canPlayCurrentSong.value) {
    return;
  }
  loadAbortCtrl = new AbortController();
  blockingOverlay.show({
    message: t("loadingPhase.preparing"),
    onCancel: cancelScreenLoad,
    onRetry: null,
  });
  const started = performance.now();
  try {
    blockingOverlay.updateMessage(t("loadingPhase.audio"));
    await player.waitForLoadComplete(10000, loadAbortCtrl.signal);
    if (loadAbortCtrl?.signal.aborted) return;
    if (player.status === "loading") {
      throw new Error("Audio load timeout");
    }
    await player.stopForGame();
    playMenuConfirm();
    blockingOverlay.updateMessage(t("loadingPhase.navigate"));
    if (game.playMode === "pump-single") {
      const i = game.currentChartIndex;
      const charts = game.charts;
      if (i >= 0 && i < charts.length && chartFitsPlayMode(charts[i]!, game.playMode)) {
        game.p1ChartIndex = i;
        game.p2ChartIndex = i;
      }
    }
    if (game.currentSong) await router.push("/player-options");
  } catch {
    blockingOverlay.setFailed(t("loadingOverlay.failed"), () => {
      void confirmSelection();
    });
  } finally {
    if (loadAbortCtrl?.signal.aborted) {
      loadAbortCtrl = null;
      return;
    }
    await ensureMinElapsed(started, 1500);
    loadAbortCtrl = null;
  }
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

/** Preload all banner images in background batches to avoid freeze on song switch */
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

function onClearTopScores() {
  if (!game.profileId || game.topScores.length === 0) return;
  showClearTopScoresModal.value = true;
}

async function onClearTopScoresConfirmed() {
  if (clearingTopScores.value) return;
  if (!game.profileId || game.topScores.length === 0) return;
  clearingTopScores.value = true;
  try {
    await game.clearCurrentChartTopScores();
  } catch (e: unknown) {
    console.error(e);
  } finally {
    clearingTopScores.value = false;
  }
}

onMounted(() => {
  setUiSfxVolume((game.uiSfxVolume ?? 70) / 100);
  void sessionStore.loadTopScores();

  // Check if returning from player options and need to resume playback
  if (game.resumePlaybackOnReturn) {
    game.resumePlaybackOnReturn = false;
    // Resume playing current song
    if (game.currentSongIndex >= 0) {
      player.playSongAt(game.currentSongIndex);
    }
    ensureCurrentSongVisible();
    preloadAllBanners();
    void syncSelectionToFilteredSongs(filteredSongs.value, loadBannerLazy);
    return;
  }

  // 选歌页不再触发任何自动歌曲加载。
  // 歌曲刷新只由曲包管理页写回到 store。
  if (player.queue.length === 0 && game.songs.length > 0) {
    // songs 已有但 player 未初始化，只加载不播放
    player.setQueue(game.songs, 0);
    // 如果之前没有在播放任何歌曲，播放默认音乐
    if (player.status === "idle") {
      player.playDefaultMusic();
    }
    ensureCurrentSongVisible();
    preloadAllBanners();
  } else {
    // player 已经有播放队列（从主界面返回），保持当前播放状态不变
    ensureCurrentSongVisible();
    preloadAllBanners();
  }
  void syncSelectionToFilteredSongs(filteredSongs.value, loadBannerLazy);
});

onUnmounted(() => {
  cancelScreenLoad();
  // 离开选歌界面时不停止播放，让 MusicPlayer 继续
});

watch(() => game.currentSongIndex, () => ensureCurrentSongVisible());

watch(
  () => filteredSongs.value.map((s) => s.path).join("\0"),
  () => {
    void syncSelectionToFilteredSongs(filteredSongs.value, loadBannerLazy);
  },
);
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
        <span class="topbar-title">{{ t('select.title') }}</span>
      </div>
      <div class="topbar-actions">
        <button class="tb-btn filter-btn" :class="{ active: hasActiveFilter }" @click="showFilterModal = true">
          {{ t('select.filter') }}
          <span v-if="activeFilterCount > 0" class="filter-badge">{{ activeFilterCount }}</span>
        </button>
        <button class="tb-btn sort-btn" @click="cycleSortMode">{{ sortLabel }}</button>
      </div>
    </header>

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
              </div>
              <button v-for="{ song, idx } in group.songs" :key="song.path"
                class="song-row" :class="{ selected: game.currentSongIndex === idx }"
                @click="selectSong(idx)" @dblclick="confirmSelection">
                <div class="song-thumb">
                  <img v-if="bannerCache[song.path]" :src="bannerCache[song.path]" class="thumb-img" />
                  <div v-else class="thumb-ph" :style="{ '--h': idx * 37 % 360 }">{{ song.title[0] }}</div>
                </div>
                <div class="song-text">
                  <div class="song-name">{{ song.title }}</div>
                  <div class="song-artist">{{ song.artist }}</div>
                </div>
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
              <div v-if="filteredCharts.length === 0" class="no-charts">{{ t('select.noMatchingCharts') }}</div>
            </div>

            <div v-if="game.topScores.length > 0" class="top-scores">
              <div class="top-scores-head">
                <div class="section-label">{{ t('select.topScores') }}</div>
                <button
                  type="button"
                  class="clear-top-scores-btn"
                  :disabled="clearingTopScores || !game.profileId"
                  @click="onClearTopScores"
                >
                  {{ t('select.clearTopScores') }}
                </button>
              </div>
              <ul class="top-scores-list">
                <li
                  v-for="(row, idx) in game.topScores"
                  :key="`${row.playedAt}-${idx}`"
                  class="score-row"
                >
                  <span class="rank">{{ idx + 1 }}</span>
                  <span class="grade" :style="gradeTextGradientStyle(row.grade)">{{ row.grade }}</span>
                  <span class="pct">{{ displayPercentFromDpRatio(row.dpPercent).toFixed(2) }}%</span>
                  <span v-if="row.fullCombo" class="fc-badge">{{ t('select.fullComboBadge') }}</span>
                  <span class="played-at">{{ formatPlayedAt(row.playedAt) }}</span>
                </li>
              </ul>
            </div>
          </div>

          <div class="action-row">
            <button class="play-btn" :disabled="!canPlayCurrentSong" @click="confirmSelection">
              {{ t('select.play') }} ▶
            </button>

          </div>
          <div v-if="!canPlayCurrentSong" class="no-chart-hint">{{ t('select.noChartCannotPlay') }}</div>
        </template>
        <div v-else class="no-selection">
          <div class="no-sel-icon">▶</div>
          <p>{{ t('select.selectSong') }}</p>
        </div>
      </div>
    </div>

    <TwoStepDangerModal
      v-model="showClearTopScoresModal"
      :title="t('select.clearTopScoresModalTitle')"
      :step1-message="t('select.clearTopScoresStep1')"
      :step2-message="t('select.clearTopScoresStep2')"
      :continue-label="t('continue')"
      :cancel-label="t('cancel')"
      :back-label="t('stepBack')"
      :confirm-label="t('select.clearTopScoresConfirmAction')"
      @confirm="onClearTopScoresConfirmed"
    />

    <FilterModal
      v-if="showFilterModal"
      :diffMin="diffMin"
      :diffMax="diffMax"
      :searchQuery="filterSearch"
      :filterPack="filterPack"
      :existingPacks="existingPacks"
      @update:diffMin="diffMin = $event"
      @update:diffMax="diffMax = $event"
      @update:searchQuery="filterSearch = $event"
      @update:filterPack="filterPack = $event"
      @apply="onFilterApply"
      @clear="onFilterClear"
      @close="showFilterModal = false"
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
.path-btn,
.modal-btn {
  justify-content: center;
}
.tb-btn {
  padding: 0.35rem 0.65rem; border-radius: 6px;
  background: var(--section-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted); cursor: pointer;
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
  background: color-mix(in srgb, var(--accent-secondary) 35%, transparent);
  color: var(--text-on-primary);
}
.diff-input {
  width: 52px; padding: 0.25rem 0.35rem; border-radius: 6px;
  background: var(--surface-elevated);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.75rem; font-weight: 600; outline: none; text-align: center;
}
.diff-input:hover { border-color: color-mix(in srgb, var(--primary-color) 40%, transparent); }
.diff-input:focus { border-color: var(--primary-color); box-shadow: var(--focus-ring); }
.diff-input::placeholder { color: var(--text-subtle); }
.diff-input::-webkit-inner-spin-button,
.diff-input::-webkit-outer-spin-button { opacity: 0.4; }
.diff-range-sep {
  font-size: 0.8rem; color: var(--text-subtle);
  user-select: none;
}
.diff-clear {
  font-size: 0.75rem !important; padding: 0.25rem 0.5rem !important;
}
.topbar-sep {
  width: 1px; height: 18px; align-self: center;
  background: var(--border-color);
  margin: 0 0.2rem;
}
.search-input {
  width: 260px; padding: 0.3rem 0.75rem;
  background: var(--surface-elevated);
  border: 1px solid color-mix(in srgb, var(--primary-color) 35%, var(--border-color));
  border-radius: 6px;
  color: var(--text-color);
  font-family: 'Rajdhani', sans-serif; font-size: 0.9rem;
  outline: none;
}
.search-input:focus { border-color: var(--primary-color); box-shadow: var(--focus-ring); }

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
.empty-state--in-pack {
  height: auto;
  min-height: 10rem;
  flex: 1;
}

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
.song-thumb { width: 48px; height: 32px; border-radius: 4px; overflow: hidden; flex-shrink: 0; }
.thumb-img { width: 100%; height: 100%; object-fit: cover; }
.thumb-ph {
  width: 100%; height: 100%;
  background: hsl(var(--h), 45%, 22%);
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; font-weight: 700; color: rgba(255,255,255,0.3);
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
  font-size: 4rem; font-weight: 900; color: rgba(255,255,255,0.08);
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
  color: var(--text-color); line-height: 1.2;
  text-shadow: 0 2px 12px rgba(0,0,0,0.8);
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

/* Filters */
.fchip {
  padding: 0.2rem 0.55rem; border-radius: 4px;
  font-size: 0.68rem; font-weight: 600; font-family: 'Rajdhani', sans-serif;
  background: var(--section-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer; transition: all 0.12s;
}
.fchip:hover {
  background: var(--primary-color-bg);
  border-color: color-mix(in srgb, var(--primary-color) 42%, transparent);
  color: var(--text-color);
}
.fchip.active {
  background: color-mix(in srgb, var(--primary-color) 22%, var(--section-bg));
  border-color: var(--primary-color);
  color: var(--text-color);
}
.diff-chip.active {
  background: color-mix(in srgb, var(--dc) 20%, transparent);
  border-color: var(--dc); color: var(--dc);
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

/* Top scores (best N runs) */
.top-scores { padding: 0 1.25rem 0.5rem; }
.top-scores-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-bottom: 0.25rem;
}
.top-scores-head .section-label { margin-bottom: 0; }
.clear-top-scores-btn {
  flex-shrink: 0;
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.25rem 0.55rem;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--border-color) 80%, #c62828);
  background: color-mix(in srgb, #c62828 12%, var(--section-bg));
  color: color-mix(in srgb, #ff8a80 55%, var(--text-color));
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.clear-top-scores-btn:hover:not(:disabled) {
  background: color-mix(in srgb, #c62828 22%, var(--section-bg));
  border-color: color-mix(in srgb, #c62828 55%, var(--border-color));
}
.clear-top-scores-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.top-scores-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.score-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0;
  flex-wrap: wrap;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 45%, transparent);
}
.score-row:last-child { border-bottom: none; }
.rank {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-subtle);
  min-width: 1.25rem;
}
.grade {
  font-family: 'Orbitron', sans-serif; font-size: 1.05rem; font-weight: 900;
}
.pct { font-size: 0.85rem; font-weight: 700; color: var(--text-muted); }
.played-at {
  margin-left: auto;
  font-size: 0.68rem;
  color: var(--text-subtle);
  white-space: nowrap;
}
.fc-badge {
  padding: 0.15rem 0.5rem; background: #00e676; color: #000;
  border-radius: 4px; font-size: 0.7rem; font-weight: 800;
  font-family: 'Orbitron', sans-serif;
}

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

.no-chart-hint {
  padding: 0 1.25rem 1rem;
  color: color-mix(in srgb, #ff8a80 55%, var(--text-muted));
  font-size: 0.75rem;
}

@media (max-width: 880px) {
  .sms-body { flex-direction: column; }
  .song-panel { width: 100%; min-height: 42vh; border-right: none; border-bottom: 1px solid var(--border-color); }
  .detail-panel { min-height: 0; }
  .action-row { flex-wrap: wrap; }
  .play-btn { width: 100%; }
}
@media (max-width: 640px) {
  .topbar { flex-wrap: wrap; }
  .topbar-center { order: 3; width: 100%; }
  .search-input { width: 100%; }
  .path-row { flex-wrap: wrap; }
  .path-btn { flex: 1 1 120px; }
}
</style>
