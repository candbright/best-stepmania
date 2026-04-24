<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { usePlayerStore } from "@/shared/stores/player";
import { useSessionStore } from "@/shared/stores/session";
import { useSettingsStore } from "@/shared/stores/settings";
import { useI18n } from "@/shared/i18n";
import * as api from "@/shared/api";
import {
  useEditorState,
  useEditorCanvas,
  useEditorActions,
  STEPS_TYPES,
  DIFFICULTIES,
} from "./editor";
import EditorToolbar from "./editor/EditorToolbar.vue";
import EditorSidebar from "./editor/EditorSidebar.vue";
import EditorStatusBar from "./editor/EditorStatusBar.vue";
import EditorPromptModals from "./editor/EditorPromptModals.vue";
import { ensureMinElapsed } from "@/shared/lib/loadingGate";
import { useBlockingOverlayStore } from "@/shared/stores/blockingOverlay";
import { logDebug, logError } from "@/shared/lib/devLog";
import { mergeShortcutBindings, eventMatchesBinding } from "@/shared/lib/engine/keyBindings";
import type { ShortcutId } from "@/shared/lib/engine/keyBindings";
import { useEditorDraftGuard } from "./editor/useEditorDraftGuard";
import { useEditorScreenChrome } from "./editor/useEditorScreenChrome";
import { useEditorScreenLifecycle } from "./editor/useEditorScreenLifecycle";
import EditorScreenChartModals from "./editor/EditorScreenChartModals.vue";

defineOptions({ name: "EditorScreen" });

const route = useRoute();
const player = usePlayerStore();
const session = useSessionStore();
const settings = useSettingsStore();

function shortcutMatches(e: KeyboardEvent, id: ShortcutId): boolean {
  const binding = mergeShortcutBindings(settings.shortcutOverrides)[id];
  return eventMatchesBinding(e, binding);
}
const blockingOverlay = useBlockingOverlayStore();
const { t } = useI18n();

const s = useEditorState();
const canvas = useEditorCanvas(s);
const actions = useEditorActions(s, canvas, route);

const {
  isPumpRoutineChart,
  routineP1Accent,
  routineP2Accent,
  editorToolbarEditingEnabled,
  noteStatsTapPct,
  noteStatsHoldPct,
  noteStatsDonutStyle,
  sc,
  toggleRhythmSfx,
  toggleMetronomeSfx,
} = useEditorScreenChrome(session, settings, s);

// Destructure frequently-used state for the template
const {
  canvasRef, scrollBeat, zoom, quantize, showBeatLines, showTrackGrid, playing, editorRate,
  undoStack, redoStack, saving, saveMessage, currentNoteType,
  holdStartRow,
  sidebarTab, bpmChanges, newBpmBeat, newBpmValue,
  noteStatTapCount, noteStatHoldCount, noteStatTotalCount,
  editingBpmChangeIndex, editingBpmInputValue,
  clipboard, clipboardBpmChanges, showNewChartModal,
  newChartStepsType, newChartDifficulty, newChartMeter,
  editChartStepsType, editChartDifficulty, editChartMeter, chartPropertiesSaving,
  metaTitle, metaSubtitle, metaArtist, metaGenre,
  metaMusic, metaBanner, metaBackground, metaOffset,
  metaSampleStart, metaSampleLength, metaSaving,
  allCharts, activeChartIndex,
  hasSelection, activeChart,
  scrollbarThumbRatio, scrollbarThumbTop,
  editorRoutineLayer,
} = s;

