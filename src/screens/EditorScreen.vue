<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useGameStore } from "@/stores/game";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { useI18n } from "@/i18n";
import * as api from "@/utils/api";
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
import { ensureMinElapsed } from "@/utils/loadingGate";
import { useBlockingOverlayStore } from "@/stores/blockingOverlay";
import { setMetronomeSfxEnabled, setRhythmSfxEnabled } from "@/utils/sfx";
import { routineColorHex } from "@/constants/routinePlayerColors";
import { logOptionalRejection } from "@/utils/devLog";
import TwoStepDangerModal from "@/components/TwoStepDangerModal.vue";
import BaseModal from "@/components/BaseModal.vue";
import CustomSelect from "@/components/CustomSelect.vue";
import AppNumberField from "@/components/AppNumberField.vue";
import type { EditorChartBackupStored } from "@/utils/editorChartBackup";
import {
  applyEditorChartBackupToState,
  clearEditorChartBackup,
  editorBackupMatchesDisk,
  readEditorChartBackup,
  writeEditorChartBackup,
  serializeEditorChartPersist,
  serializeEditorMetaPersist,
} from "@/utils/editorChartBackup";
import { defaultQuantizeFromTimeSignatures } from "./editor/quantizeFromTimeSignature";
import { formatBinding, mergeShortcutBindings } from "@/engine/keyBindings";
import type { ShortcutId } from "@/engine/keyBindings";

defineOptions({ name: "EditorScreen" });

const route = useRoute();
const game = useGameStore();
const player = usePlayerStore();
const session = useSessionStore();
const blockingOverlay = useBlockingOverlayStore();
const { t } = useI18n();

const s = useEditorState();
const canvas = useEditorCanvas(s);
const actions = useEditorActions(s, canvas, route);

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

const isPumpRoutineChart = computed(() => activeChart.value?.stepsType === "pump-routine");
const routineP1Accent = computed(() => routineColorHex(game.routineP1ColorId) ?? "#00bfff");
const routineP2Accent = computed(() => routineColorHex(game.routineP2ColorId) ?? "#ff4444");

const NOTE_STATS_TAP_COLOR = "#4fc3f7";
const NOTE_STATS_HOLD_COLOR = "#ffb74d";

const noteStatsTapPct = computed(() => {
  const tot = noteStatTotalCount.value;
  if (tot <= 0) return 0;
  return Math.round((noteStatTapCount.value / tot) * 1000) / 10;
});

const noteStatsHoldPct = computed(() => {
  const tot = noteStatTotalCount.value;
  if (tot <= 0) return 0;
  return Math.round((noteStatHoldCount.value / tot) * 1000) / 10;
});

/** Top toolbar editing controls (note tools, playback, save, etc.); back / new chart stay enabled. */
const editorToolbarEditingEnabled = computed(() => allCharts.value.length > 0);

const noteStatsDonutStyle = computed(() => {
  const tot = noteStatTotalCount.value;
  if (tot <= 0) {
    return { background: "conic-gradient(rgba(255,255,255,0.12) 0deg 360deg)" };
  }
  const tapDeg = (noteStatTapCount.value / tot) * 360;
  return {
    background: `conic-gradient(${NOTE_STATS_TAP_COLOR} 0deg ${tapDeg}deg, ${NOTE_STATS_HOLD_COLOR} ${tapDeg}deg 360deg)`,
  };
});

/** Get formatted shortcut string for display in button titles */
function sc(id: ShortcutId): string {
  const binding = mergeShortcutBindings(game.shortcutOverrides)[id];
  const formatted = formatBinding(binding);
  return formatted ? ` (${formatted})` : "";
}

function toggleRhythmSfx() {
  game.rhythmSfxEnabled = !game.rhythmSfxEnabled;
}

function toggleMetronomeSfx() {
  game.metronomeSfxEnabled = !game.metronomeSfxEnabled;
}

watch(
  () => [game.metronomeSfxEnabled, game.rhythmSfxEnabled] as const,
  ([metronomeEnabled, rhythmEnabled]) => {
    setMetronomeSfxEnabled(metronomeEnabled ?? false);
    setRhythmSfxEnabled(rhythmEnabled ?? true);
  },
  { immediate: true },
);

