import type { EditorState, EditorUndoSnapshot } from "../useEditorState";
import { EDITOR_QUANTIZE_LEVELS, MAX_UNDO_STACK } from "../constants";

export function createEditorUndoQuantize(s: EditorState) {
  function pushUndo() {
    const snap: EditorUndoSnapshot = {
      notes: JSON.parse(JSON.stringify(s.noteRows.value)),
      bpms: JSON.parse(JSON.stringify(s.bpmChanges.value)),
      offset: s.metaOffset.value,
      chartMeter: s.editChartMeter.value,
      sampleStart: s.metaSampleStart.value,
      sampleLength: s.metaSampleLength.value,
    };
    s.undoStack.value.push(snap);
    if (s.undoStack.value.length > MAX_UNDO_STACK) s.undoStack.value.shift();
    s.redoStack.value = [];
  }

  function applyUndoSnapshot(snap: EditorUndoSnapshot) {
    s.noteRows.value = JSON.parse(JSON.stringify(snap.notes));
    s.bpmChanges.value = JSON.parse(JSON.stringify(snap.bpms));
    s.bpm.value = s.bpmChanges.value[0]?.bpm ?? s.bpm.value;
    s.metaOffset.value = snap.offset;
    s.editChartMeter.value = snap.chartMeter;
    s.metaSampleStart.value = snap.sampleStart;
    s.metaSampleLength.value = snap.sampleLength;
    s.editingBpmChangeIndex.value = -1;
  }

  function undo() {
    if (s.undoStack.value.length <= 1) return;
    const current = s.undoStack.value.pop();
    if (current) s.redoStack.value.push(JSON.parse(JSON.stringify(current)) as EditorUndoSnapshot);
    const prev = s.undoStack.value[s.undoStack.value.length - 1];
    applyUndoSnapshot(prev);
  }

  function redo() {
    const next = s.redoStack.value.pop();
    if (!next) return;
    applyUndoSnapshot(next);
    s.undoStack.value.push(JSON.parse(JSON.stringify(next)) as EditorUndoSnapshot);
  }

  function reseedUndoStackAfterHydrate() {
    s.undoStack.value = [];
    s.redoStack.value = [];
    pushUndo();
  }

  function cycleQuantize(delta: number) {
    const levels = EDITOR_QUANTIZE_LEVELS;
    const q = s.quantize.value;
    let idx = levels.indexOf(q as (typeof levels)[number]);
    if (idx < 0) {
      const fallback = levels.findIndex((v) => v >= q);
      idx = fallback >= 0 ? fallback : levels.length - 1;
    }
    const nidx = Math.max(0, Math.min(levels.length - 1, idx + delta));
    s.quantize.value = levels[nidx];
  }

  return {
    pushUndo,
    applyUndoSnapshot,
    undo,
    redo,
    reseedUndoStackAfterHydrate,
    cycleQuantize,
  };
}