// Shorthand refs used in template
const {
  goBack, togglePlayback, undo, redo,
  selectAll, clearSelection, copySelection, cutSelection, pasteSelection,
  deleteSelection, flipHorizontal, flipVertical, flipDiagonal,
  addBeatShiftNotesDown, deleteBeatShiftNotesUp, canDeleteBeatShiftNotesUp,
  saveToFile, saveMetadata, exportCurrentChartAsSm, importSmAsNewChart,
  handleCanvasClick, handleMouseDown, handleRightClick, handleScroll,
  handleScrollbarTrackPointerDown, handleScrollbarThumbPointerDown, handleScrollbarThumbPointerMove, handleScrollbarThumbPointerUp,
  nudgeScrollbarBy,
  switchChart, createNewChart, duplicateCurrentChart, performDeleteCurrentChart, applyChartProperties,
  addBpmChangeFromInput, updateBpmChange, deleteBpmChange,
  commitBpmEdit, cancelBpmEdit,
  startEditingOffset, commitOffsetChange, cancelOffsetEdit, onOffsetValueChanged,
  startEditingChartMeter, commitChartMeterChange, cancelChartMeterEdit, onChartMeterValueChanged,
  startEditingSampleStart, commitSampleStartChange, cancelSampleStartEdit, onSampleStartValueChanged,
  startEditingSampleLength, commitSampleLengthChange, cancelSampleLengthEdit, onSampleLengthValueChanged,
  getBpmAtBeat, loadAllCharts,
  handleMouseMove, handleMouseUp, handleKeyDown,
  previewPlay,
  loadWaveformData,
  reseedUndoStackAfterHydrate,
} = actions;

const showDeleteChartModal = ref(false);
const showExportSmConfirm = ref(false);
const showImportSmConfirm = ref(false);

const {
  showBackupRestoreModal,
  showUnsavedExitModal,
  onAfterEditorSnapshotReady,
  onBackupRestoreLoad,
  onBackupRestoreUseDisk,
  installEditorBackGuard,
  uninstallEditorBackGuard,
  onUnsavedSaveAndLeave,
  onUnsavedDiscardAndLeave,
  onUnsavedStashAndLeave,
  onUnsavedCancel,
  disposeDraftGuard,
} = useEditorDraftGuard({
  s,
  canvas,
  reseedUndoStackAfterHydrate,
  saveToFile,
  saveMetadata,
});

function bindEditorEntryOverlayHandlers() {
  blockingOverlay.patchHandlers({
    onCancel: () => {
      session.clearEditorEntryPrime();
      blockingOverlay.hide();
      goBack();
    },
    onRetry: () => {
      void enterEditor();
    },
  });
}

// Keep editorRate watcher — reset relative sync after rate change
watch(editorRate, (rate) => {
  if (!playing.value) return;
  const t = canvas.beatToTime(scrollBeat.value);
  s.playStartChartSec.value = t;
  s.editorPlaybackWallStartMs.value = performance.now();
  api.audioGetTime()
    .then((currentAudioPos) => {
      s.audioSeekBase.value = currentAudioPos ?? s.audioSeekBase.value;
      return api.audioSetRate(rate);
    })
    .catch((e) => logDebug("Optional", "editor.watch.editorRate.audio", e));
});

// Inline BPM editor positioning
const bpmInlineInput = ref<HTMLInputElement | null>(null);
const bpmEditorStyle = computed(() => {
  const idx = editingBpmChangeIndex.value;
  if (idx < 0 || idx >= bpmChanges.value.length || !canvasRef.value) return {};
  const change = bpmChanges.value[idx];
  const cy = canvas.beatToY(change.beat);
  const fieldX = canvas.getCanvasFieldX();
  const fieldW = s.FIELD_WIDTH.value;
  return {
    top: `${cy - 14}px`,
    left: `${fieldX + fieldW + 10}px`,
  };
});

function translateChartDifficulty(d: string): string {
  const key = `difficulty.${d}`;
  const tr = t(key);
  return tr === key ? d : tr;
}

const newChartModalStepsOptions = computed(() =>
  STEPS_TYPES.map((st) => ({
    value: st.value,
    label: t(st.labelKey),
  })),
);

const newChartModalDifficultyOptions = computed(() =>
  DIFFICULTIES.map((d) => ({
    value: d,
    label: translateChartDifficulty(d),
  })),
);

function translateChartStepsType(st: string): string {
  const key = `stepsType.${st}`;
  const tr = t(key);
  return tr === key ? st : tr;
}

async function onDeleteChartConfirmed() {
  await performDeleteCurrentChart();
}

function openExportSmConfirm() {
  showExportSmConfirm.value = true;
}

function onExportSmCancel() {
  showExportSmConfirm.value = false;
}

function onExportSmConfirm() {
  showExportSmConfirm.value = false;
  void exportCurrentChartAsSm();
}

function openImportSmConfirm() {
  showImportSmConfirm.value = true;
}