// Shorthand refs used in template
const {
  goBack, togglePlayback, undo, redo,
  selectAll, clearSelection, copySelection, cutSelection, pasteSelection,
  deleteSelection, flipHorizontal, flipVertical, flipDiagonal,
  addBeatShiftNotesDown, deleteBeatShiftNotesUp, canDeleteBeatShiftNotesUp,
  saveToFile, saveMetadata,
  handleCanvasClick, handleMouseDown, handleRightClick, handleScroll,
  handleScrollbarMouseDown,
  switchChart, createNewChart, duplicateCurrentChart, performDeleteCurrentChart, applyChartProperties,
  addBpmChangeFromInput, updateBpmChange, deleteBpmChange,
  commitBpmEdit, cancelBpmEdit,
  getBpmAtBeat, loadAllCharts,
  handleMouseMove, handleMouseUp, handleKeyDown,
  previewPlay,
  loadWaveformData,
  reseedUndoStackAfterHydrate,
} = actions;

const showDeleteChartModal = ref(false);

// --- Crash backup + unsaved exit (disk baselines live on `s`) ---
const draftChartSerialized = ref("");
const draftMetaSerialized = ref("");
const showBackupRestoreModal = ref(false);
const pendingBackupForModal = ref<EditorChartBackupStored | null>(null);
const showUnsavedExitModal = ref(false);
let unsavedExitResolve: ((v: boolean) => void) | null = null;

function bumpDraftFromState() {
  draftChartSerialized.value = serializeEditorChartPersist(s);
  draftMetaSerialized.value = serializeEditorMetaPersist(s);
}

function syncDraftToDiskBaselines() {
  draftChartSerialized.value = s.editorChartBaselineSerialized.value;
  draftMetaSerialized.value = s.editorMetaBaselineSerialized.value;
}

const isChartDirty = computed(() => draftChartSerialized.value !== s.editorChartBaselineSerialized.value);
const isMetaDirty = computed(() => draftMetaSerialized.value !== s.editorMetaBaselineSerialized.value);
const isDirty = computed(() => isChartDirty.value || isMetaDirty.value);

let backupDebounce: ReturnType<typeof setTimeout> | null = null;
function scheduleBackupWrite() {
  if (backupDebounce !== null) clearTimeout(backupDebounce);
  backupDebounce = setTimeout(() => {
    backupDebounce = null;
    bumpDraftFromState();
    const song = game.currentSong;
    if (!song || s.allCharts.value.length === 0) return;
    if (!isDirty.value) {
      clearEditorChartBackup(song.path, s.activeChartIndex.value);
      return;
    }
    writeEditorChartBackup(s, song.path, s.activeChartIndex.value);
  }, 600);
}

watch(
  [
    () => s.noteRows.value,
    () => s.bpmChanges.value,
    () => s.timeSignatures.value,
    () => s.tickcounts.value,
    () => s.comboChanges.value,
    () => s.speedChanges.value,
    () => s.scrollChanges.value,
    () => s.labelChanges.value,
    () => s.editChartStepsType.value,
    () => s.editChartDifficulty.value,
    () => s.editChartMeter.value,
    () => s.metaTitle.value,
    () => s.metaSubtitle.value,
    () => s.metaArtist.value,
    () => s.metaGenre.value,
    () => s.metaMusic.value,
    () => s.metaBanner.value,
    () => s.metaBackground.value,
    () => s.metaSampleStart.value,
    () => s.metaSampleLength.value,
    () => s.metaOffset.value,
    () => s.scrollBeat.value,
    () => s.zoom.value,
    () => s.quantize.value,
    () => s.showBeatLines.value,
    () => s.editorRoutineLayer.value,
  ],
  () => {
    scheduleBackupWrite();
  },
  { deep: true },
);

function offerBackupDraftIfNeeded() {
  const song = game.currentSong;
  if (!song || s.allCharts.value.length === 0) return;
  const idx = s.activeChartIndex.value;
  const backup = readEditorChartBackup(song.path, idx);
  if (!backup) return;
  if (
    editorBackupMatchesDisk(backup, s.editorChartBaselineSerialized.value, s.editorMetaBaselineSerialized.value)
  ) {
    clearEditorChartBackup(song.path, idx);
    return;
  }
  pendingBackupForModal.value = backup;
  showBackupRestoreModal.value = true;
}

function onAfterEditorSnapshotReady() {
  syncDraftToDiskBaselines();
  offerBackupDraftIfNeeded();
}

