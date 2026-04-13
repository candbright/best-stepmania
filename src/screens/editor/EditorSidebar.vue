<script setup lang="ts">
import type { StyleValue } from "vue";
import { computed } from "vue";
import { useI18n } from "@/i18n";
import type { ChartInfo } from "@/utils/api";
import type { BpmChange } from "./useEditorState";
import { DIFFICULTIES, DIFF_COLORS, BPM_BEAT_MATCH_EPS } from "./constants";
import CustomSelect from "@/components/CustomSelect.vue";
import AppNumberField from "@/components/AppNumberField.vue";

const { t } = useI18n();

type EditorSidebarTab = "charts" | "info" | "stats" | "bpm";

const props = defineProps<{
  allCharts: ChartInfo[];
  activeChartIndex: number;
  activeChart: ChartInfo | undefined;
  chartStepsTypeOptions: string[];
  chartPropertiesSaving: boolean;
  metaSaving: boolean;
  saving: boolean;
  holdStartRow: { row: number; track: number } | null;
  bpmChanges: BpmChange[];
  noteStatTotalCount: number;
  noteStatTapCount: number;
  noteStatHoldCount: number;
  noteStatsDonutStyle: StyleValue;
  noteStatsTapPct: number;
  noteStatsHoldPct: number;
  translateChartDifficulty: (d: string) => string;
  translateChartStepsType: (st: string) => string;
  stepsTypePropertyLabel: (st: string) => string;
}>();

const sidebarTab = defineModel<EditorSidebarTab>("sidebarTab", { required: true });

const editChartStepsType = defineModel<string>("editChartStepsType", { required: true });
const editChartDifficulty = defineModel<string>("editChartDifficulty", { required: true });
const editChartMeter = defineModel<number>("editChartMeter", { required: true });

const metaTitle = defineModel<string>("metaTitle", { required: true });
const metaSubtitle = defineModel<string>("metaSubtitle", { required: true });
const metaArtist = defineModel<string>("metaArtist", { required: true });
const metaGenre = defineModel<string>("metaGenre", { required: true });
const metaMusic = defineModel<string>("metaMusic", { required: true });
const metaBanner = defineModel<string>("metaBanner", { required: true });
const metaBackground = defineModel<string>("metaBackground", { required: true });
const metaOffset = defineModel<number>("metaOffset", { required: true });
const metaSampleStart = defineModel<number>("metaSampleStart", { required: true });
const metaSampleLength = defineModel<number>("metaSampleLength", { required: true });

const newBpmBeat = defineModel<number>("newBpmBeat", { required: true });
const newBpmValue = defineModel<number>("newBpmValue", { required: true });

const emit = defineEmits<{
  switchChart: [idx: number];
  openNewChart: [];
  duplicateChart: [];
  openDeleteChart: [];
  applyChartProperties: [];
  saveMetadata: [];
  updateBpmChange: [idx: number, bpm: number];
  deleteBpmChange: [idx: number];
  addBpmChange: [];
}>();

const chartStepsTypeSelectOptions = computed(() =>
  props.chartStepsTypeOptions.map((st) => ({
    value: st,
    label: props.stepsTypePropertyLabel(st),
  })),
);

const chartDifficultySelectOptions = computed(() =>
  DIFFICULTIES.map((d) => ({
    value: d,
    label: props.translateChartDifficulty(d),
  })),
);
</script>