function onImportSmCancel() {
  showImportSmConfirm.value = false;
}

function onImportSmConfirm() {
  showImportSmConfirm.value = false;
  void importSmAsNewChart();
}

function stepsTypePropertyLabel(st: string): string {
  const row = STEPS_TYPES.find((o) => o.value === st);
  return row ? t(row.labelKey) : translateChartStepsType(st);
}

/** 谱面属性里与新建谱面一致，仅三种 pump 模式；非支持类型时保留当前值一项以免下拉空白。 */
const chartStepsTypeSelectOptions = computed((): string[] => {
  const allowed: string[] = STEPS_TYPES.map((s) => s.value);
  const allowedSet = new Set<string>(allowed);
  const cur = activeChart.value?.stepsType;
  if (cur && !allowedSet.has(cur)) {
    return [cur, ...allowed];
  }
  return allowed;
});

// Auto-focus the inline BPM input when it appears
watch(editingBpmChangeIndex, (idx) => {
  if (idx >= 0) {
    nextTick(() => bpmInlineInput.value?.focus());
  }
});

async function enterEditor() {
  const audioPrimed = session.editorEntryAudioPrimed;
  const started = performance.now();

  if (!blockingOverlay.open) {
    blockingOverlay.show({
      message: t("loadingPhase.preparing"),
      onCancel: () => {
        session.clearEditorEntryPrime();
        blockingOverlay.hide();
        goBack();
      },
      onRetry: () => {
        void enterEditor();
      },
    });
  } else {
    blockingOverlay.clearError();
    bindEditorEntryOverlayHandlers();
  }

  try {
    if (!audioPrimed) {
      blockingOverlay.updateMessage(t("loadingPhase.preparing"));
      await player.stopForGame();
      await api.audioStop().catch((e) => logDebug("Optional", "editor.enter.audioStop", e));
      await api.audioSetRate(1.0).catch((e) => logDebug("Optional", "editor.enter.audioSetRate", e));

      blockingOverlay.updateMessage(t("loadingPhase.audio"));
      await player.waitForLoadComplete(10000);
      if (player.status === "loading") {
        throw new Error("Audio load timeout");
      }
    }

    const songPath = session.currentSong?.path;
    blockingOverlay.updateMessage(t("loadingPhase.editorCharts"));
    await loadAllCharts(songPath);

    blockingOverlay.updateMessage(t("loadingPhase.editorAudio"));
    if (session.currentSong) {
      if (!audioPrimed) {
        const musicPath = await api.getSongMusicPath(session.currentSong.path);
        await api.audioLoad(musicPath);
      }
      session.editorEntryAudioPrimed = false;
    }

    canvas.initCanvas();
    loadWaveformData(session.currentSong?.path).catch((e) => logDebug("Optional", "editor.enter.loadWaveform", e));
  } catch (e: unknown) {
    session.clearEditorEntryPrime();
    blockingOverlay.setFailed(t("loadingOverlay.failed"), () => {
      void retryEditorEnter();
    });
    logError("Editor", e);
  } finally {
    if (!audioPrimed) {
      await ensureMinElapsed(started, 1500);
    }
    if (!blockingOverlay.error) {
      blockingOverlay.hide();
    }
  }
}

function retryEditorEnter() {
  session.clearEditorEntryPrime();
  blockingOverlay.clearError();
  bindEditorEntryOverlayHandlers();
  blockingOverlay.updateMessage(t("loadingPhase.preparing"));
  void enterEditor();
}

function onToolbarSelectKeydown(e: KeyboardEvent) {
  if (shortcutMatches(e, "editor.playPause")) {
    e.preventDefault();
    togglePlayback();
  }
}

const editorToolbarRef = ref<InstanceType<typeof EditorToolbar> | null>(null);
const editorStatusBarRef = ref<InstanceType<typeof EditorStatusBar> | null>(null);

function handleEditorWindowResize() {
  canvas.resizeCanvas();
  const bounds = canvas.getWaveformPanelOffsetBounds();
  s.waveformPanelOffsetX.value = Math.max(bounds.min, Math.min(bounds.max, s.waveformPanelOffsetX.value));
}

