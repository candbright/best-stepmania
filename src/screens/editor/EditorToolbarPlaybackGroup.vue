<script setup lang="ts">
import { useI18n } from "@/i18n";
import type { ShortcutId } from "@/engine/keyBindings";

const { t } = useI18n();

defineProps<{
  playing: boolean;
  rhythmSfxEnabled: boolean;
  metronomeSfxEnabled: boolean;
  editorToolbarEditingEnabled: boolean;
  undoStackLength: number;
  redoStackLength: number;
  saving: boolean;
  shortcutHint: (id: ShortcutId) => string;
}>();

const emit = defineEmits<{
  togglePlayback: [];
  previewPlay: [];
  toggleRhythmSfx: [];
  toggleMetronomeSfx: [];
  undo: [];
  redo: [];
  save: [];
}>();
</script>

<template>
  <div class="toolbar-group">
    <button
      type="button"
      class="tool-icon-btn tool-icon-btn--playback"
      :title="(playing ? t('editor.pause') : t('editor.play')) + shortcutHint('editor.playPause')"
      :disabled="!editorToolbarEditingEnabled"
      @click="emit('togglePlayback')"
    >
      {{ playing ? '⏸' : '▶' }}
    </button>
    <button
      type="button"
      class="tool-icon-btn preview-btn"
      :title="t('editor.previewPlay') + shortcutHint('editor.previewPlay')"
      :disabled="!editorToolbarEditingEnabled"
      @click="emit('previewPlay')"
    >🎮</button>
    <button
      type="button"
      class="tool-icon-btn"
      :class="{ 'tool-icon-btn--inactive': !rhythmSfxEnabled }"
      :title="t('editor.rhythmSfx')"
      @click="emit('toggleRhythmSfx')"
    >
      <span class="tool-icon-glyph">R</span>
    </button>
    <button
      type="button"
      class="tool-icon-btn"
      :class="{ 'tool-icon-btn--inactive': !metronomeSfxEnabled }"
      :title="t('editor.metronomeSfx')"
      @click="emit('toggleMetronomeSfx')"
    >
      <span class="tool-icon-glyph">M</span>
    </button>
    <button
      type="button"
      class="tool-icon-btn"
      :title="t('editor.undo') + shortcutHint('editor.undo')"
      :disabled="!editorToolbarEditingEnabled || undoStackLength <= 1"
      @click="emit('undo')"
    >↩</button>
    <button
      type="button"
      class="tool-icon-btn"
      :title="t('editor.redo') + shortcutHint('editor.redo')"
      :disabled="!editorToolbarEditingEnabled || redoStackLength === 0"
      @click="emit('redo')"
    >↪</button>
    <button
      type="button"
      class="tool-icon-btn save-icon"
      :title="t('editor.save') + shortcutHint('editor.save')"
      :disabled="saving || !editorToolbarEditingEnabled"
      @click="emit('save')"
    >💾</button>
  </div>
</template>
