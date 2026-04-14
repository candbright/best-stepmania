<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "@/i18n";
import CustomSelect from "@/components/CustomSelect.vue";
import {
  NOTE_TYPES,
  RATE_OPTIONS,
  EDITOR_QUANTIZE_LEVELS,
  getNoteTypeIcon,
} from "./constants";
import type { ShortcutId } from "@/engine/keyBindings";

const { t } = useI18n();

const NOTE_TYPE_SHORTCUT_IDS = [
  "editor.noteType1",
  "editor.noteType2",
  "editor.noteType3",
  "editor.noteType4",
] as const satisfies readonly ShortcutId[];

const props = defineProps<{
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

function noteTypeTitle(i: number, labelKey: string): string {
  const sid = NOTE_TYPE_SHORTCUT_IDS[i];
  const hint = sid ? props.shortcutHint(sid) : "";
  return t(labelKey) + hint;
}

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

const toolbarScrollTrackRef = ref<HTMLElement | null>(null);

defineExpose({
  getScrollTrackEl: (): HTMLElement | null => toolbarScrollTrackRef.value,
});

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
  <header class="toolbar">
    <div class="toolbar-back-fixed">
      <button class="tool-icon-btn" type="button" @click="emit('goBack')" :title="t('back')">←</button>
      <div class="toolbar-divider toolbar-divider--back" />
    </div>
    <div class="toolbar-scroll">
      <div ref="toolbarScrollTrackRef" class="toolbar-scroll-track">
        <div class="toolbar-scroll-icons">
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
              :title="t('editor.routineLayerHint') + props.shortcutHint('editor.routineLayer1') + '/' + props.shortcutHint('editor.routineLayer2')"
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
              :title="t('editor.selectAll') + props.shortcutHint('editor.selectAll')"
              :disabled="!editorToolbarEditingEnabled"
              @click="emit('selectAll')"
            >⊞</button>
            <button
              type="button"
              class="tool-icon-btn"
              :title="t('editor.clearSelection') + props.shortcutHint('editor.clearSelection')"
              :disabled="!editorToolbarEditingEnabled || !hasSelection"
              @click="emit('clearSelection')"
            >⊟</button>
            <button
              type="button"
              class="tool-icon-btn"
              :title="t('editor.copy') + props.shortcutHint('editor.copy')"
              :disabled="!editorToolbarEditingEnabled || !hasSelection"
              @click="emit('copy')"
            >⧉</button>
            <button
              type="button"
              class="tool-icon-btn"
              :title="t('editor.cut') + props.shortcutHint('editor.cut')"
              :disabled="!editorToolbarEditingEnabled || !hasSelection"
              @click="emit('cut')"
            >✂</button>
            <button
              type="button"
              class="tool-icon-btn"
              :title="t('editor.paste') + props.shortcutHint('editor.paste')"
              :disabled="!editorToolbarEditingEnabled || (clipboardLen === 0 && clipboardBpmLen === 0)"
              @click="emit('paste')"
            >⎗</button>
            <button
              type="button"
              class="tool-icon-btn danger"
              :title="t('editor.delete') + props.shortcutHint('editor.delete')"
              :disabled="!editorToolbarEditingEnabled || !hasSelection"
              @click="emit('delete')"
            >✕</button>
            <button
              type="button"
              class="tool-icon-btn"
              :title="t('editor.flipH') + props.shortcutHint('editor.flipH')"
              :disabled="!editorToolbarEditingEnabled || !hasSelection"
              @click="emit('flipH')"
            >⇄</button>
            <button
              type="button"
              class="tool-icon-btn"
              :title="t('editor.flipV') + props.shortcutHint('editor.flipV')"
              :disabled="!editorToolbarEditingEnabled || !hasSelection"
              @click="emit('flipV')"
            >⇅</button>
            <button
              type="button"
              class="tool-icon-btn"
              :title="t('editor.flipD') + props.shortcutHint('editor.flipD')"
              :disabled="!editorToolbarEditingEnabled || !hasSelection"
              @click="emit('flipD')"
            >
              <span class="tool-icon-glyph tool-icon-glyph--rotate-m45" aria-hidden="true">⇄</span>
            </button>
          </div>
          <div class="toolbar-divider" />

          <div class="toolbar-group">
            <button
              type="button"
              class="tool-icon-btn tool-icon-btn--playback"
              :title="(playing ? t('editor.pause') : t('editor.play')) + props.shortcutHint('editor.playPause')"
              :disabled="!editorToolbarEditingEnabled"
              @click="emit('togglePlayback')"
            >
              {{ playing ? '⏸' : '▶' }}
            </button>
            <button
              type="button"
              class="tool-icon-btn preview-btn"
              :title="t('editor.previewPlay') + props.shortcutHint('editor.previewPlay')"
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
              :title="t('editor.undo') + props.shortcutHint('editor.undo')"
              :disabled="!editorToolbarEditingEnabled || undoStackLength <= 1"
              @click="emit('undo')"
            >↩</button>
            <button
              type="button"
              class="tool-icon-btn"
              :title="t('editor.redo') + props.shortcutHint('editor.redo')"
              :disabled="!editorToolbarEditingEnabled || redoStackLength === 0"
              @click="emit('redo')"
            >↪</button>
            <button
              type="button"
              class="tool-icon-btn save-icon"
              :title="t('editor.save') + props.shortcutHint('editor.save')"
              :disabled="saving || !editorToolbarEditingEnabled"
              @click="emit('save')"
            >💾</button>
          </div>
          <div class="toolbar-divider" />

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
        </div>
      </div>
    </div>
    <div class="toolbar-song-fixed" :title="songTitle">
      <span class="song-name">{{ songTitle || "—" }}</span>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 0;
  background: var(--bg-color);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  min-height: var(--editor-toolbar-band-h);
}
.toolbar-back-fixed {
  flex-shrink: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 0;
  align-self: stretch;
  min-height: var(--editor-toolbar-band-h);
  padding:
    var(--editor-toolbar-track-pad-y)
    max(0.45rem, 10px)
    var(--editor-toolbar-hscroll-pad)
    max(1.4rem, 28px);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: var(--bg-color);
  z-index: 2;
}
.toolbar-divider--back {
  margin-left: 0.28rem;
  margin-right: 0.12rem;
}
.toolbar-scroll {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: var(--editor-toolbar-band-h);
}
.toolbar-scroll-track {
  box-sizing: border-box;
  flex-shrink: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding:
    var(--editor-toolbar-track-pad-y)
    max(0.35rem, 10px)
    var(--editor-toolbar-hscroll-pad)
    max(0.35rem, 10px);
  min-height: var(--editor-toolbar-band-h);
  max-height: var(--editor-toolbar-band-h);
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  scroll-padding-left: 18px;
  scroll-padding-right: 18px;
}
.toolbar-scroll-icons {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.42rem;
  width: max-content;
  min-height: var(--editor-toolbar-icons-h);
  max-height: var(--editor-toolbar-icons-h);
}
.toolbar-scroll-icons::before,
.toolbar-scroll-icons::after {
  content: "";
  width: 18px;
  min-width: 18px;
  flex: 0 0 18px;
}
.toolbar-scroll-track::-webkit-scrollbar {
  height: var(--editor-hscrollbar-thick);
}
.toolbar-scroll-track::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 2px;
}
.toolbar-scroll-track::-webkit-scrollbar-track {
  background: transparent;
}
.toolbar-song-fixed {
  flex-shrink: 0;
  box-sizing: border-box;
  width: var(--editor-sidebar-width);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  min-height: var(--editor-toolbar-band-h);
  padding: 0.4rem max(1.4rem, 28px);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(
    180deg,
    rgba(8, 8, 15, 0.3) 0%,
    rgba(20, 15, 35, 0.5) 50%,
    rgba(8, 8, 15, 0.3) 100%
  );
  box-shadow: -8px 0 20px -8px rgba(0, 0, 0, 0.5);
  z-index: 2;
}
.toolbar-group {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.toolbar-divider {
  width: 1px;
  height: 22px;
  background: rgba(255, 255, 255, 0.08);
  margin: 0 0.22rem;
  flex-shrink: 0;
}
.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.tool-icon-btn {
  box-sizing: border-box;
  width: var(--editor-toolbar-icon-btn);
  height: var(--editor-toolbar-icon-btn);
  min-width: var(--editor-toolbar-icon-btn);
  min-height: var(--editor-toolbar-icon-btn);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--editor-toolbar-icon-size);
  line-height: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 0;
  transition: all 0.12s;
  flex-shrink: 0;
}
.tool-icon-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-color);
}
.tool-icon-btn--playback {
  font-size: calc(var(--editor-toolbar-icon-size, 0.85rem) * 0.76);
}
.tool-icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.tool-icon-btn.danger {
  color: #ff5252;
}
.tool-icon-btn.danger:hover {
  background: rgba(255, 23, 68, 0.15);
}
.tool-icon-btn.save-icon:hover {
  background: rgba(0, 230, 118, 0.12);
  color: #00e676;
}
.tool-icon-btn.preview-btn:hover {
  background: color-mix(in srgb, var(--primary-color) 18%, transparent);
  color: color-mix(in srgb, var(--primary-color-hover) 65%, var(--text-color));
}
.tool-icon-btn--inactive {
  opacity: 0.4;
}

