// --- Editor Actions ---
// All user-facing actions: note editing, selection, clipboard, save, chart CRUD,
// metadata, BPM management, keyboard/mouse handlers.

import { useRouter, type RouteLocationNormalizedLoaded } from "vue-router";
import { useGameStore } from "@/shared/stores/game";
import { usePlayerStore } from "@/shared/stores/player";
import { useSessionStore } from "@/shared/stores/session";
import { useLibraryStore } from "@/shared/stores/library";
import { useSettingsStore } from "@/shared/stores/settings";
import { mergeShortcutBindings, eventMatchesBinding, type ShortcutId } from "@/shared/lib/engine/keyBindings";
import { useI18n } from "@/shared/i18n";
import * as api from "@/shared/api";
import { logDebug } from "@/shared/lib/devLog";
import type { EditorState } from "./useEditorState";
import type { EditorCanvas } from "./useEditorCanvas";
import { defaultQuantizeFromTimeSignatures } from "./quantizeFromTimeSignature";
import { serializeEditorChartPersist, serializeEditorMetaPersist } from "@/pages/editor/editorChartBackup";
import { createEditorUndoQuantize } from "./actions/editorUndoQuantize";
import { createEditorChartLoading } from "./actions/editorChartLoading";
import { createEditorChartCrud } from "./actions/editorChartCrud";
import { createEditorBpmActions } from "./actions/editorBpmActions";
import { createEditorSave } from "./actions/editorSave";
import { createEditorSmExchange } from "./actions/editorSmExchange";
import { createEditorOffsetActions } from "./actions/editorOffsetActions";
import { createEditorPlaybackNav } from "./actions/editorPlaybackNav";
import { createEditorScrollbar } from "./actions/editorScrollbar";
import { createEditorSelectionCore } from "./actions/editorSelectionCore";
import { createEditorMarquee } from "./actions/editorMarquee";
import { createEditorSelectionClipboard } from "./actions/editorSelectionClipboard";
import { createEditorGridShift } from "./actions/editorGridShift";
import { createEditorFlip } from "./actions/editorFlip";
import { createEditorScrollKeyboard } from "./actions/editorScrollKeyboard";
import { createEditorCanvasPointer } from "./actions/editorCanvasPointer";