/** After preview/gameplay: same chart in memory, only reset IPC audio + canvas loop. */
async function resumeEditorLight() {
  s.playing.value = false;
  try {
    await player.stopForGame();
    await api.audioStop().catch((e) => logDebug("Optional", "editor.resumeLight.audioStop", e));
    await api.audioSetRate(1.0).catch((e) => logDebug("Optional", "editor.resumeLight.audioSetRate1", e));

    await player.waitForLoadComplete(10000);
    if (player.status === "loading") {
      await enterEditor();
      return;
    }

    if (session.currentSong) {
      const musicPath = await api.getSongMusicPath(session.currentSong.path);
      await api.audioLoad(musicPath);
      await api.audioSetRate(s.editorRate.value).catch((e) => logDebug("Optional", "editor.resumeLight.audioSetRateEditor", e));
    }

    await nextTick();
    canvas.resizeCanvas();
    canvas.initCanvas();
  } catch (e: unknown) {
    logError("Editor", e);
    await enterEditor();
  }
}

async function handleEditorActivate() {
  if (session.editorWarmResume) {
    session.editorWarmResume = false;
    await resumeEditorLight();
    return;
  }
  await enterEditor();
}

useEditorScreenLifecycle({
  s,
  canvas,
  editorToolbarRef,
  editorStatusBarRef,
  installEditorBackGuard,
  uninstallEditorBackGuard,
  disposeDraftGuard,
  onAfterEditorSnapshotReady,
  handleEditorWindowResize,
  handleKeyDown,
  handleMouseMove,
  handleMouseUp,
  handleEditorActivate,
});
</script>