.tool-icon-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  line-height: 1;
  flex-shrink: 0;
}
.tool-icon-glyph--rotate-m45 {
  transform: rotate(-45deg);
}

.beat-lines-toggle-icon {
  position: relative;
  width: 14px;
  height: 14px;
  display: inline-block;
}
.beat-lines-toggle-icon .line {
  position: absolute;
  left: 1px;
  right: 1px;
  height: 1.6px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.95;
}
.beat-lines-toggle-icon .line-top {
  top: 3px;
}
.beat-lines-toggle-icon .line-bottom {
  bottom: 3px;
}
.beat-lines-toggle-icon .slash {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 20px;
  height: 2px;
  transform: translate(-50%, -50%) rotate(38deg);
  transform-origin: center;
  border-radius: 999px;
  background-image: repeating-linear-gradient(to right, currentColor 0 3px, transparent 3px 5.5px);
  opacity: 0;
}
.beat-lines-toggle-icon.is-hidden .slash {
  opacity: 0.95;
}

.track-grid-toggle-icon {
  position: relative;
  width: 14px;
  height: 14px;
  display: inline-block;
}
.track-grid-toggle-icon .vline {
  position: absolute;
  top: 1px;
  bottom: 1px;
  width: 1.6px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.95;
}
.track-grid-toggle-icon .vline-left {
  left: 3px;
}
.track-grid-toggle-icon .vline-right {
  right: 3px;
}
.track-grid-toggle-icon .diag-slash {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 20px;
  height: 2px;
  transform: translate(-50%, -50%) rotate(45deg);
  transform-origin: center;
  border-radius: 999px;
  background-image: repeating-linear-gradient(to right, currentColor 0 3px, transparent 3px 5.5px);
  opacity: 0;
}
.track-grid-toggle-icon.is-hidden .diag-slash {
  opacity: 0.95;
}