function onBackupRestoreLoad() {
  const song = game.currentSong;
  const b = pendingBackupForModal.value;
  if (!song || !b) {
    showBackupRestoreModal.value = false;
    return;
  }
  applyEditorChartBackupToState(s, b);
  s.quantize.value = defaultQuantizeFromTimeSignatures(s.timeSignatures.value);
  reseedUndoStackAfterHydrate();
  bumpDraftFromState();
  showBackupRestoreModal.value = false;
  pendingBackupForModal.value = null;
  void nextTick(() => {
    canvas.resizeCanvas();
  });
}

function onBackupRestoreUseDisk() {
  const song = game.currentSong;
  if (song) clearEditorChartBackup(song.path, s.activeChartIndex.value);
  showBackupRestoreModal.value = false;
  pendingBackupForModal.value = null;
}

function installEditorBackGuard() {
  game.setEditorBackGuard(async () => {
    if (!isDirty.value) return true;
    return await new Promise<boolean>((resolve) => {
      unsavedExitResolve = resolve;
      showUnsavedExitModal.value = true;
    });
  });
}

function uninstallEditorBackGuard() {
  game.setEditorBackGuard(null);
  if (unsavedExitResolve) {
    unsavedExitResolve(false);
    unsavedExitResolve = null;
  }
  showUnsavedExitModal.value = false;
}

async function onUnsavedSaveAndLeave() {
  const song = game.currentSong;
  if (!song) return;
  if (isChartDirty.value) {
    const chartOk = await saveToFile();
    if (!chartOk) return;
  }
  if (isMetaDirty.value) {
    const metaOk = await saveMetadata();
    if (!metaOk) return;
  }
  clearEditorChartBackup(song.path, s.activeChartIndex.value);
  bumpDraftFromState();
  showUnsavedExitModal.value = false;
  const r = unsavedExitResolve;
  unsavedExitResolve = null;
  r?.(true);
}

function onUnsavedDiscardAndLeave() {
  const song = game.currentSong;
  if (song) clearEditorChartBackup(song.path, s.activeChartIndex.value);
  showUnsavedExitModal.value = false;
  const r = unsavedExitResolve;
  unsavedExitResolve = null;
  r?.(true);
}

/** Exit without writing SM/SSC; force current editor state into localStorage backup for next session. */
function onUnsavedStashAndLeave() {
  const song = game.currentSong;
  if (!song || s.allCharts.value.length === 0) {
    showUnsavedExitModal.value = false;
    const r = unsavedExitResolve;
    unsavedExitResolve = null;
    r?.(true);
    return;
  }
  writeEditorChartBackup(s, song.path, s.activeChartIndex.value);
  showUnsavedExitModal.value = false;
  const r = unsavedExitResolve;
  unsavedExitResolve = null;
  r?.(true);
}

function onUnsavedCancel() {
  showUnsavedExitModal.value = false;
  const r = unsavedExitResolve;
  unsavedExitResolve = null;
  r?.(false);
}

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
    .catch((e) => logOptionalRejection("editor.watch.editorRate.audio", e));
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
    label: String(t(st.labelKey)),
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

function stepsTypePropertyLabel(st: string): string {
  const row = STEPS_TYPES.find((o) => o.value === st);
  return row ? String(t(row.labelKey)) : translateChartStepsType(st);
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
      await api.audioStop().catch((e) => logOptionalRejection("editor.enter.audioStop", e));
      await api.audioSetRate(1.0).catch((e) => logOptionalRejection("editor.enter.audioSetRate", e));

      blockingOverlay.updateMessage(t("loadingPhase.audio"));
      await player.waitForLoadComplete(10000);
      if (player.status === "loading") {
        throw new Error("Audio load timeout");
      }
    }

    const songPath = game.currentSong?.path;
    blockingOverlay.updateMessage(t("loadingPhase.editorCharts"));
    await loadAllCharts(songPath);

    blockingOverlay.updateMessage(t("loadingPhase.editorAudio"));
    if (game.currentSong) {
      if (!audioPrimed) {
        const musicPath = await api.getSongMusicPath(game.currentSong.path);
        await api.audioLoad(musicPath);
      }
      session.editorEntryAudioPrimed = false;
    }

    canvas.initCanvas();
    loadWaveformData(game.currentSong?.path).catch((e) => logOptionalRejection("editor.enter.loadWaveform", e));
  } catch (e: unknown) {
    session.clearEditorEntryPrime();
    blockingOverlay.setFailed(t("loadingOverlay.failed"), () => {
      void retryEditorEnter();
    });
    console.error(e);
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
  if (game.shortcutMatches(e, "editor.playPause")) {
    e.preventDefault();
    togglePlayback();
  }
}

