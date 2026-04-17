<script setup lang="ts">
import { useI18n } from "@/shared/i18n";
import { NOTE_TYPES, getNoteTypeIcon } from "./constants";
import type { ShortcutId } from "@/engine/keyBindings";

const { t } = useI18n();

const NOTE_TYPE_SHORTCUT_IDS = [
  "editor.noteType1",
  "editor.noteType2",
  "editor.noteType3",
  "editor.noteType4",
] as const satisfies readonly ShortcutId[];

const props = defineProps<{
  editorToolbarEditingEnabled: boolean;
  isPumpRoutineChart: boolean;
  routineP1Accent: string;
  routineP2Accent: string;
  hasSelection: boolean;
  clipboardLen: number;
  clipboardBpmLen: number;
  shortcutHint: (id: ShortcutId) => string;
}>();

const currentNoteType = defineModel<string>("currentNoteType", { required: true });
const editorRoutineLayer = defineModel<1 | 2>("editorRoutineLayer", { required: true });

const emit = defineEmits<{
  selectAll: [];
  clearSelection: [];
  copy: [];
  cut: [];
  paste: [];
  delete: [];
  flipH: [];
  flipV: [];
  flipD: [];
}>();

function noteTypeTitle(i: number, labelKey: string): string {
  const sid = NOTE_TYPE_SHORTCUT_IDS[i];
  const hint = sid ? props.shortcutHint(sid) : "";
  return t(labelKey) + hint;
}
</script>

<template>
  <div class="toolbar-group">
    <button
      v-for="(nt, i) in NOTE_TYPES"
      :key="nt.id"
      type="button"
      class="tool-icon-btn note-type-icon"
      :class="{ active: currentNoteType === nt.id }"
      :style="{ '--nt-color': nt.color }"
      :title="noteTypeTitle(i, nt.label)"
      :disabled="!editorToolbarEditingEnabled"
      @click="currentNoteType = nt.id"
    >
      {{ getNoteTypeIcon(nt.id) }}
    </button>
  </div>
  <template v-if="isPumpRoutineChart">
    <div class="toolbar-divider" />
    <div
      class="toolbar-group routine-layer-toolbar"
      :title="t('editor.routineLayerHint') + shortcutHint('editor.routineLayer1') + '/' + shortcutHint('editor.routineLayer2')"
    >
      <span class="routine-layer-caption">{{ t("editor.routineLayer") }}</span>
      <button
        type="button"
        class="tool-icon-btn routine-layer-pill"
        :class="{ active: editorRoutineLayer === 1 }"
        :disabled="!editorToolbarEditingEnabled"
        :style="{
          borderColor: editorRoutineLayer === 1 ? routineP1Accent : 'rgba(255,255,255,0.12)',
          color: editorRoutineLayer === 1 ? routineP1Accent : 'rgba(255,255,255,0.45)',
        }"
        @click="editorRoutineLayer = 1"
      >
        {{ t("editor.routineLayerP1") }}
      </button>
      <button
        type="button"
        class="tool-icon-btn routine-layer-pill"
        :class="{ active: editorRoutineLayer === 2 }"
        :disabled="!editorToolbarEditingEnabled"
        :style="{
          borderColor: editorRoutineLayer === 2 ? routineP2Accent : 'rgba(255,255,255,0.12)',
          color: editorRoutineLayer === 2 ? routineP2Accent : 'rgba(255,255,255,0.45)',
        }"
        @click="editorRoutineLayer = 2"
      >
        {{ t("editor.routineLayerP2") }}
      </button>
    </div>
  </template>
  <div class="toolbar-divider" />

  <div class="toolbar-group">
    <button
      type="button"
      class="tool-icon-btn"
      :title="t('editor.selectAll') + shortcutHint('editor.selectAll')"
      :disabled="!editorToolbarEditingEnabled"
      @click="emit('selectAll')"
    >⊞</button>
    <button
      type="button"
      class="tool-icon-btn"
      :title="t('editor.clearSelection') + shortcutHint('editor.clearSelection')"
      :disabled="!editorToolbarEditingEnabled || !hasSelection"
      @click="emit('clearSelection')"
    >⊟</button>
    <button
      type="button"
      class="tool-icon-btn"
      :title="t('editor.copy') + shortcutHint('editor.copy')"
      :disabled="!editorToolbarEditingEnabled || !hasSelection"
      @click="emit('copy')"
    >⧉</button>
    <button
      type="button"
      class="tool-icon-btn"
      :title="t('editor.cut') + shortcutHint('editor.cut')"
      :disabled="!editorToolbarEditingEnabled || !hasSelection"
      @click="emit('cut')"
    >✂</button>
    <button
      type="button"
      class="tool-icon-btn"
      :title="t('editor.paste') + shortcutHint('editor.paste')"
      :disabled="!editorToolbarEditingEnabled || (clipboardLen === 0 && clipboardBpmLen === 0)"
      @click="emit('paste')"
    >⎗</button>
    <button
      type="button"
      class="tool-icon-btn danger"
      :title="t('editor.delete') + shortcutHint('editor.delete')"
      :disabled="!editorToolbarEditingEnabled || !hasSelection"
      @click="emit('delete')"
    >✕</button>
    <button
      type="button"
      class="tool-icon-btn"
      :title="t('editor.flipH') + shortcutHint('editor.flipH')"
      :disabled="!editorToolbarEditingEnabled || !hasSelection"
      @click="emit('flipH')"
    >⇄</button>
    <button
      type="button"
      class="tool-icon-btn"
      :title="t('editor.flipV') + shortcutHint('editor.flipV')"
      :disabled="!editorToolbarEditingEnabled || !hasSelection"
      @click="emit('flipV')"
    >⇅</button>
    <button
      type="button"
      class="tool-icon-btn"
      :title="t('editor.flipD') + shortcutHint('editor.flipD')"
      :disabled="!editorToolbarEditingEnabled || !hasSelection"
      @click="emit('flipD')"
    >
      <span class="tool-icon-glyph tool-icon-glyph--rotate-m45" aria-hidden="true">⇄</span>
    </button>
  </div>
</template>
