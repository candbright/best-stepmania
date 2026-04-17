import type { BpmChange, EditorState } from "../useEditorState";
import type { EditorCanvas } from "../useEditorCanvas";
import type { SelectionRect } from "./selectionRectMath";

type SelectionCore = {
  getAllSelectionRects: () => SelectionRect[];
  noteInAnyRect: (row: number, track: number, rects: SelectionRect[]) => boolean;
  bpmChangeInSelectionRowBand: (changeBeat: number, rects: SelectionRect[]) => boolean;
  collectBpmsInSelectionRects: (rects: SelectionRect[]) => BpmChange[];
};

export function createEditorSelectionClipboard(deps: {
  s: EditorState;
  canvas: EditorCanvas;
  pushUndo: () => void;
  clearSelection: () => void;
  mergeBpmAtBeat: (beat: number, bpm: number) => void;
  core: SelectionCore;
}) {
  const { s, canvas, pushUndo, clearSelection, mergeBpmAtBeat, core } = deps;
  const { getAllSelectionRects, noteInAnyRect, bpmChangeInSelectionRowBand, collectBpmsInSelectionRects } = core;

  function selectAll() {
    if (s.noteRows.value.length === 0) return;
    s.additionalSelections.value = [];
    s.selectionStart.value = s.noteRows.value[0].row;
    s.selectionEnd.value = s.noteRows.value[s.noteRows.value.length - 1].row;
    s.selectionTrackStart.value = 0;
    s.selectionTrackEnd.value = s.NUM_TRACKS.value - 1;
  }

  function deleteSelection() {
    const rects = getAllSelectionRects();
    if (rects.length === 0) return;

    let wouldDeleteNote = false;
    for (const r of s.noteRows.value) {
      if (r.notes.some((n) => noteInAnyRect(r.row, n.track, rects))) {
        wouldDeleteNote = true;
        break;
      }
    }
    const wouldDeleteBpm = s.bpmChanges.value.some(
      (c, idx) => idx > 0 && bpmChangeInSelectionRowBand(c.beat, rects),
    );
    if (!wouldDeleteNote && !wouldDeleteBpm) return;

    const nextRows: typeof s.noteRows.value = [];
    for (const r of s.noteRows.value) {
      const kept = r.notes.filter((n) => !noteInAnyRect(r.row, n.track, rects));
      if (kept.length > 0) {
        nextRows.push({ ...r, notes: kept });
      }
    }
    s.noteRows.value = nextRows;

    s.bpmChanges.value = s.bpmChanges.value.filter(
      (c, idx) => !bpmChangeInSelectionRowBand(c.beat, rects) || idx === 0,
    );
    s.bpm.value = s.bpmChanges.value[0]?.bpm ?? s.bpm.value;

    pushUndo();
    clearSelection();
  }

  function copySelection() {
    const rects = getAllSelectionRects();
    if (rects.length === 0) return;
    const selected = s.noteRows.value
      .map((r) => ({
        ...r,
        notes: r.notes.filter((n) => noteInAnyRect(r.row, n.track, rects)),
      }))
      .filter((r) => r.notes.length > 0);
    s.clipboard.value = JSON.parse(JSON.stringify(selected));
    s.clipboardBpmChanges.value = JSON.parse(JSON.stringify(collectBpmsInSelectionRects(rects)));
  }

  function cutSelection() {
    copySelection();
    deleteSelection();
  }

  function pasteSelection() {
    const hasNotes = s.clipboard.value.length > 0;
    const hasBpms = s.clipboardBpmChanges.value.length > 0;
    if (!hasNotes && !hasBpms) return;
    const baseRow = canvas.beatToRow(canvas.snapBeat(s.scrollBeat.value));
    const clipBase = hasNotes
      ? s.clipboard.value[0].row
      : Math.min(...s.clipboardBpmChanges.value.map((c) => Math.round(c.beat * 48)));
    const deltaRow = baseRow - clipBase;

    if (hasNotes) {
      for (const row of s.clipboard.value) {
        const newRow = row.row + deltaRow;
        const newBeat = newRow / 48;
        const newSecond = (newBeat / s.bpm.value) * 60;
        const existing = s.noteRows.value.find((r) => r.row === newRow);
        if (existing) {
          for (const n of row.notes) {
            existing.notes = existing.notes.filter((en) => en.track !== n.track);
            existing.notes.push({
              ...n,
              holdEndRow: n.holdEndRow !== null ? n.holdEndRow + deltaRow : null,
            });
          }
        } else {
          s.noteRows.value.push({
            row: newRow,
            beat: newBeat,
            second: newSecond,
            notes: row.notes.map((n) => ({
              ...n,
              holdEndRow: n.holdEndRow !== null ? n.holdEndRow + deltaRow : null,
            })),
          });
        }
      }
      s.noteRows.value.sort((a, b) => a.row - b.row);
    }

    if (hasBpms) {
      for (const c of s.clipboardBpmChanges.value) {
        const newRow = Math.round(c.beat * 48) + deltaRow;
        const newBeat = newRow / 48;
        mergeBpmAtBeat(newBeat, c.bpm);
      }
    }

    pushUndo();
  }

  return {
    selectAll,
    deleteSelection,
    copySelection,
    cutSelection,
    pasteSelection,
  };
}
