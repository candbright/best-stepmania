<script setup lang="ts">
import FilterModal from "./select-music/FilterModal.vue";
import TwoStepDangerModal from "@/shared/ui/BaseConfirmModal.vue";
import SongPackList from "@/entities/SongPackList.vue";
import SongHero from "@/entities/SongHero.vue";
import SongChartList from "@/entities/SongChartList.vue";
import TopScores from "@/widgets/TopScores.vue";
import { useSelectMusicScreen } from "./select-music/useSelectMusicScreen";

const {
  t,
  game,
  bannerCache,
  showFilterModal,
  showClearTopScoresModal,
  clearingTopScores,
  confirmSelectionBusy,
  songScrollRef,
  DIFF_COLORS,
  ROOT_PACK_KEY,
  groupedSongs,
  collapsedPacks,
  selectSong,
  confirmSelection,
  difficultyLabel,
  stepsTypeLabel,
  filteredCharts,
  onClearTopScores,
  onClearTopScoresConfirmed,
  formatPlayedAt,
  canPlayCurrentSong,
  diffMin,
  diffMax,
  filterSearch,
  filterPack,
  existingPacks,
  onFilterApply,
  onFilterClear,
  goBack,
  sortLabel,
  cycleSortMode,
  hasActiveFilter,
  activeFilterCount,
  togglePack,
  displayPercentFromDpRatio,
  gradeTextGradientStyle,
  toggleFavorite,
  setShowFavoritesOnly,
  showFavoritesOnly,
  isFavorite,
} = useSelectMusicScreen();

void songScrollRef;
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
          <SongPackList
            :groups="groupedSongs"
            :rootPackKey="ROOT_PACK_KEY"
            :collapsedPacks="collapsedPacks"
            :selectedIndex="game.currentSongIndex"
            :bannerCache="bannerCache"
            :isCurrentRootEmpty="game.songs.length === 0"
            :isFavorite="isFavorite"
            :noSongsLabel="t('select.noSongs')"
            @togglePack="togglePack"
            @selectSong="selectSong"
            @confirmSong="confirmSelection"
            @toggleFavorite="toggleFavorite"
          />
        </div>
      </div>

      <!-- Detail panel -->
      <div class="detail-panel">
        <template v-if="game.currentSong">
          <SongHero
            :title="game.currentSong.title"
            :subtitle="game.currentSong.subtitle"
            :artist="game.currentSong.artist"
            :displayBpm="`${game.currentSong.displayBpm} ${t('select.bpmUnit')}`"
            :bannerUrl="bannerCache[game.currentSong.path]"
            :hue="game.currentSongIndex * 37 % 360"
            :isFavorite="isFavorite(game.currentSong.path)"
            :favoriteLabel="t('select.favorites')"
            @toggleFavorite="toggleFavorite(game.currentSong.path)"
          />

          <div class="detail-panel-inner">
            <SongChartList
              :charts="filteredCharts"
              :currentChartIndex="game.currentChartIndex"
              :difficultyColors="DIFF_COLORS"
              :difficultyLabel="difficultyLabel"
              :stepsTypeLabel="stepsTypeLabel"
              :chartsLabel="t('select.charts')"
              :notesLabel="t('select.notes')"
              :noMatchingChartsLabel="t('select.noMatchingCharts')"
              @selectChart="game.selectChart($event)"
            />

            <TopScores
              :topScores="game.topScores"
              :profileId="game.profileId"
              :clearingTopScores="clearingTopScores"
              :displayPercentFromDpRatio="displayPercentFromDpRatio"
              :gradeTextGradientStyle="gradeTextGradientStyle"
              :formatPlayedAt="formatPlayedAt"
              :title="t('select.topScores')"
              :clearLabel="t('select.clearTopScores')"
              :fullComboLabel="t('select.fullComboBadge')"
              @clear="onClearTopScores"
            />
          </div>

          <div class="action-row">
            <button class="play-btn" :disabled="!canPlayCurrentSong || confirmSelectionBusy" @click="confirmSelection">
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
      :showFavoritesOnly="showFavoritesOnly"
      @update:diffMin="diffMin = $event"
      @update:diffMax="diffMax = $event"
      @update:searchQuery="filterSearch = $event"
      @update:filterPack="filterPack = $event"
      @update:showFavoritesOnly="setShowFavoritesOnly($event)"
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
.fav-star {
  position: absolute;
  top: 4px;
  left: 4px;
  background: none;
  border: none;
  font-size: 0.9rem;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  opacity: 0.4;
  transition: opacity 0.15s, color 0.15s;
  z-index: 1;
}
.fav-star:hover {
  opacity: 0.8;
}
.fav-star.active {
  color: #ffd740;
  opacity: 1;
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
.hero-fav-tag {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  border: none;
  background: transparent;
  padding: 0;
  width: 24px;
  height: 30px;
  color: color-mix(in srgb, var(--text-muted) 92%, transparent);
  cursor: pointer;
  transition: color 0.15s, transform 0.15s, filter 0.15s;
}
.hero-fav-tag-icon {
  display: block;
  width: 100%;
  height: 100%;
  background: currentColor;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 74%, 0 100%);
  filter: drop-shadow(0 2px 5px color-mix(in srgb, var(--border-color) 55%, transparent));
}
.hero-fav-tag:hover {
  transform: translateY(-1px);
}
.hero-fav-tag.active {
  color: var(--primary-color);
  filter: drop-shadow(0 0 10px var(--primary-color-glow));
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