.note-type-icon {
  font-weight: 700;
  color: rgba(255, 255, 255, 0.5);
}
.note-type-icon.active {
  border-color: var(--nt-color, #4fc3f7);
  background: color-mix(in srgb, var(--nt-color, #4fc3f7) 15%, transparent);
  color: var(--nt-color, #4fc3f7);
  box-shadow: 0 0 6px color-mix(in srgb, var(--nt-color, #4fc3f7) 30%, transparent);
}

.routine-layer-toolbar {
  gap: 0.35rem;
  flex-wrap: nowrap;
  flex-shrink: 0;
}
.routine-layer-caption {
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
  margin-right: 0.15rem;
  white-space: nowrap;
}
.tool-icon-btn.routine-layer-pill {
  width: auto;
  min-height: 30px;
  height: auto;
  padding: 0.2rem 0.55rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.2;
  white-space: nowrap;
}
.tool-icon-btn.routine-layer-pill.active {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.35);
}

.compact-label {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}
.compact-label--wide-select {
  min-width: 5.4rem;
}
.compact-label--wide-select :deep(.custom-select--compact) {
  width: 100%;
}
.song-name {
  font-family: "Orbitron", "Rajdhani", sans-serif;
  font-weight: 700;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.75);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  min-width: 0;
  text-shadow: 0 0 12px rgba(var(--primary-color-rgb, 138, 43, 226), 0.4);
  padding: 0 0.25rem;
}
</style>