export function useEditorActions(
  s: EditorState,
  canvas: EditorCanvas,
  route: Pick<RouteLocationNormalizedLoaded, "query">,
) {
  const router = useRouter();
  const gameFacade = useGameStore();
  const player = usePlayerStore();
  const session = useSessionStore();
  const library = useLibraryStore();
  const settings = useSettingsStore();
  const { t } = useI18n();

  function shortcutMatches(e: KeyboardEvent, id: ShortcutId): boolean {
    const binding = mergeShortcutBindings(settings.shortcutOverrides)[id];
    return eventMatchesBinding(e, binding);
  }
  const {
    pushUndo,
    undo,
    redo,
    reseedUndoStackAfterHydrate,
    cycleQuantize,
  } = createEditorUndoQuantize(s);
  const selectionCore = createEditorSelectionCore(s);
  const {
    pointerToCanvasCss,
    stopSelectionMarqueeEdgeScroll,
    syncMarqueeEndFromLastPointer,
    finalizeSelectionMarquee,
    beginSelectionMarquee,
    continueSelectionMarquee,
  } = createEditorMarquee(s, canvas, selectionCore.getSelectionRange);

  function routineLayerForNewNote(): { routineLayer: 1 | 2 } | Record<string, never> {
    if (s.activeChart.value?.stepsType !== "pump-routine") return {};
    return { routineLayer: s.editorRoutineLayer.value };
  }

  /** Clear note/timing editing state when the song has zero charts (file may still exist). */
  function resetEditorWhenNoCharts() {
    s.playing.value = false;
    api.audioPause().catch((e) => logDebug("Optional", "editor.resetNoCharts.pause", e));
    s.noteRows.value = [];
    s.undoStack.value = [];
    s.redoStack.value = [];
    s.selectionStart.value = null;
    s.selectionEnd.value = null;
    s.selectionTrackStart.value = null;
    s.selectionTrackEnd.value = null;
    s.additionalSelections.value = [];
    s.selectionRubberBand.value = null;
    s.clipboard.value = [];
    s.clipboardBpmChanges.value = [];
    s.holdStartRow.value = null;
    s.holdDragCurrentRow.value = null;
    s.isHoldDragging.value = false;
    s.isDragging.value = false;
    s.editingBpmChangeIndex.value = -1;
    s.NUM_TRACKS_ACTUAL.value = 5;

    const song = session.currentSong;
    const rawBpm = song?.displayBpm ?? "120";
    const parsed = parseFloat(String(rawBpm).split("-")[0] || "120");
    s.bpm.value = Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
    s.bpmChanges.value = [{ beat: 0, bpm: s.bpm.value }];
    s.timeSignatures.value = [{ beat: 0, numerator: 4, denominator: 4 }];
    s.tickcounts.value = [{ beat: 0, ticksPerBeat: 4 }];
    s.comboChanges.value = [{ beat: 0, combo: 1, missCombo: 1 }];
    s.speedChanges.value = [{ beat: 0, ratio: 1.0, delay: 0, unit: 0 }];
    s.scrollChanges.value = [{ beat: 0, ratio: 1.0 }];
    s.labelChanges.value = [{ beat: 0, label: "Song Start" }];
    s.quantize.value = defaultQuantizeFromTimeSignatures(s.timeSignatures.value);
    s.scrollBeat.value = 0;
    s.editorRoutineLayer.value = 1;
    refreshEditorChartBaseline();
    refreshEditorMetaBaseline();
  }

  // Single timer handle for save messages — cancels any previous pending clear
  // on each new message, preventing duplicate ghost callbacks after unmount.
  let _saveMessageTimer: ReturnType<typeof setTimeout> | null = null;
  function refreshEditorChartBaseline() {
    s.editorChartBaselineSerialized.value = serializeEditorChartPersist(s);
  }

  function refreshEditorMetaBaseline() {
    s.editorMetaBaselineSerialized.value = serializeEditorMetaPersist(s);
  }

  function setSaveMessage(msg: string, errorMs = 5000, successMs = 3000) {
    s.saveMessage.value = msg;
    if (_saveMessageTimer !== null) clearTimeout(_saveMessageTimer);
    const delay = msg.startsWith(t("editor.saved")) || msg === t("editor.metaSaved")
      || msg === t("editor.chartCreated") || msg === t("editor.chartDeleted")
      || msg === t("editor.chartPropertiesSaved")
      || msg === t("editor.exportSmSuccess") || msg === t("editor.importSmSuccess")
      ? successMs : errorMs;
    _saveMessageTimer = setTimeout(() => {
      _saveMessageTimer = null;
      s.saveMessage.value = "";
    }, delay);
  }

  const { loadAllCharts, loadChartNotes, loadWaveformData } = createEditorChartLoading({
    s,
    session,
    route,
    resetEditorWhenNoCharts,
    refreshEditorChartBaseline,
    refreshEditorMetaBaseline,
    pushUndo,
  });

  function clearSelection() {
    stopSelectionMarqueeEdgeScroll();
    s.selectionStart.value = null;
    s.selectionEnd.value = null;
    s.selectionTrackStart.value = null;
    s.selectionTrackEnd.value = null;
    s.additionalSelections.value = [];
    s.selectionRubberBand.value = null;
  }

  const {
    switchChart,
    createNewChart,
    performDeleteCurrentChart,
    applyChartProperties,
    buildSaveNotesPayload,
    duplicateCurrentChart,
  } = createEditorChartCrud({
    s,
    session,
    library,
    t,
    setSaveMessage,
    loadChartNotes,
    clearSelection,
  });

  const {
    getBpmAtBeat,
    addBpmChangeFromInput,
    updateBpmChange,
    deleteBpmChange,
    startEditingBpmChange,
    commitBpmEdit,
    cancelBpmEdit,
    mergeBpmAtBeat,
    addBpmChangeAtBeat,
  } = createEditorBpmActions({ s, pushUndo });

  const {
    selectAll,
    deleteSelection,
    copySelection,
    cutSelection,
    pasteSelection,
  } = createEditorSelectionClipboard({
    s,
    canvas,
    pushUndo,
    clearSelection,
    mergeBpmAtBeat,
    core: selectionCore,
  });

  const {
    canDeleteBeatShiftNotesUp,
    addBeatShiftNotesDown,
    deleteBeatShiftNotesUp,
  } = createEditorGridShift({ s, canvas, pushUndo });

  const { flipHorizontal, flipVertical, flipDiagonal } = createEditorFlip({
    s,
    pushUndo,
    core: selectionCore,
  });

  const { saveToFile, saveMetadata } = createEditorSave({
    s,
    session,
    t,
    setSaveMessage,
    buildSaveNotesPayload,
    refreshEditorChartBaseline,
    refreshEditorMetaBaseline,
  });

  const { exportCurrentChartAsSm, importSmAsNewChart } = createEditorSmExchange({
    s,
    session,
    library,
    t,
    setSaveMessage,
    saveToFile,
    loadChartNotes,
  });

  const {
    startEditingOffset,
    commitOffsetChange,
    cancelOffsetEdit,
    onOffsetValueChanged,
    startEditingChartMeter,
    commitChartMeterChange,
    cancelChartMeterEdit,
    onChartMeterValueChanged,
    startEditingSampleStart,
    commitSampleStartChange,
    cancelSampleStartEdit,
    onSampleStartValueChanged,
    startEditingSampleLength,
    commitSampleLengthChange,
    cancelSampleLengthEdit,
    onSampleLengthValueChanged,
  } = createEditorOffsetActions({ s, pushUndo });

  const { togglePlayback, goBackNow, goBack, previewPlay } = createEditorPlaybackNav({
    s,
    canvas,
    router,
    session,
    gameFacade,
    player,
  });

  const { handleScrollbarMouseDown } = createEditorScrollbar(s);

  // ====== Note helpers ======
  function createLongNote(track: number, startRow: number, endRow: number, noteType: string) {
    if (startRow === endRow) return;
    const headRow = Math.min(startRow, endRow);
    const tailRow = Math.max(startRow, endRow);
    const headBeat = headRow / 48;
    const headSecond = (headBeat / s.bpm.value) * 60;

    const existing = s.noteRows.value.find((r) => r.row === headRow);
    const noteInfo = { track, noteType, holdEndRow: tailRow, ...routineLayerForNewNote() };

    if (existing) {
      existing.notes = existing.notes.filter((n) => n.track !== track);
      existing.notes.push(noteInfo);
    } else {
      s.noteRows.value.push({ row: headRow, beat: headBeat, second: headSecond, notes: [noteInfo] });
      s.noteRows.value.sort((a, b) => a.row - b.row);
    }
    pushUndo();
  }

  function clampWaveformPanelOffset(offset: number): number {
    const bounds = canvas.getWaveformPanelOffsetBounds();
    return Math.max(bounds.min, Math.min(bounds.max, offset));
  }

  const {
    handleCanvasClick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleRightClick,
  } = createEditorCanvasPointer({
    s,
    canvas,
    pushUndo,
    commitOffsetEditIfActive: commitOffsetChange,
    pointerToCanvasCss,
    clampWaveformPanelOffset,
    routineLayerForNewNote,
    createLongNote,
    bpm: {
      deleteBpmChange,
      startEditingBpmChange,
      addBpmChangeAtBeat,
      commitBpmEdit,
    },
    marquee: {
      beginSelectionMarquee,
      continueSelectionMarquee,
      finalizeSelectionMarquee,
    },
  });

  const { handleScroll, handleKeyDown } = createEditorScrollKeyboard({
    s,
    shortcutMatches,
    cycleQuantize,
    redo,
    undo,
    saveToFile,
    copySelection,
    cutSelection,
    pasteSelection,
    selectAll,
    clearSelection,
    deleteSelection,
    goBack,
    togglePlayback,
    previewPlay,
    addBeatShiftNotesDown,
    deleteBeatShiftNotesUp,
    canDeleteBeatShiftNotesUp,
    flipHorizontal,
    flipVertical,
    flipDiagonal,
    syncMarqueeEndFromLastPointer,
    clampWaveformPanelOffset,
  });

  return {
    // Chart loading
    loadAllCharts,
    switchChart,
    createNewChart,
    duplicateCurrentChart,
    performDeleteCurrentChart,
    applyChartProperties,
    // BPM
    getBpmAtBeat,
    addBpmChangeFromInput,
    updateBpmChange,
    deleteBpmChange,
    startEditingBpmChange,
    commitBpmEdit,
    cancelBpmEdit,
    // Scrollbar
    handleScrollbarMouseDown,
    // Undo
    undo,
    redo,
    reseedUndoStackAfterHydrate,
    // Mouse
    handleCanvasClick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleRightClick,
    // Selection
    selectAll,
    clearSelection,
    copySelection,
    cutSelection,
    pasteSelection,
    deleteSelection,
    flipHorizontal,
    flipVertical,
    flipDiagonal,
    addBeatShiftNotesDown,
    deleteBeatShiftNotesUp,
    canDeleteBeatShiftNotesUp,
    // Save
    saveToFile,
    saveMetadata,
    exportCurrentChartAsSm,
    importSmAsNewChart,
    // Offset
    startEditingOffset,
    commitOffsetChange,
    cancelOffsetEdit,
    onOffsetValueChanged,
    startEditingChartMeter,
    commitChartMeterChange,
    cancelChartMeterEdit,
    onChartMeterValueChanged,
    startEditingSampleStart,
    commitSampleStartChange,
    cancelSampleStartEdit,
    onSampleStartValueChanged,
    startEditingSampleLength,
    commitSampleLengthChange,
    cancelSampleLengthEdit,
    onSampleLengthValueChanged,
    // Scroll / Keyboard
    handleScroll,
    handleKeyDown,
    // Playback
    togglePlayback,
    // Navigation
    goBack,
    goBackNow,
    previewPlay,
    // Background data (must be called explicitly after the loading overlay)
    loadWaveformData,
  };
}

export type EditorActions = ReturnType<typeof useEditorActions>;
