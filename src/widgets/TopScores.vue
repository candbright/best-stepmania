<script setup lang="ts">
import type { HighScoreInfo } from "@/utils/api";

defineProps<{
  topScores: HighScoreInfo[];
  profileId: string | null;
  clearingTopScores: boolean;
  displayPercentFromDpRatio: (ratio: number) => number;
  gradeTextGradientStyle: (grade: string) => Record<string, string>;
  formatPlayedAt: (iso: string) => string;
  title: string;
  clearLabel: string;
  fullComboLabel: string;
}>();

const emit = defineEmits<{
  (e: "clear"): void;
}>();
</script>

<template>
  <div v-if="topScores.length > 0" class="top-scores">
    <div class="top-scores-head">
      <div class="section-label">{{ title }}</div>
      <button
        type="button"
        class="clear-top-scores-btn"
        :disabled="clearingTopScores || !profileId"
        @click="emit('clear')"
      >
        {{ clearLabel }}
      </button>
    </div>
    <ul class="top-scores-list">
      <li
        v-for="(row, idx) in topScores"
        :key="`${row.playedAt}-${idx}`"
        class="score-row"
      >
        <span class="rank">{{ idx + 1 }}</span>
        <span class="grade" :style="gradeTextGradientStyle(row.grade)">{{ row.grade }}</span>
        <span class="pct">{{ displayPercentFromDpRatio(row.dpPercent).toFixed(2) }}%</span>
        <span v-if="row.fullCombo" class="fc-badge">{{ fullComboLabel }}</span>
        <span class="played-at">{{ formatPlayedAt(row.playedAt) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.top-scores { padding: 0 1.25rem 0.5rem; }
.top-scores-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-bottom: 0.25rem;
}
.section-label {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.55rem; letter-spacing: 0.3em;
  color: color-mix(in srgb, var(--primary-color) 72%, var(--text-muted));
}
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
