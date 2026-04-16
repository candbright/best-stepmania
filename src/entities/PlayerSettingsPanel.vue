<script setup lang="ts">
import { useI18n } from "@/i18n";
import { HelpTooltip } from "@/shared/ui";
import { SettingsCard } from "@/widgets";
import type { ChartInfoItem } from "@/utils/api";
import type { RoutinePlayerColorId } from "@/constants/routinePlayerColors";

defineProps<{
  player: 1 | 2;
  title: string;
  sideHint?: string;
  disabled?: boolean;
  locked?: boolean;
  charts: ChartInfoItem[];
  currentChartIndex: number;
  speedModsC: readonly string[];
  speedModsX: readonly string[];
  noteStyles: readonly string[];
  noteScales: readonly number[];
  availableSkins: readonly string[];
  selectedChartIndex: number;
  selectedSpeedMod: string;
  selectedNoteskin: string;
  selectedNoteStyle: string;
  selectedNoteScale: number;
  selectedReverse: boolean;
  selectedMirror: boolean;
  selectedSudden: boolean;
  selectedHidden: boolean;
  selectedRotate: boolean;
  routineColors?: readonly { id: RoutinePlayerColorId; hex: string }[];
  selectedRoutineColorId?: RoutinePlayerColorId;
  showRoutineColor?: boolean;
  routineColorTitle?: (id: RoutinePlayerColorId) => string;
  routineColorDisabled?: (id: RoutinePlayerColorId, player: 1 | 2) => boolean;
}>();

const emit = defineEmits<{
  (e: "update:chartIndex", value: number): void;
  (e: "update:speedMod", value: string): void;
  (e: "update:noteskin", value: string): void;
  (e: "update:noteStyle", value: string): void;
  (e: "update:noteScale", value: number): void;
  (e: "update:reverse", value: boolean): void;
  (e: "update:mirror", value: boolean): void;
  (e: "update:sudden", value: boolean): void;
  (e: "update:hidden", value: boolean): void;
  (e: "update:rotate", value: boolean): void;
  (e: "update:routineColorId", value: RoutinePlayerColorId): void;
}>();

const { t } = useI18n();
const difficultyLabel = (diff?: string) => {
  if (!diff) return "—";
  const key = `difficulty.${diff}`;
  const translated = t(key);
  return translated === key ? diff : translated;
};
</script>

<template>
  <SettingsCard :title="title" :disabled="disabled" :locked="locked">
    <template #header>
      <span v-if="sideHint" class="player-side-hint">{{ sideHint }}</span>
      <label class="toggle-switch" :class="{ 'toggle-disabled': locked || disabled }">
        <input type="checkbox" :checked="!disabled" disabled />
        <span class="toggle-slider"></span>
      </label>
    </template>

    <div class="sub-section">
      <span class="setting-label">{{ t('playerOpt.difficulty') }}</span>
      <div class="diff-grid">
        <button v-for="chart in charts" :key="chart.chartIndex"
          class="diff-chip" :class="{ active: selectedChartIndex === chart.chartIndex }"
          @click="emit('update:chartIndex', chart.chartIndex)">
          {{ difficultyLabel(chart.difficulty) }} {{ chart.meter }}
        </button>
      </div>
    </div>

    <div class="sub-section">
      <span class="setting-label">{{ t('playerOpt.speed') }} <HelpTooltip helpKey="speed" /></span>
      <div class="speed-mod-rows">
        <div class="chip-grid-inline">
          <button v-for="mod in speedModsC" :key="mod"
            class="chip-sm" :class="{ active: selectedSpeedMod === mod }"
            @click="emit('update:speedMod', mod)">{{ mod }}</button>
        </div>
        <div class="chip-grid-inline">
          <button v-for="mod in speedModsX" :key="mod"
            class="chip-sm" :class="{ active: selectedSpeedMod === mod }"
            @click="emit('update:speedMod', mod)">{{ mod }}</button>
        </div>
      </div>
    </div>

    <div class="setting-row stacked">
      <span class="setting-label">{{ t('playerOpt.colorScheme') }} <HelpTooltip helpKey="colorScheme" /></span>
      <div class="chip-grid-inline">
        <button v-for="ns in availableSkins" :key="ns"
          class="chip-sm" :class="{ active: selectedNoteskin === ns }"
          @click="emit('update:noteskin', ns)">{{ ns }}</button>
      </div>
    </div>

    <div class="setting-row stacked">
      <span class="setting-label">{{ t('playerOpt.noteStyle') }}</span>
      <div class="chip-grid-inline">
        <button v-for="st in noteStyles" :key="st"
          class="chip-sm" :class="{ active: selectedNoteStyle === st }"
          @click="emit('update:noteStyle', st)">{{ st }}</button>
      </div>
    </div>

    <div class="setting-row stacked">
      <span class="setting-label">{{ t('playerOpt.noteScale') }}</span>
      <div class="chip-grid-inline">
        <button v-for="sc in noteScales" :key="sc"
          class="chip-sm" :class="{ active: selectedNoteScale === sc }"
          @click="emit('update:noteScale', sc)">{{ sc }}x</button>
      </div>
    </div>

    <div v-if="showRoutineColor && routineColors" class="setting-row stacked">
      <span class="setting-label">{{ t('playerOpt.routineP1Color') }}</span>
      <div class="color-picker">
        <button v-for="color in routineColors" :key="color.id"
          class="color-btn" :class="{ active: selectedRoutineColorId === color.id, disabled: routineColorDisabled?.(color.id, player) }"
          :style="{ backgroundColor: color.hex }"
          :title="routineColorTitle?.(color.id)"
          :disabled="routineColorDisabled?.(color.id, player)"
          @click="emit('update:routineColorId', color.id)" />
      </div>
    </div>

    <div class="setting-row">
      <span class="setting-label">{{ t('playerOpt.reverse') }}</span>
      <label class="toggle-switch"><input type="checkbox" :checked="selectedReverse" @change="emit('update:reverse', ($event.target as HTMLInputElement).checked)" /><span class="toggle-slider"></span></label>
    </div>
    <div class="setting-row">
      <span class="setting-label">{{ t('playerOpt.mirror') }}</span>
      <label class="toggle-switch"><input type="checkbox" :checked="selectedMirror" @change="emit('update:mirror', ($event.target as HTMLInputElement).checked)" /><span class="toggle-slider"></span></label>
    </div>
    <div class="setting-row">
      <span class="setting-label">{{ t('playerOpt.sudden') }}</span>
      <label class="toggle-switch"><input type="checkbox" :checked="selectedSudden" @change="emit('update:sudden', ($event.target as HTMLInputElement).checked)" /><span class="toggle-slider"></span></label>
    </div>
    <div class="setting-row">
      <span class="setting-label">{{ t('playerOpt.hidden') }}</span>
      <label class="toggle-switch"><input type="checkbox" :checked="selectedHidden" @change="emit('update:hidden', ($event.target as HTMLInputElement).checked)" /><span class="toggle-slider"></span></label>
    </div>
    <div class="setting-row">
      <span class="setting-label">{{ t('playerOpt.rotate') }}</span>
      <label class="toggle-switch"><input type="checkbox" :checked="selectedRotate" @change="emit('update:rotate', ($event.target as HTMLInputElement).checked)" /><span class="toggle-slider"></span></label>
    </div>
  </SettingsCard>
</template>
