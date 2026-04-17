<script setup lang="ts">
import { computed } from "vue";
import type { ChartInfoItem } from "@/shared/api";

const props = defineProps<{
  charts: ChartInfoItem[];
  hasSourceCharts?: boolean;
  currentChartIndex: number;
  difficultyColors: Record<string, string>;
  difficultyLabelFn: (diff: string) => string;
  stepsTypeLabelFn: (type: string) => string;
  t: (key: string) => string;
  noChartsMessage?: string;
  noMatchingChartsMessage?: string;
}>();

const emit = defineEmits<{
  (e: "selectChart", chartIndex: number): void;
}>();

// Callers should prefer passing translated copy explicitly.
// These fallbacks keep the component from ever rendering raw i18n keys.
const emptyStateMessage = computed(() => {
  if (props.hasSourceCharts === false) {
    return props.noChartsMessage ?? props.t("select.noChartsInSong");
  }
  return props.noMatchingChartsMessage ?? props.t("select.noMatchingCharts");
});
</script>

<template>
  <div class="detail-panel-inner">
    <div class="section-label">{{ props.t('select.charts') }}</div>
    <div class="diff-list">
      <button
        v-for="chart in props.charts"
        :key="chart.chartIndex"
        type="button"
        class="diff-btn"
        :class="{ active: chart.chartIndex === props.currentChartIndex }"
        :style="{ '--dc': props.difficultyColors[chart.difficulty] || '#888' }"
        @click="emit('selectChart', chart.chartIndex)"
      >
        <span class="diff-gem" />
        <span class="diff-name">{{ props.difficultyLabelFn(chart.difficulty) }}</span>
        <span class="diff-meter">{{ chart.meter }}</span>
        <span class="diff-type">{{ props.stepsTypeLabelFn(chart.stepsType) }}</span>
        <span class="diff-notes">{{ chart.noteCount }} {{ props.t('select.notes') }}</span>
      </button>
      <div v-if="props.charts.length === 0" class="no-charts">
        {{ emptyStateMessage }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-panel-inner {
  flex: 1; overflow-y: auto; overflow-x: hidden;
}

.section-label {
  padding: 0.5rem 1.25rem 0.25rem;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.55rem; letter-spacing: 0.3em;
  color: color-mix(in srgb, var(--primary-color) 72%, var(--text-muted));
}

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
</style>
