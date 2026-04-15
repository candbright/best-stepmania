<script setup lang="ts">
import type { StyleValue } from "vue";
import { useI18n } from "@/i18n";
import type { ChartInfo } from "@/utils/api";
import { DIFF_COLORS } from "./constants";

const { t } = useI18n();

defineProps<{
  activeChart: ChartInfo | undefined;
  noteStatTotalCount: number;
  noteStatTapCount: number;
  noteStatHoldCount: number;
  noteStatsDonutStyle: StyleValue;
  noteStatsTapPct: number;
  noteStatsHoldPct: number;
  translateChartDifficulty: (d: string) => string;
  translateChartStepsType: (st: string) => string;
}>();
</script>

<template>
  <div class="sidebar-content note-stats-panel">
    <h4>{{ t('editor.noteStatsTitle') }}</h4>

    <div v-if="activeChart" class="note-stats-chart-pill">
      <span class="note-stats-pill-dot" :style="{ background: DIFF_COLORS[activeChart.difficulty] || '#78909c' }" />
      <span class="note-stats-pill-text">
        {{ translateChartDifficulty(activeChart.difficulty) }} · Lv.{{ activeChart.meter }}
        <span class="note-stats-pill-sep">·</span>
        {{ translateChartStepsType(activeChart.stepsType) }}
      </span>
    </div>

    <div v-if="noteStatTotalCount === 0" class="note-stats-empty">
      <div class="note-stats-empty-icon" aria-hidden="true">♪</div>
      <p class="note-stats-empty-title">{{ t('editor.noteStatsEmpty') }}</p>
      <p class="note-stats-empty-hint">{{ t('editor.noteStatsEmptyHint') }}</p>
    </div>

    <template v-else>
      <div class="note-stats-visual">
        <div class="note-stats-donut" :style="noteStatsDonutStyle">
          <div class="note-stats-donut-hole">
            <span class="note-stats-donut-num">{{ noteStatTotalCount }}</span>
            <span class="note-stats-donut-label">{{ t('editor.noteStatsTotal') }}</span>
          </div>
        </div>
      </div>

      <div class="note-stats-split-bar" role="presentation">
        <div v-if="noteStatTapCount > 0" class="note-stats-split-seg note-stats-split-seg--tap" :style="{ flexGrow: noteStatTapCount }" />
        <div v-if="noteStatHoldCount > 0" class="note-stats-split-seg note-stats-split-seg--hold" :style="{ flexGrow: noteStatHoldCount }" />
      </div>

      <ul class="note-stats-chip-list">
        <li class="note-stats-chip note-stats-chip--tap">
          <span class="note-stats-chip-glyph" aria-hidden="true">◇</span>
          <div class="note-stats-chip-main">
            <span class="note-stats-chip-label">{{ t('editor.noteStatsTap') }}</span>
            <span class="note-stats-chip-value">{{ noteStatTapCount }}</span>
          </div>
          <span class="note-stats-chip-pct">{{ noteStatsTapPct }}%</span>
        </li>
        <li class="note-stats-chip note-stats-chip--hold">
          <span class="note-stats-chip-glyph" aria-hidden="true">▬</span>
          <div class="note-stats-chip-main">
            <span class="note-stats-chip-label">{{ t('editor.noteStatsHold') }}</span>
            <span class="note-stats-chip-value">{{ noteStatHoldCount }}</span>
          </div>
          <span class="note-stats-chip-pct">{{ noteStatsHoldPct }}%</span>
        </li>
      </ul>
    </template>
  </div>
</template>
