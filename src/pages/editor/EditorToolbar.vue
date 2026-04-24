<script setup lang="ts">
import { useI18n } from "@/shared/i18n";
import EditorToolbarNoteSelectionGroup from "./EditorToolbarNoteSelectionGroup.vue";
import EditorToolbarPlaybackGroup from "./EditorToolbarPlaybackGroup.vue";
import EditorToolbarControlsGroup from "./EditorToolbarControlsGroup.vue";
import type { ShortcutId } from "@/shared/lib/engine/keyBindings";
import { ref } from "vue";
import { useHorizontalScrollArea } from "@/shared/composables/useHorizontalScrollArea";
import "./editorToolbar.css";

const { t } = useI18n();

defineProps<{
  songTitle: string;
  rhythmSfxEnabled: boolean;
  metronomeSfxEnabled: boolean;
  editorToolbarEditingEnabled: boolean;
  playing: boolean;
  canDeleteBeat: boolean;
  isPumpRoutineChart: boolean;
  routineP1Accent: string;
  routineP2Accent: string;
  saving: boolean;
  undoStackLength: number;
  redoStackLength: number;
  hasSelection: boolean;
  clipboardLen: number;
  clipboardBpmLen: number;
  shortcutHint: (id: ShortcutId) => string;
}>();

const quantize = defineModel<number>("quantize", { required: true });
const editorRate = defineModel<number>("editorRate", { required: true });
const showBeatLines = defineModel<boolean>("showBeatLines", { required: true });
const showTrackGrid = defineModel<boolean>("showTrackGrid", { required: true });
const currentNoteType = defineModel<string>("currentNoteType", { required: true });
const editorRoutineLayer = defineModel<1 | 2>("editorRoutineLayer", { required: true });

const emit = defineEmits<{
  goBack: [];
  selectAll: [];
  clearSelection: [];
  copy: [];
  cut: [];
  paste: [];
  delete: [];
  flipH: [];
  flipV: [];
  flipD: [];
  togglePlayback: [];
  previewPlay: [];
  toggleRhythmSfx: [];
  toggleMetronomeSfx: [];
  undo: [];
  redo: [];
  save: [];
  addBeat: [];
  deleteBeat: [];
  toolbarSelectKeydown: [e: KeyboardEvent];
}>();

const {
  viewportRef: toolbarScrollViewportRef,
  trackRef: toolbarCustomTrackRef,
  thumbWidthPx: toolbarThumbWidthPx,
  thumbLeftPx: toolbarThumbLeftPx,
  trackVisible: toolbarTrackVisible,
  onViewportScroll: onToolbarViewportScroll,
  onThumbPointerDown: onToolbarThumbPointerDown,
  onThumbPointerMove: onToolbarThumbPointerMove,
  onThumbPointerUp: onToolbarThumbPointerUp,
  onTrackPointerDown: onToolbarTrackPointerDown,
  nudgeScrollBy: nudgeToolbarScrollBy,
} = useHorizontalScrollArea();
void toolbarCustomTrackRef;

const toolbarScrollHostRef = ref<HTMLElement | null>(null);

defineExpose({
  getScrollTrackEl: (): HTMLElement | null => toolbarScrollViewportRef.value,
  getHorizontalScrollHostEl: (): HTMLElement | null => toolbarScrollHostRef.value,
});

</script>

<template>
  <header class="toolbar">
    <div class="toolbar-back-fixed">
      <button class="tool-icon-btn" type="button" @click="emit('goBack')" :title="t('back')">←</button>
    </div>
    <div ref="toolbarScrollHostRef" class="toolbar-scroll">
      <div
        ref="toolbarScrollViewportRef"
        class="toolbar-scroll-track"
        @dragstart.prevent
        @scroll.passive="onToolbarViewportScroll"
      >
        <div class="toolbar-scroll-icons">
          <EditorToolbarNoteSelectionGroup
            v-model:current-note-type="currentNoteType"
            v-model:editor-routine-layer="editorRoutineLayer"
            :editor-toolbar-editing-enabled="editorToolbarEditingEnabled"
            :is-pump-routine-chart="isPumpRoutineChart"
            :routine-p1-accent="routineP1Accent"
            :routine-p2-accent="routineP2Accent"
            :has-selection="hasSelection"
            :clipboard-len="clipboardLen"
            :clipboard-bpm-len="clipboardBpmLen"
            :shortcut-hint="shortcutHint"
            @select-all="emit('selectAll')"
            @clear-selection="emit('clearSelection')"
            @copy="emit('copy')"
            @cut="emit('cut')"
            @paste="emit('paste')"
            @delete="emit('delete')"
            @flip-h="emit('flipH')"
            @flip-v="emit('flipV')"
            @flip-d="emit('flipD')"
          />
          <div class="toolbar-divider" />

          <EditorToolbarPlaybackGroup
            :playing="playing"
            :rhythm-sfx-enabled="rhythmSfxEnabled"
            :metronome-sfx-enabled="metronomeSfxEnabled"
            :editor-toolbar-editing-enabled="editorToolbarEditingEnabled"
            :undo-stack-length="undoStackLength"
            :redo-stack-length="redoStackLength"
            :saving="saving"
            :shortcut-hint="shortcutHint"
            @toggle-playback="emit('togglePlayback')"
            @preview-play="emit('previewPlay')"
            @toggle-rhythm-sfx="emit('toggleRhythmSfx')"
            @toggle-metronome-sfx="emit('toggleMetronomeSfx')"
            @undo="emit('undo')"
            @redo="emit('redo')"
            @save="emit('save')"
          />
          <div class="toolbar-divider" />

          <EditorToolbarControlsGroup
            v-model:quantize="quantize"
            v-model:editor-rate="editorRate"
            v-model:show-beat-lines="showBeatLines"
            v-model:show-track-grid="showTrackGrid"
            :editor-toolbar-editing-enabled="editorToolbarEditingEnabled"
            :playing="playing"
            :can-delete-beat="canDeleteBeat"
            :shortcut-hint="shortcutHint"
            @add-beat="emit('addBeat')"
            @delete-beat="emit('deleteBeat')"
            @toolbar-select-keydown="emit('toolbarSelectKeydown', $event)"
          />
        </div>
      </div>
      <div class="editor-hscrollbar" :class="{ 'is-collapsed': !toolbarTrackVisible }">
        <button type="button" class="editor-hscrollbar__arrow" @click="nudgeToolbarScrollBy(-1)">◀</button>
        <div
          ref="toolbarCustomTrackRef"
          class="editor-hscrollbar__track"
          @pointerdown="onToolbarTrackPointerDown"
        >
          <div
            class="editor-hscrollbar__thumb hscroll-thumb"
            :style="{ width: `${toolbarThumbWidthPx}px`, transform: `translateX(${toolbarThumbLeftPx}px)` }"
            @pointerdown="onToolbarThumbPointerDown"
            @pointermove="onToolbarThumbPointerMove"
            @pointerup="onToolbarThumbPointerUp"
            @pointercancel="onToolbarThumbPointerUp"
          />
        </div>
        <button type="button" class="editor-hscrollbar__arrow" @click="nudgeToolbarScrollBy(1)">▶</button>
      </div>
    </div>
    <div class="toolbar-song-fixed" :title="songTitle">
      <span class="song-name">{{ songTitle || "—" }}</span>
    </div>
  </header>
</template>
