<script setup lang="ts">
import { useI18n } from "@/shared/i18n";
import type { BpmChange } from "./useEditorState";
import { BPM_BEAT_MATCH_EPS, EDITOR_CANVAS_SCROLLBAR_PX } from "./constants";
import { BaseNumberField } from "@/shared/ui";
import CustomScrollArea from "@/shared/ui/CustomScrollArea.vue";

const { t } = useI18n();

defineProps<{
  allChartsLength: number;
  bpmChanges: BpmChange[];
}>();

const newBpmBeat = defineModel<number>("newBpmBeat", { required: true });
const newBpmValue = defineModel<number>("newBpmValue", { required: true });

const emit = defineEmits<{
  updateBpmChange: [idx: number, bpm: number];
  deleteBpmChange: [idx: number];
  addBpmChange: [];
}>();
</script>

<template>
  <CustomScrollArea class="sidebar-content bpm-panel" :scrollbar-width="EDITOR_CANVAS_SCROLLBAR_PX" :show-arrows="true">
    <div class="sidebar-content-inner">
    <h4>{{ t('editor.bpmTabTitle') }}</h4>
    <template v-if="allChartsLength">
      <div class="bpm-add-section">
        <label class="meta-field">
          <span>{{ t('editor.bpmNewAnchorBeat') }}</span>
          <BaseNumberField v-model="newBpmBeat" step="0.25" min="0" />
        </label>
        <label class="meta-field">
          <span>{{ t('editor.bpmNewAnchorBpm') }}</span>
          <BaseNumberField v-model="newBpmValue" step="0.01" min="1" />
        </label>
        <button type="button" class="tool-btn small accent bpm-add-btn" @click="emit('addBpmChange')">
          + {{ t('editor.bpmAddChange') }}
        </button>
      </div>
      <div class="bpm-list">
        <label v-for="(bc, idx) in bpmChanges" :key="idx" class="meta-field bpm-field">
          <span>{{ t('editor.bpmChangeRowLabel').replace('{0}', bc.beat.toFixed(3)) }}</span>
          <div class="meta-field-with-action">
            <BaseNumberField
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
    </template>
    <p v-else class="chart-list-empty-hint">{{ t('editor.noChartsHint') }}</p>
    </div>
  </CustomScrollArea>
</template>