const editorToolbarRef = ref<InstanceType<typeof EditorToolbar> | null>(null);
const editorStatusBarRef = ref<InstanceType<typeof EditorStatusBar> | null>(null);
let editorHorizontalWheelCleanups: Array<() => void> = [];

/** Vertical wheel (or horizontal trackpad delta) scrolls these strips sideways; needs non-passive listener. */
function editorHorizontalWheelOnEl(el: HTMLElement, e: WheelEvent) {
  if (el.scrollWidth <= el.clientWidth + 1) return;
  const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (raw === 0) return;
  let px = raw;
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) px *= 16;
  else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) px *= el.clientWidth;
  e.preventDefault();
  el.scrollLeft += px;
}

function handleEditorWindowResize() {
  canvas.resizeCanvas();
  const bounds = canvas.getWaveformPanelOffsetBounds();
  s.waveformPanelOffsetX.value = Math.max(bounds.min, Math.min(bounds.max, s.waveformPanelOffsetX.value));
}

function attachWindowListeners() {
  window.addEventListener("resize", handleEditorWindowResize);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
}

function detachWindowListeners() {
  window.removeEventListener("resize", handleEditorWindowResize);
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseup", handleMouseUp);
}

/** After preview/gameplay: same chart in memory, only reset IPC audio + canvas loop. */
async function resumeEditorLight() {
  s.playing.value = false;
  try {
    await player.stopForGame();
    await api.audioStop().catch((e) => logOptionalRejection("editor.resumeLight.audioStop", e));
    await api.audioSetRate(1.0).catch((e) => logOptionalRejection("editor.resumeLight.audioSetRate1", e));

    await player.waitForLoadComplete(10000);
    if (player.status === "loading") {
      await enterEditor();
      return;
    }

    if (game.currentSong) {
      const musicPath = await api.getSongMusicPath(game.currentSong.path);
      await api.audioLoad(musicPath);
      await api.audioSetRate(s.editorRate.value).catch((e) => logOptionalRejection("editor.resumeLight.audioSetRateEditor", e));
    }

    await nextTick();
    canvas.resizeCanvas();
    canvas.initCanvas();
  } catch (e: unknown) {
    console.error(e);
    await enterEditor();
  }
}

async function handleEditorActivate() {
  if (game.editorWarmResume) {
    game.editorWarmResume = false;
    await resumeEditorLight();
    return;
  }
  await enterEditor();
}

onMounted(() => {
  s.afterChartNotesLoaded.value = onAfterEditorSnapshotReady;
  void nextTick(() => {
    const attach = (el: HTMLElement | null) => {
      if (!el) return;
      const fn = (e: WheelEvent) => editorHorizontalWheelOnEl(el, e);
      el.addEventListener("wheel", fn, { passive: false });
      editorHorizontalWheelCleanups.push(() => {
        el.removeEventListener("wheel", fn);
      });
    };
    attach(editorToolbarRef.value?.getScrollTrackEl() ?? null);
    attach(editorStatusBarRef.value?.getScrollTrackEl() ?? null);
  });
});

onActivated(() => {
  installEditorBackGuard();
  attachWindowListeners();
  void handleEditorActivate();
});

onDeactivated(() => {
  uninstallEditorBackGuard();
  s.playing.value = false;
  detachWindowListeners();
  canvas.destroyCanvas();
  api.audioStop().catch((e) => logOptionalRejection("editor.deactivate.audioStop", e));
  api.audioSetRate(1.0).catch((e) => logOptionalRejection("editor.deactivate.audioSetRate", e));
});

onUnmounted(() => {
  s.afterChartNotesLoaded.value = null;
  uninstallEditorBackGuard();
  editorHorizontalWheelCleanups.forEach((off) => off());
  editorHorizontalWheelCleanups = [];
  detachWindowListeners();
  canvas.destroyCanvas();
  api.audioStop().catch((e) => logOptionalRejection("editor.unmount.audioStop", e));
  api.audioSetRate(1.0).catch((e) => logOptionalRejection("editor.unmount.audioSetRate", e));
});
</script>

