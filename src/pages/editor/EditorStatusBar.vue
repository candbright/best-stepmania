<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@/shared/i18n";
import type { ChartInfo } from "@/shared/api";

defineProps<{
  scrollBeat: number;
  bpmAtBeat: number;
  zoom: number;
  editorRate: number;
  activeChart: ChartInfo | undefined;
  editorToolbarEditingEnabled: boolean;
  translateChartStepsType: (st: string) => string;
  translateChartDifficulty: (d: string) => string;
}>();

const { t } = useI18n();

const statusBarScrollTrackRef = ref<HTMLElement | null>(null);

defineExpose({
  getScrollTrackEl: (): HTMLElement | null => statusBarScrollTrackRef.value,
});
</script>

<template>
  <div class="status-bar" :class="{ 'status-bar--no-chart': !editorToolbarEditingEnabled }">
    <div class="status-bar-scroll">
      <div ref="statusBarScrollTrackRef" class="status-bar-scroll-track">
        <div class="status-bar-scroll-row">
          <span class="status-metric">
            <span class="status-metric__label">{{ t("editor.statusBeat") }}:</span>
            <span class="status-metric__val status-metric__val--beat">{{ scrollBeat.toFixed(2) }}</span>
          </span>
          <span class="status-metric">
            <span class="status-metric__label">{{ t("editor.statusBpm") }}:</span>
            <span class="status-metric__val status-metric__val--bpm">{{ bpmAtBeat.toFixed(2) }}</span>
          </span>
          <span class="status-metric">
            <span class="status-metric__label">{{ t("editor.statusZoom") }}:</span>
            <span class="status-metric__val status-metric__val--zoom">{{ zoom.toFixed(1) }}</span>
            <span class="status-metric__suffix">px/beat</span>
          </span>
          <span class="status-metric">
            <span class="status-metric__label">{{ t("editor.statusRate") }}:</span>
            <span class="status-metric__val status-metric__val--rate">{{ editorRate.toFixed(2) }}</span>
            <span class="status-metric__suffix">x</span>
          </span>
          <span v-if="activeChart" class="status-bar-chart-line">
            {{ translateChartStepsType(activeChart.stepsType) }} / {{ translateChartDifficulty(activeChart.difficulty) }}
            {{ activeChart.meter }}
          </span>
          <span class="status-bar-shortcuts">{{ t("editor.shortcutsBar") }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  flex-shrink: 0;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.status-bar-scroll {
  overflow: hidden;
}
.status-bar-scroll-track {
  box-sizing: border-box;
  overflow-x: auto;
  overflow-y: hidden;
  padding: var(--editor-status-pad-y) 1rem var(--editor-status-hscroll-pad) 1rem;
  min-height: var(--editor-status-band-h);
  max-height: var(--editor-status-band-h);
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  font-variant-numeric: tabular-nums;
}
.status-bar-scroll-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 1.5rem;
  width: max-content;
  min-height: var(--editor-status-row-min-h);
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.25);
}
.status-bar-scroll-track::-webkit-scrollbar {
  height: 6px;
}
.status-bar-scroll-track::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}
.status-bar-scroll-row > .status-metric,
.status-bar-scroll-row > .status-bar-chart-line,
.status-bar-scroll-row > .status-bar-shortcuts {
  flex-shrink: 0;
  white-space: nowrap;
}
.status-metric {
  display: inline-flex;
  align-items: baseline;
  gap: 0.2em;
}
.status-metric__val {
  display: inline-block;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
/* Reserve width so digit-count changes during playback do not shift the rest of the bar */
.status-metric__val--beat {
  min-width: 10ch;
}
.status-metric__val--bpm {
  min-width: 7ch;
}
.status-metric__val--zoom {
  min-width: 7ch;
}
.status-metric__val--rate {
  min-width: 5ch;
}
</style>