<template>
  <div class="editor-screen" :style="{ transform: `scale(${settings.uiScale})`, transformOrigin: 'top left', width: `${100 / settings.uiScale}%`, height: `${100 / settings.uiScale}%` }">
    <EditorToolbar
      ref="editorToolbarRef"
      v-model:quantize="quantize"
      v-model:editor-rate="editorRate"
      v-model:show-beat-lines="showBeatLines"
      v-model:show-track-grid="showTrackGrid"
      v-model:current-note-type="currentNoteType"
      v-model:editor-routine-layer="editorRoutineLayer"
      :song-title="session.currentSong?.title ?? ''"
      :rhythm-sfx-enabled="settings.rhythmSfxEnabled"
      :metronome-sfx-enabled="settings.metronomeSfxEnabled"
      :editor-toolbar-editing-enabled="editorToolbarEditingEnabled"
      :playing="playing"
      :can-delete-beat="canDeleteBeatShiftNotesUp()"
      :is-pump-routine-chart="isPumpRoutineChart"
      :routine-p1-accent="routineP1Accent"
      :routine-p2-accent="routineP2Accent"
      :saving="saving"
      :undo-stack-length="undoStack.length"
      :redo-stack-length="redoStack.length"
      :has-selection="hasSelection"
      :clipboard-len="clipboard.length"
      :clipboard-bpm-len="clipboardBpmChanges.length"
      :shortcut-hint="sc"
      @go-back="goBack"
      @select-all="selectAll"
      @clear-selection="clearSelection"
      @copy="copySelection"
      @cut="cutSelection"
      @paste="pasteSelection"
      @delete="deleteSelection"
      @flip-h="flipHorizontal"
      @flip-v="flipVertical"
      @flip-d="flipDiagonal"
      @toggle-playback="togglePlayback"
      @preview-play="previewPlay"
      @toggle-rhythm-sfx="toggleRhythmSfx"
      @toggle-metronome-sfx="toggleMetronomeSfx"
      @undo="undo"
      @redo="redo"
      @save="saveToFile"
      @add-beat="addBeatShiftNotesDown"
      @delete-beat="deleteBeatShiftNotesUp"
      @toolbar-select-keydown="onToolbarSelectKeydown"
    />

    <div class="editor-body">
      <!-- Canvas + scrollbar -->
      <div class="editor-canvas-wrap">
        <canvas
          ref="canvasRef"
          class="editor-canvas"
          :class="{ 'editor-canvas--inactive': !editorToolbarEditingEnabled }"
          @click="handleCanvasClick"
          @mousedown="handleMouseDown"
          @contextmenu="handleRightClick"
          @wheel="handleScroll"
        />
        <div
          v-if="!editorToolbarEditingEnabled"
          class="editor-empty-overlay"
          aria-live="polite"
        >
          <p class="editor-empty-title">{{ t('editor.noChartsTitle') }}</p>
          <p class="editor-empty-hint">{{ t('editor.noChartsHint') }}</p>
        </div>
        <!-- Inline BPM editor overlay (anchored to canvas) -->
        <div v-if="editingBpmChangeIndex >= 0" class="bpm-inline-editor"
          :style="bpmEditorStyle"
          @click.stop @mousedown.stop>
          <label class="bpm-inline-label">{{ t('editor.placeholderBpm') }}</label>
          <input
            ref="bpmInlineInput"
            v-model="editingBpmInputValue"
            type="text"
            inputmode="decimal"
            class="bpm-inline-input"
            @keydown.enter="commitBpmEdit"
            @keydown.escape="cancelBpmEdit" />
          <button type="button" class="bpm-inline-ok" @click="commitBpmEdit">✓</button>
          <button type="button" class="bpm-inline-cancel" @click="cancelBpmEdit">✕</button>
        </div>
        <!-- Custom scrollbar -->
        <div
          class="editor-scrollbar"
          :class="{ 'editor-scrollbar--inactive': !editorToolbarEditingEnabled }"
          @dragstart.prevent
        >
          <button type="button" class="editor-scrollbar-arrow editor-scrollbar-arrow--up" @click="nudgeScrollbarBy(-1)">▲</button>
          <div class="scrollbar-track" @pointerdown="handleScrollbarTrackPointerDown">
            <div class="scrollbar-thumb"
              :style="{
                top: scrollbarThumbTop * 100 + '%',
                height: Math.max(scrollbarThumbRatio * 100, 3) + '%'
              }"
              @pointerdown="handleScrollbarThumbPointerDown"
              @pointermove="handleScrollbarThumbPointerMove"
              @pointerup="handleScrollbarThumbPointerUp"
              @pointercancel="handleScrollbarThumbPointerUp"
            />
          </div>
          <button type="button" class="editor-scrollbar-arrow editor-scrollbar-arrow--down" @click="nudgeScrollbarBy(1)">▼</button>
        </div>
      </div>

      <EditorSidebar
        v-model:sidebar-tab="sidebarTab"
        v-model:edit-chart-steps-type="editChartStepsType"
        v-model:edit-chart-difficulty="editChartDifficulty"
        v-model:edit-chart-meter="editChartMeter"
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
        v-model:new-bpm-beat="newBpmBeat"
        v-model:new-bpm-value="newBpmValue"
        :all-charts="allCharts"
        :active-chart-index="activeChartIndex"
        :active-chart="activeChart"
        :chart-steps-type-options="chartStepsTypeSelectOptions"
        :chart-properties-saving="chartPropertiesSaving"
        :meta-saving="metaSaving"
        :saving="saving"
        :hold-start-row="holdStartRow"
        :bpm-changes="bpmChanges"
        :note-stat-total-count="noteStatTotalCount"
        :note-stat-tap-count="noteStatTapCount"
        :note-stat-hold-count="noteStatHoldCount"
        :note-stats-donut-style="noteStatsDonutStyle"
        :note-stats-tap-pct="noteStatsTapPct"
        :note-stats-hold-pct="noteStatsHoldPct"
        :translate-chart-difficulty="translateChartDifficulty"
        :translate-chart-steps-type="translateChartStepsType"
        :steps-type-property-label="stepsTypePropertyLabel"
        @switch-chart="switchChart"
        @open-new-chart="showNewChartModal = true"
        @duplicate-chart="duplicateCurrentChart"
        @open-delete-chart="showDeleteChartModal = true"
        @export-chart-sm="openExportSmConfirm"
        @import-chart-sm="openImportSmConfirm"
        @apply-chart-properties="applyChartProperties"
        @start-meter-edit="startEditingChartMeter"
        @meter-value-changed="onChartMeterValueChanged"
        @commit-meter-edit="commitChartMeterChange"
        @cancel-meter-edit="cancelChartMeterEdit"
        @save-metadata="saveMetadata"
        @update-bpm-change="(i, b) => updateBpmChange(i, b)"
        @delete-bpm-change="deleteBpmChange"
        @add-bpm-change="addBpmChangeFromInput"
        @start-offset-edit="startEditingOffset"
        @offset-value-changed="onOffsetValueChanged"
        @commit-offset-edit="commitOffsetChange"
        @cancel-offset-edit="cancelOffsetEdit"
        @start-sample-start-edit="startEditingSampleStart"
        @sample-start-value-changed="onSampleStartValueChanged"
        @commit-sample-start-edit="commitSampleStartChange"
        @cancel-sample-start-edit="cancelSampleStartEdit"
        @start-sample-length-edit="startEditingSampleLength"
        @sample-length-value-changed="onSampleLengthValueChanged"
        @commit-sample-length-edit="commitSampleLengthChange"
        @cancel-sample-length-edit="cancelSampleLengthEdit"
      />
    </div>

    <!-- Toast -->
    <div v-if="saveMessage" class="save-toast" :class="{ error: saveMessage.includes('failed') || saveMessage.includes('\u5931\u8D25') || saveMessage.includes('Error') }">
      {{ saveMessage }}
    </div>

    <EditorPromptModals
      :show-backup-restore="showBackupRestoreModal"
      :show-unsaved-exit="showUnsavedExitModal"
      :show-export-sm-confirm="showExportSmConfirm"
      :show-import-sm-confirm="showImportSmConfirm"
      @backup-use-disk="onBackupRestoreUseDisk"
      @backup-load="onBackupRestoreLoad"
      @unsaved-cancel="onUnsavedCancel"
      @unsaved-discard="onUnsavedDiscardAndLeave"
      @unsaved-stash="onUnsavedStashAndLeave"
      @unsaved-save="onUnsavedSaveAndLeave"
      @export-sm-cancel="onExportSmCancel"
      @export-sm-confirm="onExportSmConfirm"
      @import-sm-cancel="onImportSmCancel"
      @import-sm-confirm="onImportSmConfirm"
    />

    <EditorScreenChartModals
      v-model:show-delete-chart-modal="showDeleteChartModal"
      v-model:show-new-chart-modal="showNewChartModal"
      v-model:new-chart-steps-type="newChartStepsType"
      v-model:new-chart-difficulty="newChartDifficulty"
      v-model:new-chart-meter="newChartMeter"
      :new-chart-modal-steps-options="newChartModalStepsOptions"
      :new-chart-modal-difficulty-options="newChartModalDifficultyOptions"
      @confirm-delete="onDeleteChartConfirmed"
      @create-new-chart="() => void createNewChart()"
    />

    <EditorStatusBar
      ref="editorStatusBarRef"
      :scroll-beat="scrollBeat"
      :bpm-at-beat="getBpmAtBeat(scrollBeat)"
      :zoom="zoom"
      :editor-rate="editorRate"
      :active-chart="activeChart"
      :editor-toolbar-editing-enabled="editorToolbarEditingEnabled"
      :translate-chart-steps-type="translateChartStepsType"
      :translate-chart-difficulty="translateChartDifficulty"
    />
  </div>