<template>
  <div class="sidebar-right">
    <div class="sidebar-tabs">
      <button type="button" class="sidebar-tab" :class="{ active: sidebarTab === 'charts' }" @click="sidebarTab = 'charts'" :title="t('editor.chartListTitle')">📋</button>
      <button type="button" class="sidebar-tab" :class="{ active: sidebarTab === 'info' }" @click="sidebarTab = 'info'" :title="t('editor.metadata')">ℹ</button>
      <button type="button" class="sidebar-tab" :class="{ active: sidebarTab === 'stats' }" @click="sidebarTab = 'stats'" :title="t('editor.noteStatsTabHint')">📊</button>
      <button type="button" class="sidebar-tab" :class="{ active: sidebarTab === 'bpm' }" @click="sidebarTab = 'bpm'" :title="t('editor.bpmTabHint')">♩</button>
    </div>

    <div v-show="sidebarTab === 'charts'" class="sidebar-content">
      <h4 class="chart-list-heading">{{ t('editor.chartListTitle') }}</h4>
      <div class="chart-list-heading-divider" role="presentation" />
      <p v-if="!allCharts.length" class="chart-list-empty-hint">{{ t('editor.noChartsHint') }}</p>
      <div class="chart-list">
        <button
          v-for="(chart, idx) in allCharts"
          :key="idx"
          type="button"
          class="chart-item"
          :class="{ active: idx === activeChartIndex }"
          :style="{ '--diff-color': DIFF_COLORS[chart.difficulty] || '#78909c' }"
          @click="emit('switchChart', idx)"
        >
          <div class="chart-item-main">
            <span class="chart-item-main-left">
              <span class="chart-diff">{{ translateChartDifficulty(chart.difficulty) }}</span>
              <span class="chart-meter">Lv.{{ chart.meter }}</span>
            </span>
            <span class="chart-type">{{ translateChartStepsType(chart.stepsType) }}</span>
          </div>
          <div v-if="chart.chartName" class="chart-item-name-row">
            <span class="chart-name">{{ chart.chartName }}</span>
          </div>
        </button>
      </div>

      <div class="chart-actions">
        <button type="button" class="tool-btn small accent chart-action-btn" @click="emit('openNewChart')">
          <span class="chart-action-inner">
            <span class="chart-action-glyph" aria-hidden="true">+</span>
            <span class="chart-action-label">{{ t('editor.newChart') }}</span>
          </span>
        </button>
        <button
          type="button"
          class="tool-btn small chart-action-btn"
          @click="emit('duplicateChart')"
          :disabled="!allCharts.length || saving"
          :title="t('editor.duplicateChartHint')"
        >
          <span class="chart-action-inner">
            <span class="chart-action-glyph" aria-hidden="true">⧉</span>
            <span class="chart-action-label">{{ t('editor.duplicateChart') }}</span>
          </span>
        </button>
        <button
          type="button"
          class="tool-btn small danger chart-action-btn"
          @click="emit('openDeleteChart')"
          :disabled="!allCharts.length || saving"
          :title="t('editor.deleteChart')"
        >
          <span class="chart-action-inner">
            <span class="chart-action-glyph" aria-hidden="true">✕</span>
            <span class="chart-action-label">{{ t('editor.deleteChart') }}</span>
          </span>
        </button>
      </div>

      <template v-if="allCharts.length">
        <h4 class="sidebar-section-head">{{ t('editor.chartPropertiesTitle') }}</h4>
        <div class="meta-form chart-properties-form">
          <label class="meta-field">
            <span>{{ t('editor.stepsType') }}</span>
            <CustomSelect
              v-model="editChartStepsType"
              variant="form"
              :options="chartStepsTypeSelectOptions"
              :disabled="chartPropertiesSaving"
            />
          </label>
          <label class="meta-field">
            <span>{{ t('editor.difficulty') }}</span>
            <CustomSelect
              v-model="editChartDifficulty"
              variant="form"
              :options="chartDifficultySelectOptions"
              :disabled="chartPropertiesSaving"
            />
          </label>
          <label class="meta-field">
            <span>{{ t('editor.meter') }}</span>
            <AppNumberField
              v-model="editChartMeter"
              :min="1"
              :max="99"
              :disabled="chartPropertiesSaving"
            />
          </label>
          <button
            type="button"
            class="tool-btn small accent chart-properties-apply"
            :disabled="chartPropertiesSaving"
            @click="emit('applyChartProperties')"
          >
            {{ chartPropertiesSaving ? t('editor.saving') : t('editor.chartPropertiesApply') }}
          </button>
        </div>
      </template>

      <div v-if="holdStartRow" class="sidebar-hint">
        {{ t('editor.holdDragHint') }}
      </div>
    </div>

    <div v-show="sidebarTab === 'info'" class="sidebar-content">
      <h4 class="sidebar-section-head">{{ t('editor.metadata') }}</h4>
      <div class="meta-form">
        <label class="meta-field">
          <span>{{ t('editor.metaTitle') }}</span>
          <input v-model="metaTitle" type="text" />
        </label>
        <label class="meta-field">
          <span>{{ t('editor.metaSubtitle') }}</span>
          <input v-model="metaSubtitle" type="text" />
        </label>
        <label class="meta-field">
          <span>{{ t('editor.metaArtist') }}</span>
          <input v-model="metaArtist" type="text" />
        </label>
        <label class="meta-field">
          <span>{{ t('editor.metaGenre') }}</span>
          <input v-model="metaGenre" type="text" />
        </label>
        <label class="meta-field">
          <span>{{ t('editor.metaMusic') }}</span>
          <input v-model="metaMusic" type="text" :placeholder="t('editor.placeholderAudioFile')" />
        </label>
        <label class="meta-field">
          <span>{{ t('editor.metaBanner') }}</span>
          <input v-model="metaBanner" type="text" :placeholder="t('editor.placeholderBanner')" />
        </label>
        <label class="meta-field">
          <span>{{ t('editor.metaBackground') }}</span>
          <input v-model="metaBackground" type="text" :placeholder="t('editor.placeholderBackground')" />
        </label>
        <label class="meta-field">
          <span>{{ t('editor.metaOffset') }}</span>
          <AppNumberField v-model="metaOffset" inputmode="decimal" step="0.001" />
        </label>
        <label class="meta-field">
          <span>{{ t('editor.metaSampleStart') }}</span>
          <AppNumberField v-model="metaSampleStart" step="0.1" />
        </label>
        <label class="meta-field">
          <span>{{ t('editor.metaSampleLength') }}</span>
          <AppNumberField v-model="metaSampleLength" step="0.1" />
        </label>
        <button type="button" class="tool-btn save-btn meta-save" @click="emit('saveMetadata')" :disabled="metaSaving">
          {{ t('editor.save') }}
        </button>
      </div>
    </div>

    <div v-show="sidebarTab === 'stats'" class="sidebar-content note-stats-panel">
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

    <div v-show="sidebarTab === 'bpm'" class="sidebar-content bpm-panel">
      <h4>{{ t('editor.bpmTabTitle') }}</h4>
      <template v-if="allCharts.length">
        <div class="bpm-list">
          <label v-for="(bc, idx) in bpmChanges" :key="idx" class="meta-field bpm-field">
            <span>{{ t('editor.bpmChangeRowLabel').replace('{0}', bc.beat.toFixed(3)) }}</span>
            <div class="meta-field-with-action">
              <AppNumberField
                :model-value="bc.bpm"
                step="0.01"
                min="1"
                :emit-while-typing="false"
                @update:model-value="emit('updateBpmChange', idx, $event ?? 120)"
              />
              <button
                v-if="bpmChanges.length > 1 && Math.abs(bc.beat) >= BPM_BEAT_MATCH_EPS"
                type="button"
                class="bpm-meta-del"
                :title="t('editor.deleteBpmChange')"
                @click="emit('deleteBpmChange', idx)"
              >✕</button>
            </div>
          </label>
        </div>
        <div class="bpm-add-section">
          <label class="meta-field">
            <span>{{ t('editor.bpmNewAnchorBeat') }}</span>
            <AppNumberField v-model="newBpmBeat" step="0.25" min="0" />
          </label>
          <label class="meta-field">
            <span>{{ t('editor.bpmNewAnchorBpm') }}</span>
            <AppNumberField v-model="newBpmValue" step="0.01" min="1" />
          </label>
          <button type="button" class="tool-btn small accent bpm-add-btn" @click="emit('addBpmChange')">
            + {{ t('editor.bpmAddChange') }}
          </button>
        </div>
      </template>
      <p v-else class="chart-list-empty-hint">{{ t('editor.noChartsHint') }}</p>
    </div>
  </div>
