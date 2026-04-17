<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import FilterModal from "./select-music/FilterModal.vue";
import BaseConfirmModal from "@/shared/ui/BaseConfirmModal.vue";
import SongPackList from "@/entities/SongPackList.vue";
import TopScores from "@/widgets/TopScores.vue";
import { SongSelectDetailPanel } from "@/widgets";
import {
  SongSelectActionRow,
  SongSelectLayout,
  SongSelectToolbarActions,
} from "@/shared/layout";
import { useSelectMusicScreen } from "./select-music/useSelectMusicScreen";

const {
  t,
  session,
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
  refreshSongs,
  refreshing,
  hasActiveFilter,
  activeFilterCount,
  togglePack,
  displayPercentFromDpRatio,
  gradeTextGradientStyle,
  toggleFavorite,
  setShowFavoritesOnly,
  showFavoritesOnly,
  favoriteSet,
} = useSelectMusicScreen();

const setSongScrollRef = (el: Element | ComponentPublicInstance | null) => {
  songScrollRef.value = el as HTMLElement | null;
};
</script>

<template>
  <SongSelectLayout
    :title="t('select.title')"
    :songScrollRef="setSongScrollRef"
    @back="goBack"
  >
    <template #topbar-actions>
      <SongSelectToolbarActions
        :refreshing="refreshing"
        :hasActiveFilter="hasActiveFilter"
        :activeFilterCount="activeFilterCount"
        :sortLabel="sortLabel"
        :refreshTitle="t('select.refresh')"
        :filterLabel="t('select.filter')"
        @refresh="refreshSongs"
        @openFilter="showFilterModal = true"
        @cycleSort="cycleSortMode"
      />
    </template>

    <template #song-panel>
      <SongPackList
        :groups="groupedSongs"
        :rootPackKey="ROOT_PACK_KEY"
        :collapsedPacks="collapsedPacks"
        :selectedIndex="session.currentSongIndex"
        :favoriteSet="favoriteSet"
        :bannerCache="bannerCache"
        :t="t"
        @togglePack="togglePack"
        @selectSong="selectSong"
        @dblclickSong="confirmSelection"
        @toggleFavorite="toggleFavorite"
      />
    </template>

    <template #detail-panel>
      <SongSelectDetailPanel
        :currentSong="session.currentSong"
        :currentSongIndex="session.currentSongIndex"
        :bannerUrl="session.currentSong ? bannerCache[session.currentSong.path] : undefined"
        :isFavorite="session.currentSong ? favoriteSet.has(session.currentSong.path) : false"
        :filteredCharts="filteredCharts"
        :hasSourceCharts="(session.charts?.length ?? 0) > 0"
        :currentChartIndex="session.currentChartIndex"
        :difficultyColors="DIFF_COLORS"
        :difficultyLabelFn="difficultyLabel"
        :stepsTypeLabelFn="stepsTypeLabel"
        :noMatchingChartsMessage="t('select.noMatchingCharts')"
        :noSelectionText="t('select.selectSong')"
        :t="t"
        @toggleFavorite="session.currentSong && toggleFavorite(session.currentSong.path)"
        @selectChart="session.selectChart($event)"
      >
        <template #afterCharts>
          <TopScores
            :topScores="session.topScores"
            :profileId="session.profileId"
            :clearingTopScores="clearingTopScores"
            :displayPercentFromDpRatio="displayPercentFromDpRatio"
            :gradeTextGradientStyle="gradeTextGradientStyle"
            :formatPlayedAt="formatPlayedAt"
            :t="t"
            @clearTopScores="onClearTopScores"
          />
        </template>
        <template #actions>
          <SongSelectActionRow
            :primaryLabel="`${t('select.play')} ▶`"
            :primaryDisabled="!canPlayCurrentSong || confirmSelectionBusy"
            :hintText="!canPlayCurrentSong ? t('select.noChartCannotPlay') : ''"
            @primary="confirmSelection"
          />
        </template>
      </SongSelectDetailPanel>
    </template>

    <BaseConfirmModal
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
  </SongSelectLayout>
</template>

<style scoped>
/* SelectMusicScreen specific styles - TopScores, play button, etc. */

/* Top scores */
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

</style>