</template>

<style src="./editor/editorTrackScrollbar.css"></style>
<style scoped>
.editor-screen {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color, #08080f);
  color: var(--text-color, #fff);
  /* Toolbar: icon row height fixed; horizontal bar sits in padding below icons (does not shrink buttons). */
  --editor-hscrollbar-thick: 4px;
  --editor-canvas-scrollbar-w: 9px;
  --editor-canvas-scrollbar-arrow-h: 12px;
  --editor-toolbar-icons-h: 42px;
  --editor-toolbar-track-pad-y: 6px;
  --editor-toolbar-hscroll-pad: 10px;
  --editor-toolbar-band-h: 58px;
  --editor-status-row-min-h: 22px;
  --editor-status-pad-y: 5px;
  --editor-status-hscroll-pad: 10px;
  --editor-status-band-h: 42px;
  /* 与 `.sidebar-right` 同宽，顶栏歌名区与右侧信息栏垂直对齐 */
  --editor-sidebar-width: 280px;
  --editor-toolbar-icon-size: 0.85rem;
  --editor-toolbar-icon-btn: 30px;
}

/* ===== Editor Body ===== */
.editor-body { flex: 1; display: flex; overflow: hidden; padding-top: 4px; background: var(--bg-color); }

/* ===== Canvas + Scrollbar ===== */
.editor-canvas-wrap { flex: 1; position: relative; overflow: hidden; display: flex; }
.editor-canvas {
  flex: 1;
  width: 0;
  min-width: 0;
  height: 100%;
  display: block;
  cursor: crosshair;
  background-color: var(--bg-color);
  background-image: radial-gradient(circle at top, color-mix(in srgb, var(--primary-color) 6%, transparent), transparent 28%);
}
.editor-canvas--inactive { pointer-events: none; cursor: default !important; }
.editor-empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.5rem;
  text-align: center;
  pointer-events: none;
  z-index: 2;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg-color) 82%, transparent) 0%,
    color-mix(in srgb, var(--bg-gradient-end) 90%, transparent) 100%
  );
}
.editor-empty-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-color);
  max-width: 22rem;
  line-height: 1.35;
}
.editor-empty-hint {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-muted);
  max-width: 22rem;
  line-height: 1.45;
}