<template>
  <div class="editor-screen" :style="{ transform: `scale(${game.uiScale})`, transformOrigin: 'top left', width: `${100 / game.uiScale}%`, height: `${100 / game.uiScale}%` }">
    <EditorToolbar
      ref="editorToolbarRef"
      v-model:quantize="quantize"
      v-model:editor-rate="editorRate"
      v-model:show-beat-lines="showBeatLines"
      v-model:show-track-grid="showTrackGrid"
      v-model:current-note-type="currentNoteType"
      v-model:editor-routine-layer="editorRoutineLayer"
      :song-title="game.currentSong?.title ?? ''"
      :rhythm-sfx-enabled="game.rhythmSfxEnabled"
      :metronome-sfx-enabled="game.metronomeSfxEnabled"
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
            type="number" step="0.01" min="1"
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
          @mousedown="handleScrollbarMouseDown"
        >
          <div class="scrollbar-track">
            <div class="scrollbar-thumb"
              :style="{
                top: scrollbarThumbTop * 100 + '%',
                height: Math.max(scrollbarThumbRatio * 100, 3) + '%'
              }" />
          </div>
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
        @apply-chart-properties="applyChartProperties"
        @save-metadata="saveMetadata"
        @update-bpm-change="(i, b) => updateBpmChange(i, b)"
        @delete-bpm-change="deleteBpmChange"
        @add-bpm-change="addBpmChangeFromInput"
      />
    </div>

    <!-- Toast -->
    <div v-if="saveMessage" class="save-toast" :class="{ error: saveMessage.includes('failed') || saveMessage.includes('\u5931\u8D25') || saveMessage.includes('Error') }">
      {{ saveMessage }}
    </div>

    <EditorPromptModals
      :show-backup-restore="showBackupRestoreModal"
      :show-unsaved-exit="showUnsavedExitModal"
      @backup-use-disk="onBackupRestoreUseDisk"
      @backup-load="onBackupRestoreLoad"
      @unsaved-cancel="onUnsavedCancel"
      @unsaved-discard="onUnsavedDiscardAndLeave"
      @unsaved-stash="onUnsavedStashAndLeave"
      @unsaved-save="onUnsavedSaveAndLeave"
    />

    <TwoStepDangerModal
      v-model="showDeleteChartModal"
      :title="t('editor.deleteChartModalTitle')"
      :step1-message="t('editor.confirmDeleteStep1')"
      :step2-message="t('editor.confirmDeleteStep2')"
      :continue-label="t('continue')"
      :cancel-label="t('cancel')"
      :back-label="t('stepBack')"
      :confirm-label="t('editor.confirmDeleteAction')"
      @confirm="onDeleteChartConfirmed"
    />

    <BaseModal
      v-model="showNewChartModal"
      :title="t('editor.newChart')"
      width="min(400px, 92vw)"
    >
      <div class="form-modal-fields">
        <label class="form-modal-label">{{ t('editor.stepsType') }}</label>
        <CustomSelect v-model="newChartStepsType" variant="form" :options="newChartModalStepsOptions" />
        <label class="form-modal-label">{{ t('editor.difficulty') }}</label>
        <CustomSelect v-model="newChartDifficulty" variant="form" :options="newChartModalDifficultyOptions" />
        <label class="form-modal-label">{{ t('editor.meter') }}</label>
        <AppNumberField v-model="newChartMeter" input-class="form-modal-input" :min="1" :max="99" />
      </div>
      <template #footer>
        <div class="form-modal-footer-inner">
          <button type="button" class="form-modal-btn" @click="showNewChartModal = false">{{ t('cancel') }}</button>
          <button type="button" class="form-modal-btn form-modal-btn--primary" @click="createNewChart">{{ t('confirm') }}</button>
        </div>
      </template>
    </BaseModal>

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
.editor-scrollbar--inactive {
  opacity: 0.35;
  pointer-events: none;
}
.editor-scrollbar {
  width: var(--editor-canvas-scrollbar-w);
  flex-shrink: 0;
  background: rgba(255,255,255,0.02);
  border-left: 1px solid rgba(255,255,255,0.06);
  cursor: pointer;
  position: relative;
}
.scrollbar-track {
  position: absolute; inset: 0;
}
.scrollbar-thumb {
  position: absolute;
  left: 1px;
  right: 1px;
  background: color-mix(in srgb, var(--primary-color) 35%, transparent);
  border-radius: 3px;
  min-height: 16px;
  transition: background 0.15s;
}
.scrollbar-thumb:hover { background: color-mix(in srgb, var(--primary-color) 55%, transparent); }

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
