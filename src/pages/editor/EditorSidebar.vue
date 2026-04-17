<script setup lang="ts">
import type { StyleValue } from "vue";
import { useI18n } from "@/shared/i18n";
import type { ChartInfo } from "@/shared/api";
import type { BpmChange } from "./useEditorState";
import EditorSidebarChartsPanel from "./EditorSidebarChartsPanel.vue";
import EditorSidebarInfoPanel from "./EditorSidebarInfoPanel.vue";
import EditorSidebarStatsPanel from "./EditorSidebarStatsPanel.vue";
import EditorSidebarBpmPanel from "./EditorSidebarBpmPanel.vue";
import "./editorSidebar.css";

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
  startMeterEdit: [];
  meterValueChanged: [];
  commitMeterEdit: [];
  cancelMeterEdit: [];
  startOffsetEdit: [];
  offsetValueChanged: [];
  commitOffsetEdit: [];
  cancelOffsetEdit: [];
  startSampleStartEdit: [];
  sampleStartValueChanged: [];
  commitSampleStartEdit: [];
  cancelSampleStartEdit: [];
  startSampleLengthEdit: [];
  sampleLengthValueChanged: [];
  commitSampleLengthEdit: [];
  cancelSampleLengthEdit: [];
}>();
</script>

<template>
  <div class="sidebar-right">
    <div class="sidebar-tabs">
      <button type="button" class="sidebar-tab" :class="{ active: sidebarTab === 'charts' }" @click="sidebarTab = 'charts'" :title="t('editor.chartListTitle')">📋</button>
      <button type="button" class="sidebar-tab" :class="{ active: sidebarTab === 'info' }" @click="sidebarTab = 'info'" :title="t('editor.metadata')">ℹ</button>
      <button type="button" class="sidebar-tab" :class="{ active: sidebarTab === 'stats' }" @click="sidebarTab = 'stats'" :title="t('editor.noteStatsTabHint')">📊</button>
      <button type="button" class="sidebar-tab" :class="{ active: sidebarTab === 'bpm' }" @click="sidebarTab = 'bpm'" :title="t('editor.bpmTabHint')">♩</button>
    </div>

    <div class="sidebar-panels">
      <EditorSidebarChartsPanel
        v-show="sidebarTab === 'charts'"
        v-model:edit-chart-steps-type="editChartStepsType"
        v-model:edit-chart-difficulty="editChartDifficulty"
        v-model:edit-chart-meter="editChartMeter"
        :all-charts="props.allCharts"
        :active-chart-index="props.activeChartIndex"
        :chart-steps-type-options="props.chartStepsTypeOptions"
        :chart-properties-saving="props.chartPropertiesSaving"
        :saving="props.saving"
        :hold-start-row="props.holdStartRow"
        :translate-chart-difficulty="props.translateChartDifficulty"
        :translate-chart-steps-type="props.translateChartStepsType"
        :steps-type-property-label="props.stepsTypePropertyLabel"
        @switch-chart="(i) => emit('switchChart', i)"
        @open-new-chart="emit('openNewChart')"
        @duplicate-chart="emit('duplicateChart')"
        @open-delete-chart="emit('openDeleteChart')"
        @apply-chart-properties="emit('applyChartProperties')"
        @start-meter-edit="emit('startMeterEdit')"
        @meter-value-changed="emit('meterValueChanged')"
        @commit-meter-edit="emit('commitMeterEdit')"
        @cancel-meter-edit="emit('cancelMeterEdit')"
      />

      <EditorSidebarInfoPanel
        v-show="sidebarTab === 'info'"
        v-model:meta-title="metaTitle"
        v-model:meta-subtitle="metaSubtitle"
        v-model:meta-artist="metaArtist"
        v-model:meta-genre="metaGenre"
        v-model:meta-music="metaMusic"
        v-model:meta-banner="metaBanner"
        v-model:meta-background="metaBackground"
        v-model:meta-offset="metaOffset"
        v-model:meta-sample-start="metaSampleStart"
        v-model:meta-sample-length="metaSampleLength"
        :meta-saving="props.metaSaving"
        @save-metadata="emit('saveMetadata')"
        @start-offset-edit="emit('startOffsetEdit')"
        @offset-value-changed="emit('offsetValueChanged')"
        @commit-offset-edit="emit('commitOffsetEdit')"
        @cancel-offset-edit="emit('cancelOffsetEdit')"
        @start-sample-start-edit="emit('startSampleStartEdit')"
        @sample-start-value-changed="emit('sampleStartValueChanged')"
        @commit-sample-start-edit="emit('commitSampleStartEdit')"
        @cancel-sample-start-edit="emit('cancelSampleStartEdit')"
        @start-sample-length-edit="emit('startSampleLengthEdit')"
        @sample-length-value-changed="emit('sampleLengthValueChanged')"
        @commit-sample-length-edit="emit('commitSampleLengthEdit')"
        @cancel-sample-length-edit="emit('cancelSampleLengthEdit')"
      />

      <EditorSidebarStatsPanel
        v-show="sidebarTab === 'stats'"
        :active-chart="props.activeChart"
        :note-stat-total-count="props.noteStatTotalCount"
        :note-stat-tap-count="props.noteStatTapCount"
        :note-stat-hold-count="props.noteStatHoldCount"
        :note-stats-donut-style="props.noteStatsDonutStyle"
        :note-stats-tap-pct="props.noteStatsTapPct"
        :note-stats-hold-pct="props.noteStatsHoldPct"
        :translate-chart-difficulty="props.translateChartDifficulty"
        :translate-chart-steps-type="props.translateChartStepsType"
      />

      <EditorSidebarBpmPanel
        v-show="sidebarTab === 'bpm'"
        v-model:new-bpm-beat="newBpmBeat"
        v-model:new-bpm-value="newBpmValue"
        :all-charts-length="props.allCharts.length"
        :bpm-changes="props.bpmChanges"
        @update-bpm-change="(i, b) => emit('updateBpmChange', i, b)"
        @delete-bpm-change="(i) => emit('deleteBpmChange', i)"
        @add-bpm-change="emit('addBpmChange')"
      />
    </div>
  </div>
</template>