/* ===== Shared button styles ===== */
.tool-btn {
  padding: 0.35rem 0.7rem; font-size: 0.8rem; font-weight: 600;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 5px; color: rgba(255,255,255,0.7); cursor: pointer;
  white-space: nowrap;
}
.tool-btn:hover { background: rgba(255,255,255,0.12); color: var(--text-color); }
.tool-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tool-btn.small { font-size: 0.7rem; padding: 0.25rem 0.5rem; }
.tool-btn.danger { border-color: rgba(255,23,68,0.3); color: #ff5252; }
.tool-btn.danger:hover { background: rgba(255,23,68,0.15); }
.tool-btn.accent { border-color: color-mix(in srgb, var(--primary-color) 30%, transparent); color: color-mix(in srgb, var(--primary-color-hover) 70%, var(--text-color)); }
.tool-btn.accent:hover { background: color-mix(in srgb, var(--primary-color) 15%, transparent); }
.save-btn { background: rgba(0,230,118,0.08); border-color: rgba(0,230,118,0.2); color: #00e676; }
.save-btn:hover { background: rgba(0,230,118,0.15); }

/* ===== Toast ===== */
.save-toast {
  position: fixed; top: 60px; right: 20px; z-index: 100;
  padding: 0.5rem 1rem; border-radius: 6px;
  background: rgba(0,230,118,0.15); border: 1px solid rgba(0,230,118,0.3);
  color: #00e676; font-size: 0.85rem; font-weight: 600;
  animation: slideIn 0.2s ease;
}
.save-toast.error { background: rgba(255,23,68,0.15); border-color: rgba(255,23,68,0.3); color: #ff1744; }
@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

/* ===== Inline BPM Editor ===== */
.bpm-inline-editor {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 20;
  background: rgba(20, 16, 36, 0.96);
  border: 1px solid rgba(255, 171, 0, 0.5);
  border-radius: 6px;
  padding: 3px 6px;
  box-shadow: 0 4px 18px rgba(0,0,0,0.5);
}
.bpm-inline-label {
  font-size: 10px;
  font-weight: bold;
  color: #ffab00;
  letter-spacing: 0.05em;
  user-select: none;
}
.bpm-inline-input {
  width: 72px;
  padding: 2px 5px;
  border: 1px solid rgba(255,171,0,0.3);
  border-radius: 4px;
  background: rgba(255,255,255,0.06);
  color: var(--text-color);
  font-size: 12px;
  font-family: monospace;
  outline: none;
}
.bpm-inline-input:focus {
  border-color: #ffab00;
}
.bpm-inline-ok, .bpm-inline-cancel {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 4px;
  font-size: 13px; cursor: pointer;
  padding: 0;
}
.bpm-inline-ok {
  background: rgba(255,171,0,0.25);
  color: #ffab00;
}
.bpm-inline-ok:hover { background: rgba(255,171,0,0.45); }
.bpm-inline-cancel {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.5);
}
.bpm-inline-cancel:hover { background: rgba(255,255,255,0.15); }
</style>
