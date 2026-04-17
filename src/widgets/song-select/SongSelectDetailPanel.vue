<script setup lang="ts">
import SongHero from "@/entities/SongHero.vue";
import SongChartList from "@/entities/SongChartList.vue";
import type { ChartInfoItem } from "@/shared/api";

interface SongLike {
  path: string;
  title: string;
  subtitle?: string;
  artist?: string;
  displayBpm?: string;
}

interface Props {
  currentSong: SongLike | null;
  currentSongIndex: number;
  bannerUrl?: string;
  isFavorite: boolean;
  filteredCharts: ChartInfoItem[];
  hasSourceCharts: boolean;
  currentChartIndex: number;
  difficultyColors: Record<string, string>;
  difficultyLabelFn: (difficulty: string) => string;
  stepsTypeLabelFn: (stepsType: string) => string;
  noMatchingChartsMessage: string;
  noChartsMessage?: string;
  noSelectionText: string;
  t: (key: string, ...args: unknown[]) => string;
}

interface Emits {
  (e: "toggleFavorite"): void;
  (e: "selectChart", chartIndex: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <template v-if="props.currentSong">
    <SongHero
      :title="props.currentSong.title"
      :subtitle="props.currentSong.subtitle"
      :artist="props.currentSong.artist ?? ''"
      :displayBpm="props.currentSong.displayBpm ?? ''"
      :bannerUrl="props.bannerUrl"
      :hue="props.currentSongIndex * 37"
      :isFavorite="props.isFavorite"
      :t="props.t"
      @toggleFavorite="emit('toggleFavorite')"
    />

    <div class="detail-panel-inner">
      <SongChartList
        :charts="props.filteredCharts"
        :hasSourceCharts="props.hasSourceCharts"
        :currentChartIndex="props.currentChartIndex"
        :difficultyColors="props.difficultyColors"
        :difficultyLabelFn="props.difficultyLabelFn"
        :stepsTypeLabelFn="props.stepsTypeLabelFn"
        :t="props.t"
        :noChartsMessage="props.noChartsMessage"
        :noMatchingChartsMessage="props.noMatchingChartsMessage"
        @selectChart="emit('selectChart', $event)"
      />

      <slot name="afterCharts" />
    </div>

    <slot name="actions" />
  </template>
  <div v-else class="no-selection">
    <div class="no-sel-icon">▶</div>
    <p>{{ props.noSelectionText }}</p>
  </div>
</template>

<style scoped>
.detail-panel-inner {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.no-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--text-subtle);
}

.no-sel-icon {
  font-size: 3rem;
  opacity: 0.15;
}

.no-selection p {
  font-family: "Orbitron", sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.2em;
}
</style>
