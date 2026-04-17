import type { ShortcutId } from "@/shared/lib/engine/keyBindings";
import type { EditorState } from "../useEditorState";
import {
  EDITOR_ZOOM_MAX,
  EDITOR_ZOOM_MIN,
  EDITOR_ZOOM_STEP_KEY,
  NOTE_TYPES,
} from "../constants";

export function createEditorScrollKeyboard(deps: {
  s: EditorState;
  shortcutMatches: (e: KeyboardEvent, id: ShortcutId) => boolean;
  cycleQuantize: (dir: 1 | -1) => void;
  redo: () => void;
  undo: () => void;
  saveToFile: () => Promise<boolean> | Promise<void>;
  copySelection: () => void;
  cutSelection: () => void;
  pasteSelection: () => void;
  selectAll: () => void;
  clearSelection: () => void;
  deleteSelection: () => void;
  goBack: () => void;
  togglePlayback: () => void;
  previewPlay: () => void;
  addBeatShiftNotesDown: () => void;
  deleteBeatShiftNotesUp: () => void;
  canDeleteBeatShiftNotesUp: () => boolean;
  flipHorizontal: () => void;
  flipVertical: () => void;
  flipDiagonal: () => void;
  syncMarqueeEndFromLastPointer: () => void;
  clampWaveformPanelOffset: (offset: number) => number;
}) {
  const {
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
  } = deps;

  function isEditableTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
  }

  function allowsEditorShortcutsInEditable(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.closest("[data-editor-shortcuts='allow']") !== null;
  }

  function handleScroll(e: WheelEvent) {
    e.preventDefault();
    if (s.allCharts.value.length === 0) return;
    // Keep waveform panel within visible viewport after any layout/zoom changes.
    s.waveformPanelOffsetX.value = clampWaveformPanelOffset(s.waveformPanelOffsetX.value);
    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? -10 : 10;
      s.zoom.value = Math.max(EDITOR_ZOOM_MIN, Math.min(EDITOR_ZOOM_MAX, s.zoom.value + delta));
    } else {
      const q = s.quantize.value;
      const stepBeats = q > 0 ? 4 / q : 1;
      const dir = Math.sign(e.deltaY);
      if (dir === 0) return;
      s.scrollBeat.value = Math.max(0, s.scrollBeat.value + dir * stepBeats);
    }
    if (s.isDragging.value && s.selectionRubberBand.value) {
      syncMarqueeEndFromLastPointer();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (s.showNewChartModal.value) return;
    if (isEditableTarget(e.target)) {
      if (!allowsEditorShortcutsInEditable(e.target)) return;
      if (!e.ctrlKey && !e.metaKey && !e.altKey) return;
    }
    if (s.allCharts.value.length === 0) {
      if (shortcutMatches(e, "editor.back")) {
        if (s.holdStartRow.value !== null) {
          s.holdStartRow.value = null;
          e.preventDefault();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        goBack();
      }
      return;
    }
    if (shortcutMatches(e, "editor.redo")) {
      redo();
      e.preventDefault();
      return;
    }
    if (shortcutMatches(e, "editor.undo")) {
      if (s.undoStack.value.length > 1) undo();
      e.preventDefault();
      return;
    }
    if (shortcutMatches(e, "editor.save")) { void saveToFile(); e.preventDefault(); return; }
    if (shortcutMatches(e, "editor.copy")) { copySelection(); e.preventDefault(); return; }
    if (shortcutMatches(e, "editor.cut")) { cutSelection(); e.preventDefault(); return; }
    if (shortcutMatches(e, "editor.paste")) { pasteSelection(); e.preventDefault(); return; }
    if (shortcutMatches(e, "editor.selectAll")) { selectAll(); e.preventDefault(); return; }
    if (shortcutMatches(e, "editor.clearSelection")) {
      const hasSel = s.selectionStart.value !== null || s.additionalSelections.value.length > 0;
      if (hasSel) { clearSelection(); e.preventDefault(); return; }
      // Fall through to editor.back if no selection
    }
    if (shortcutMatches(e, "editor.delete")) { deleteSelection(); e.preventDefault(); return; }
    if (shortcutMatches(e, "editor.back")) {
      if (s.showNewChartModal.value) {
        s.showNewChartModal.value = false;
        e.preventDefault();
        return;
      }
      if (s.holdStartRow.value !== null) {
        s.holdStartRow.value = null;
        e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      goBack();
      return;
    }
    if (shortcutMatches(e, "editor.playPause")) { togglePlayback(); e.preventDefault(); return; }
    if (shortcutMatches(e, "editor.previewPlay")) { previewPlay(); e.preventDefault(); return; }
    if (shortcutMatches(e, "editor.addBeat")) { addBeatShiftNotesDown(); e.preventDefault(); return; }
    if (shortcutMatches(e, "editor.deleteBeat")) { if (canDeleteBeatShiftNotesUp()) { deleteBeatShiftNotesUp(); } e.preventDefault(); return; }
    if (shortcutMatches(e, "editor.scrollUp")) {
      s.scrollBeat.value = Math.max(0, s.scrollBeat.value - 1);
      if (s.isDragging.value && s.selectionRubberBand.value) syncMarqueeEndFromLastPointer();
      e.preventDefault();
      return;
    }
    if (shortcutMatches(e, "editor.scrollDown")) {
      s.scrollBeat.value += 1;
      if (s.isDragging.value && s.selectionRubberBand.value) syncMarqueeEndFromLastPointer();
      e.preventDefault();
      return;
    }
    if (shortcutMatches(e, "editor.zoomIn")) {
      s.zoom.value = Math.min(EDITOR_ZOOM_MAX, s.zoom.value + EDITOR_ZOOM_STEP_KEY);
      if (s.isDragging.value && s.selectionRubberBand.value) syncMarqueeEndFromLastPointer();
      e.preventDefault();
      return;
    }
    if (shortcutMatches(e, "editor.zoomOut")) {
      s.zoom.value = Math.max(EDITOR_ZOOM_MIN, s.zoom.value - EDITOR_ZOOM_STEP_KEY);
      if (s.isDragging.value && s.selectionRubberBand.value) syncMarqueeEndFromLastPointer();
      e.preventDefault();
      return;
    }
    if (shortcutMatches(e, "editor.quantizeUp")) {
      cycleQuantize(1);
      e.preventDefault();
      return;
    }
    if (shortcutMatches(e, "editor.quantizeDown")) {
      cycleQuantize(-1);
      e.preventDefault();
      return;
    }
    if (shortcutMatches(e, "editor.flipH")) { flipHorizontal(); e.preventDefault(); return; }
    if (shortcutMatches(e, "editor.flipV")) { flipVertical(); e.preventDefault(); return; }
    if (shortcutMatches(e, "editor.flipD")) { flipDiagonal(); e.preventDefault(); return; }

    if (s.activeChart.value?.stepsType === "pump-routine") {
      if (shortcutMatches(e, "editor.routineLayer1")) {
        s.editorRoutineLayer.value = 1;
        e.preventDefault();
        return;
      }
      if (shortcutMatches(e, "editor.routineLayer2")) {
        s.editorRoutineLayer.value = 2;
        e.preventDefault();
        return;
      }
    }

    for (let typeIdx = 0; typeIdx < NOTE_TYPES.length; typeIdx++) {
      const sid = `editor.noteType${typeIdx + 1}` as ShortcutId;
      if (shortcutMatches(e, sid)) {
        const nt = NOTE_TYPES[typeIdx];
        if (nt) s.currentNoteType.value = nt.id;
        e.preventDefault();
        return;
      }
    }
  }

  return {
    handleScroll,
    handleKeyDown,
  };
}
