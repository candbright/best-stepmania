<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/i18n";
import type { ChartInfo } from "@/utils/api";
import { DIFFICULTIES, DIFF_COLORS } from "./constants";
import { CustomSelect } from "@/shared/ui";
import { AppNumberField } from "@/shared/ui";

const { t } = useI18n();

const props = defineProps<{
  allCharts: ChartInfo[];
  activeChartIndex: number;
  chartStepsTypeOptions: string[];
  chartPropertiesSaving: boolean;
  saving: boolean;
  holdStartRow: { row: number; track: number } | null;
  translateChartDifficulty: (d: string) => string;
  translateChartStepsType: (st: string) => string;
  stepsTypePropertyLabel: (st: string) => string;
}>();

const editChartStepsType = defineModel<string>("editChartStepsType", { required: true });
const editChartDifficulty = defineModel<string>("editChartDifficulty", { required: true });
const editChartMeter = defineModel<number>("editChartMeter", { required: true });

const emit = defineEmits<{
  switchChart: [idx: number];
  openNewChart: [];
  duplicateChart: [];
  openDeleteChart: [];
  applyChartProperties: [];
  startMeterEdit: [];
  meterValueChanged: [];
  commitMeterEdit: [];
  cancelMeterEdit: [];
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
  <div class="sidebar-content">
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
            data-editor-shortcuts="allow"
            :min="1"
            :max="99"
            :disabled="chartPropertiesSaving"
            @step="emit('startMeterEdit')"
            @focus="emit('startMeterEdit')"
            @update:model-value="emit('meterValueChanged')"
            @blur="emit('commitMeterEdit')"
            @keydown.escape="emit('cancelMeterEdit')"
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
</template>
