<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/i18n";
import CustomSelect from "@/components/CustomSelect.vue";
import { EDITOR_QUANTIZE_LEVELS, RATE_OPTIONS } from "./constants";
import type { ShortcutId } from "@/engine/keyBindings";

const { t } = useI18n();

const props = defineProps<{
  editorToolbarEditingEnabled: boolean;
  playing: boolean;
  canDeleteBeat: boolean;
  shortcutHint: (id: ShortcutId) => string;
}>();

const quantize = defineModel<number>("quantize", { required: true });
const editorRate = defineModel<number>("editorRate", { required: true });
const showBeatLines = defineModel<boolean>("showBeatLines", { required: true });
const showTrackGrid = defineModel<boolean>("showTrackGrid", { required: true });

const emit = defineEmits<{
  addBeat: [];
  deleteBeat: [];
  toolbarSelectKeydown: [e: KeyboardEvent];
}>();

const quantizeSelectOptions = computed(() =>
  [...EDITOR_QUANTIZE_LEVELS].map((v) => ({
    value: v,
    label: `1/${v}`,
  })),
);

const rateSelectOptions = computed(() =>
  RATE_OPTIONS.map((r) => ({
    value: r,
    label: `${r}x`,
  })),
);
</script>

<template>
  <div class="toolbar-group toolbar-controls">
    <button
      type="button"
      class="tool-icon-btn"
      :title="t('editor.addBeatHint') + props.shortcutHint('editor.addBeat')"
      :disabled="!editorToolbarEditingEnabled || playing"
      @click="emit('addBeat')"
    >↓</button>
    <button
      type="button"
      class="tool-icon-btn"
      :title="t('editor.deleteBeatHint') + props.shortcutHint('editor.deleteBeat')"
      :disabled="!editorToolbarEditingEnabled || playing || !canDeleteBeat"
      @click="emit('deleteBeat')"
    >↑</button>
    <div class="toolbar-divider" />
    <label class="compact-label compact-label--wide-select" :title="t('editor.quantize')">
      <CustomSelect
        v-model="quantize"
        variant="compact"
        :options="quantizeSelectOptions"
        :disabled="!editorToolbarEditingEnabled"
        @trigger-keydown="emit('toolbarSelectKeydown', $event)"
      />
    </label>
    <button
      type="button"
      class="tool-icon-btn"
      :class="{ 'tool-icon-btn--inactive': !showBeatLines }"
      :title="showBeatLines ? t('editor.hideBeatLines') : t('editor.showBeatLines')"
      :disabled="!editorToolbarEditingEnabled"
      @click="showBeatLines = !showBeatLines"
    >
      <span class="beat-lines-toggle-icon" :class="{ 'is-hidden': !showBeatLines }" aria-hidden="true">
        <span class="line line-top" />
        <span class="line line-bottom" />
        <span class="slash" />
      </span>
    </button>
    <button
      type="button"
      class="tool-icon-btn"
      :class="{ 'tool-icon-btn--inactive': !showTrackGrid }"
      :title="showTrackGrid ? t('editor.hideTrackGrid') : t('editor.showTrackGrid')"
      :disabled="!editorToolbarEditingEnabled"
      @click="showTrackGrid = !showTrackGrid"
    >
      <span class="track-grid-toggle-icon" :class="{ 'is-hidden': !showTrackGrid }" aria-hidden="true">
        <span class="vline vline-left" />
        <span class="vline vline-right" />
        <span class="diag-slash" />
      </span>
    </button>
    <label class="compact-label compact-label--wide-select" :title="t('editor.rate')">
      <CustomSelect
        v-model="editorRate"
        variant="compact"
        :options="rateSelectOptions"
        :disabled="!editorToolbarEditingEnabled"
        @trigger-keydown="emit('toolbarSelectKeydown', $event)"
      />
    </label>
  </div>
</template>