</template>

<style scoped>
.chart-list-empty-hint {
  margin: 0 0 0.5rem;
  font-size: 0.72rem;
  line-height: 1.4;
  color: var(--text-subtle);
}
.sidebar-content h4.chart-list-heading {
  margin-bottom: 0.35rem;
}
.chart-list-heading-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 0 0.55rem;
}

.sidebar-right {
  box-sizing: border-box;
  width: var(--editor-sidebar-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.01);
}
.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
.sidebar-tab {
  flex: 1;
  padding: 0.5rem 0;
  text-align: center;
  font-size: 1rem;
  cursor: pointer;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255, 255, 255, 0.35);
  transition: all 0.15s;
}
.sidebar-tab:hover {
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.03);
}
.sidebar-tab.active {
  color: color-mix(in srgb, var(--primary-color-hover) 72%, var(--text-color));
  border-bottom-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 6%, transparent);
}
.sidebar-content {
  flex: 1;
  min-height: 0;
  overflow-y: scroll;
  overflow-x: hidden;
  padding: 0.75rem;
  scrollbar-gutter: stable;
}
.sidebar-content h4 {
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.3);
  margin-bottom: 0.5rem;
  text-transform: uppercase;
}
.sidebar-content h4.sidebar-section-head {
  padding-bottom: 0.42rem;
  margin-bottom: 0.55rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.note-stats-panel h4 {
  margin-bottom: 0.6rem;
}
.note-stats-chart-pill {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.55rem;
  margin-bottom: 1rem;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
}
.note-stats-pill-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 8px color-mix(in srgb, currentColor 40%, transparent);
}
.note-stats-pill-text {
  font-size: 0.68rem;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.55);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.note-stats-pill-sep {
  color: rgba(255, 255, 255, 0.2);
  margin: 0 0.15rem;
}
.note-stats-empty {
  text-align: center;
  padding: 1.5rem 0.75rem 1.25rem;
}
.note-stats-empty-icon {
  font-size: 2rem;
  opacity: 0.2;
  margin-bottom: 0.35rem;
}
.note-stats-empty-title {
  margin: 0 0 0.35rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.45);
}
.note-stats-empty-hint {
  margin: 0;
  font-size: 0.68rem;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.28);
}
.note-stats-visual {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}
.note-stats-donut {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
}
.note-stats-donut-hole {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: rgba(12, 10, 22, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
}
.note-stats-donut-num {
  font-size: 1.35rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.92);
  line-height: 1;
}
.note-stats-donut-label {
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.32);
}
.note-stats-split-bar {
  display: flex;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 0.85rem;
  background: rgba(255, 255, 255, 0.06);
}
.note-stats-split-seg--tap {
  background: #4fc3f7;
}
.note-stats-split-seg--hold {
  background: #ffb74d;
}
.note-stats-chip-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.note-stats-chip {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}
.note-stats-chip-glyph {
  flex-shrink: 0;
  width: 1.1rem;
  text-align: center;
  font-size: 0.85rem;
  opacity: 0.55;
}
.note-stats-chip-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
}
.note-stats-chip-label {
  font-size: 0.58rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
}
.note-stats-chip-value {
  font-size: 1.05rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1;
}
.note-stats-chip-pct {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.38);
  padding: 0.2rem 0.4rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
}

