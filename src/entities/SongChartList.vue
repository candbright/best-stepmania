<script setup lang="ts">
import type { ChartInfoItem } from "@/utils/api";

defineProps<{
  charts: ChartInfoItem[];
  currentChartIndex: number;
  difficultyColors: Record<string, string>;
  difficultyLabel: (difficulty: string) => string;
  stepsTypeLabel: (stepsType: string) => string;
  chartsLabel: string;
  notesLabel: string;
  noMatchingChartsLabel: string;
}>();

const emit = defineEmits<{
  (e: "selectChart", chartIndex: number): void;
}>();
</script>

<template>
  <div>
    <div class="section-label">{{ chartsLabel }}</div>
    <div class="diff-list">
      <button
        v-for="chart in charts"
        :key="chart.chartIndex"
        type="button"
        class="diff-btn"
        :class="{ active: chart.chartIndex === currentChartIndex }"
        :style="{ '--dc': difficultyColors[chart.difficulty] || '#888' }"
        @click="emit('selectChart', chart.chartIndex)"
      >
        <span class="diff-gem" />
        <span class="diff-name">{{ difficultyLabel(chart.difficulty) }}</span>
        <span class="diff-meter">{{ chart.meter }}</span>
        <span class="diff-type">{{ stepsTypeLabel(chart.stepsType) }}</span>
        <span class="diff-notes">{{ chart.noteCount }} {{ notesLabel }}</span>
      </button>
      <div v-if="charts.length === 0" class="no-charts">{{ noMatchingChartsLabel }}</div>
    </div>
  </div>
</template>

<style scoped>
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
