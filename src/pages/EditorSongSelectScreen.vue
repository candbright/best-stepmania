<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import type { ComponentPublicInstance } from "vue";
import SongPackList from "@/entities/SongPackList.vue";
import { SongSelectDetailPanel } from "@/widgets";
import {
  SongSelectActionRow,
  SongSelectLayout,
  SongSelectToolbarActions,
} from "@/shared/layout";
import { useEditorSongSelectScreen } from "./editor/useEditorSongSelectScreen";
import CreateSongModal from "./select-music/CreateSongModal.vue";
import FilterModal from "./select-music/FilterModal.vue";
import DeleteSongModal from "./song-packs/DeleteSongModal.vue";

const {
  t,
  session,
  bannerCache,
  showFilterModal,
  DIFF_COLORS,
  ROOT_PACK_KEY,
  groupedSongs,
  collapsedPacks,
  selectSong,
  difficultyLabel,
  stepsTypeLabel,
  filteredCharts,
  canEditCurrentSong,
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
  toggleFavorite,
  setShowFavoritesOnly,
  showFavoritesOnly,
  favoriteSet,
  filterStepsType,
  importing,
  importStatus,
  openCreateSongModal,
  showCreateSongModal,
  songScrollRef,
  handleCreateSuccess,
  handleCreateError,
  confirmDeleteSong,
  handleDeleteSongSuccess,
  handleDeleteSongError,
  askDeleteCurrentSong,
  importSongs,
  openEditor,
  onMountedHandler,
  onUnmountedHandler,
} = useEditorSongSelectScreen();

const setSongScrollRef = (el: Element | ComponentPublicInstance | null) => {
  songScrollRef.value = el as HTMLElement | null;
};

onMounted(() => {
  void onMountedHandler();
});

onUnmounted(() => {
  onUnmountedHandler();
});
</script>

<template>
  <SongSelectLayout
    :title="t('editorSelect.title')"
    :songScrollRef="setSongScrollRef"
    @back="goBack"
  >
    <template #topbar-actions>
      <SongSelectToolbarActions
        :refreshing="refreshing"
        :hasActiveFilter="hasActiveFilter"
        :activeFilterCount="activeFilterCount"
        :sortLabel="sortLabel"
        :refreshTitle="t('editorSelect.refresh')"
        :filterLabel="t('select.filter')"
        @refresh="refreshSongs"
        @openFilter="showFilterModal = true"
        @cycleSort="cycleSortMode"
      >
        <button class="tb-icon-btn" :title="t('editorSelect.createSong')" @click="openCreateSongModal">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="tb-icon-btn" :title="t('select.import')" :disabled="importing" @click="importSongs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        </button>
      </SongSelectToolbarActions>
    </template>

    <template #import-toast>
      <div v-if="importStatus" class="import-toast" :class="{ error: importStatus.includes('error') || importStatus.includes('\u51fa\u9519') }">
        {{ importStatus }}
      </div>
    </template>

    <template #song-panel>
      <SongPackList
        :groups="groupedSongs"
        :rootPackKey="ROOT_PACK_KEY"
        :collapsedPacks="collapsedPacks"
        :selectedIndex="session.currentSongIndex"
        :favoriteSet="favoriteSet"
        :bannerCache="bannerCache"
        :showNoChartsBadge="true"
        :t="t"
        @togglePack="togglePack"
        @selectSong="selectSong"
        @dblclickSong="openEditor"
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
        :noChartsMessage="t('editorSelect.noChartsInSong')"
        :noMatchingChartsMessage="t('select.noMatchingCharts')"
        :noSelectionText="t('select.selectSong')"
        :t="t"
        @toggleFavorite="session.currentSong && toggleFavorite(session.currentSong.path)"
        @selectChart="session.selectChart($event)"
      >
        <template #actions>
          <SongSelectActionRow
            :primaryLabel="`${t('editorSelect.openEditor')} ▶`"
            :primaryDisabled="!canEditCurrentSong"
            @primary="openEditor"
          >
            <template #secondary>
              <button
                type="button"
                class="delete-song-btn"
                :disabled="!canEditCurrentSong"
                @click="askDeleteCurrentSong"
              >
                {{ t('editorSelect.deleteSong') }}
              </button>
            </template>
          </SongSelectActionRow>
        </template>
      </SongSelectDetailPanel>
    </template>

    <FilterModal
      v-if="showFilterModal"
      :diffMin="diffMin"
      :diffMax="diffMax"
      :searchQuery="filterSearch"
      :filterPack="filterPack"
      :existingPacks="existingPacks"
      :showFavoritesOnly="showFavoritesOnly"
      :showStepsTypeFilter="true"
      :filterStepsType="filterStepsType"
      @update:diffMin="diffMin = $event"
      @update:diffMax="diffMax = $event"
      @update:searchQuery="filterSearch = $event"
      @update:filterPack="filterPack = $event"
      @update:showFavoritesOnly="setShowFavoritesOnly($event)"
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
  </SongSelectLayout>
</template>

<style scoped>
/* Import toast - editor-specific notification */
.import-toast {
  position: relative; z-index: 10;
  padding: 0.4rem 1rem; text-align: center;
  font-size: 0.8rem; font-weight: 600;
  background: rgba(0,230,118,0.12); color: #00e676;
  border-bottom: 1px solid rgba(0,230,118,0.2);
}
.import-toast.error { background: rgba(255,23,68,0.1); color: #ff1744; border-color: rgba(255,23,68,0.2); }

/* Delete song button - editor-specific */
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
  .delete-song-btn { flex: 1 1 100%; width: 100%; }
}
</style>
