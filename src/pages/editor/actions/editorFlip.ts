import type { EditorState } from "../useEditorState";
import {
  mergeSelectionRects,
  remapRectNonPumpD,
  remapRectNonPumpH,
  remapRectNonPumpV,
  remapRectPumpD,
  remapRectPumpH,
  remapRectPumpV,
  type SelectionRect,
} from "./selectionRectMath";
import { isPumpPadLayout, mirrorPumpTrackH, mirrorPumpTrackV } from "./pumpMirror";

type SelectionCore = {
  getAllSelectionRects: () => SelectionRect[];
  noteInAnyRect: (row: number, track: number, rects: SelectionRect[]) => boolean;
  remapAllSelectionRects: (mapper: (r: SelectionRect) => SelectionRect) => void;
};

export function createEditorFlip(deps: { s: EditorState; pushUndo: () => void; core: SelectionCore }) {
  const { s, pushUndo, core } = deps;
  const { getAllSelectionRects, noteInAnyRect, remapAllSelectionRects } = core;

  /** Non-pump: mirror note rows in time within one axis-aligned rect (hold tails adjusted). */
  function applyTimeMirrorInRect(range: SelectionRect) {
    const center = range.minRow + range.maxRow;
    for (const r of s.noteRows.value) {
      if (r.row >= range.minRow && r.row <= range.maxRow) {
        const hasSelectedNotes = r.notes.some((n) => n.track >= range.minTrack && n.track <= range.maxTrack);
        if (hasSelectedNotes) {
          r.row = center - r.row;
          r.beat = r.row / 48;
          r.second = (r.beat / s.bpm.value) * 60;
          for (const n of r.notes) {
            if (n.track >= range.minTrack && n.track <= range.maxTrack && n.holdEndRow !== null) {
              n.holdEndRow = center - n.holdEndRow;
              if (n.holdEndRow < r.row) {
                const tmp = r.row;
                r.row = n.holdEndRow;
                n.holdEndRow = tmp;
                r.beat = r.row / 48;
                r.second = (r.beat / s.bpm.value) * 60;
              }
            }
          }
        }
      }
    }
    s.noteRows.value.sort((a, b) => a.row - b.row);
  }

  function flipHorizontal() {
    const rects = getAllSelectionRects();
    if (rects.length === 0) return;
    const steps = s.activeChart.value?.stepsType;
    const nT = s.NUM_TRACKS.value;
    if (isPumpPadLayout(steps, nT)) {
      for (const r of s.noteRows.value) {
        for (const n of r.notes) {
          if (noteInAnyRect(r.row, n.track, rects)) {
            n.track = mirrorPumpTrackH(n.track, nT);
          }
        }
      }
      remapAllSelectionRects((r) => remapRectPumpH(r, nT));
    } else {
      const range = mergeSelectionRects(rects);
      if (!range) return;
      for (const r of s.noteRows.value) {
        if (r.row >= range.minRow && r.row <= range.maxRow) {
          for (const n of r.notes) {
            if (n.track >= range.minTrack && n.track <= range.maxTrack) {
              n.track = range.minTrack + range.maxTrack - n.track;
            }
          }
        }
      }
      remapAllSelectionRects((r) => remapRectNonPumpH(r, range));
    }
    pushUndo();
  }

  function flipVertical() {
    const rects = getAllSelectionRects();
    if (rects.length === 0) return;
    const steps = s.activeChart.value?.stepsType;
    const nT = s.NUM_TRACKS.value;
    if (isPumpPadLayout(steps, nT)) {
      for (const r of s.noteRows.value) {
        for (const n of r.notes) {
          if (noteInAnyRect(r.row, n.track, rects)) {
            n.track = mirrorPumpTrackV(n.track, nT);
          }
        }
      }
      remapAllSelectionRects((r) => remapRectPumpV(r, nT));
    } else {
      const merged = mergeSelectionRects(rects);
      if (!merged) return;
      applyTimeMirrorInRect(merged);
      remapAllSelectionRects((r) => remapRectNonPumpV(r, merged));
    }
    pushUndo();
  }

  /** L/R + U/D flip in one undo step (non-pump: track mirror then time mirror in merged rect; pump: composed lane maps). */
  function flipDiagonal() {
    const rects = getAllSelectionRects();
    if (rects.length === 0) return;
    const steps = s.activeChart.value?.stepsType;
    const nT = s.NUM_TRACKS.value;
    if (isPumpPadLayout(steps, nT)) {
      for (const r of s.noteRows.value) {
        for (const n of r.notes) {
          if (noteInAnyRect(r.row, n.track, rects)) {
            n.track = mirrorPumpTrackV(mirrorPumpTrackH(n.track, nT), nT);
          }
        }
      }
      remapAllSelectionRects((r) => remapRectPumpD(r, nT));
    } else {
      const range = mergeSelectionRects(rects);
      if (!range) return;
      for (const r of s.noteRows.value) {
        if (r.row >= range.minRow && r.row <= range.maxRow) {
          for (const n of r.notes) {
            if (n.track >= range.minTrack && n.track <= range.maxTrack) {
              n.track = range.minTrack + range.maxTrack - n.track;
            }
          }
        }
      }
      applyTimeMirrorInRect(range);
      remapAllSelectionRects((r) => remapRectNonPumpD(r, range));
    }
    pushUndo();
  }

  return {
    flipHorizontal,
    flipVertical,
    flipDiagonal,
  };
}