.bpm-panel h4 {
  margin-bottom: 0.6rem;
}
.bpm-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}
.bpm-field {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.bpm-field:hover {
  background: rgba(255, 255, 255, 0.04);
}
.bpm-add-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 0.25rem;
}

.chart-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 0.5rem;
}
.chart-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.28rem;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  text-align: left;
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  color: inherit;
}
.chart-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.chart-item.active {
  border-color: var(--diff-color, color-mix(in srgb, var(--primary-color) 50%, transparent));
  background: color-mix(in srgb, var(--diff-color, var(--primary-color)) 12%, transparent);
}
.chart-item-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: nowrap;
  gap: 0.5rem;
  width: 100%;
  min-width: 0;
}
.chart-item-main-left {
  display: flex;
  align-items: baseline;
  flex-wrap: nowrap;
  gap: 0.35rem;
  min-width: 0;
  flex: 1 1 0;
}
.chart-diff,
.chart-meter {
  font-size: 0.74rem;
  line-height: 1.25;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.chart-diff {
  color: var(--diff-color, var(--primary-color-hover));
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chart-meter {
  color: rgba(255, 255, 255, 0.88);
  font-weight: 800;
  flex-shrink: 0;
}
.chart-type {
  font-size: 0.65rem;
  line-height: 1.25;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.38);
  flex: 0 1 auto;
  max-width: 52%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
.chart-item-name-row {
  display: flex;
  align-items: baseline;
  min-width: 0;
  min-height: calc(0.65rem * 1.25);
}
.chart-name {
  font-size: 0.65rem;
  line-height: 1.25;
  font-weight: 600;
  color: rgba(255, 213, 128, 0.92);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chart-properties-form {
  margin-bottom: 0.35rem;
}
.chart-properties-apply {
  width: 100%;
  margin-top: 0.15rem;
}
.chart-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 0.75rem;
}
.chart-actions .tool-btn.chart-action-btn {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1.25;
  min-height: 0;
  padding: 0.32rem 0.55rem;
  overflow: hidden;
}
.chart-action-inner {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  max-width: 100%;
  min-width: 0;
}
.chart-action-glyph {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15em;
  min-width: 1.15em;
  height: 1.15em;
  font-size: 1em;
  line-height: 1;
  font-weight: 800;
  font-family: system-ui, "Segoe UI Symbol", "Noto Sans Symbols2", sans-serif;
  transform: translateY(0.04em);
}
.chart-action-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.meta-field {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.meta-field span {
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.meta-field input {
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color);
  font-size: 0.75rem;
  outline: none;
}
.meta-field input:focus {
  border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
  background: rgba(255, 255, 255, 0.06);
}
.meta-field :deep(.app-number-field-host) {
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color);
  font-size: 0.75rem;
}
.meta-field :deep(.app-number-field-host:focus-within) {
  border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: none;
}
.meta-field :deep(.app-number-spin) {
  border-left-color: rgba(255, 255, 255, 0.12);
}
.meta-field :deep(.app-number-spin-btn) {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.55);
}
.meta-field :deep(.app-number-spin-btn:hover:not(:disabled)) {
  background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  color: var(--text-color);
}
.meta-field select {
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color);
  font-size: 0.75rem;
  outline: none;
}
.meta-field select option {
  background: var(--bg-color);
  color: var(--text-color);
}
.meta-field select:focus {
  border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
  background: rgba(255, 255, 255, 0.06);
}
.meta-field select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.meta-save {
  margin-top: 0.5rem;
  width: 100%;
}

.meta-field-with-action {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.meta-field-with-action input {
  flex: 1;
  min-width: 0;
}
.meta-field-with-action :deep(.app-number-field-host) {
  flex: 1;
  min-width: 0;
}
.bpm-meta-del {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: rgba(255, 23, 68, 0.08);
  border: 1px solid rgba(255, 23, 68, 0.22);
  color: #ff5252;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.bpm-meta-del:hover {
  background: rgba(255, 23, 68, 0.18);
}
.bpm-add-btn {
  width: 100%;
}

.tool-btn {
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  white-space: nowrap;
}
.tool-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-color);
}
.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tool-btn.small {
  font-size: 0.7rem;
  padding: 0.25rem 0.5rem;
}
.tool-btn.danger {
  border-color: rgba(255, 23, 68, 0.3);
  color: #ff5252;
}
.tool-btn.danger:hover {
  background: rgba(255, 23, 68, 0.15);
}
.tool-btn.accent {
  border-color: color-mix(in srgb, var(--primary-color) 30%, transparent);
  color: color-mix(in srgb, var(--primary-color-hover) 70%, var(--text-color));
}
.tool-btn.accent:hover {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
}
.save-btn {
  background: rgba(0, 230, 118, 0.08);
  border-color: rgba(0, 230, 118, 0.2);
  color: #00e676;
}
.save-btn:hover {
  background: rgba(0, 230, 118, 0.15);
}

.sidebar-hint {
  font-size: 0.7rem;
  color: #ffd740;
  padding: 0.5rem;
  background: rgba(255, 215, 64, 0.08);
  border-radius: 4px;
  margin-top: 0.5rem;
}
</style>
