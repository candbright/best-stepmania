import type { ChartNoteInput, ChartNoteRow } from "@/engine/types";
import type { EditorState } from "../useEditorState";
import type { EditorCanvas } from "../useEditorCanvas";

export function createEditorGridShift(deps: { s: EditorState; canvas: EditorCanvas; pushUndo: () => void }) {
  const { s, canvas, pushUndo } = deps;

  function quantizeGridStepBeats(): number {
    const q = s.quantize.value;
    return q > 0 ? 4 / q : 1;
  }

  function quantizeGridStepRows(): number {
    return Math.round(quantizeGridStepBeats() * 48);
  }

  function receptorThresholdRow(): number {
    const thrBeat = canvas.snapBeat(s.scrollBeat.value);
    return canvas.beatToRow(thrBeat);
  }

  /** True if note head is strictly above the drawn receptor (same test as `beatToY` vs receptor). */
  function noteHeadPastReceptorLine(beat: number): boolean {
    return beat < s.scrollBeat.value - 1e-9;
  }

  /**
   * Receptor lies strictly inside hold body (not on head row, not on tail row):
   * then add/delete beat only adjusts tail length. If the line coincides with the tail end, do nothing.
   */
  function holdCrossesThreshold(headRow: number, tailRow: number, thresholdRow: number): boolean {
    return headRow < thresholdRow && tailRow > thresholdRow;
  }

  /** True if delete-beat at receptor can run without negative head row or collapsed crossing hold. */
  function canDeleteBeatShiftNotesUp(): boolean {
    const d = quantizeGridStepRows();
    if (d <= 0) return false;
    const thresholdRow = receptorThresholdRow();
    for (const r of s.noteRows.value) {
      const h = r.row;
      // Past the drawn receptor (unsnapped scrollBeat); removed on delete, not shifted — unlike thresholdRow which is snapped for grid ops.
      if (noteHeadPastReceptorLine(r.beat)) continue;
      for (const n of r.notes) {
        const tail = n.holdEndRow;
        if (tail !== null) {
          if (holdCrossesThreshold(h, tail, thresholdRow)) {
            if (tail - d <= h) return false;
          } else if (h >= thresholdRow) {
            if (h - d < 0) return false;
          }
        } else if (h >= thresholdRow && h - d < 0) {
          return false;
        }
      }
    }
    return true;
  }

  function mergeNotesIntoRows(pieces: Array<{ row: number; note: ChartNoteInput }>): ChartNoteRow[] {
    const map = new Map<number, ChartNoteInput[]>();
    for (const { row, note } of pieces) {
      let arr = map.get(row);
      if (!arr) {
        arr = [];
        map.set(row, arr);
      }
      const i = arr.findIndex((x) => x.track === note.track);
      if (i >= 0) arr[i] = note;
      else arr.push(note);
    }
    const out: ChartNoteRow[] = [];
    for (const [row, notes] of map) {
      const beat = row / 48;
      out.push({ row, beat, second: canvas.beatToTime(beat), notes });
    }
    out.sort((a, b) => a.row - b.row);
    return out;
  }

  /**
   * direction +1: insert one quantize step at receptor — only notes at/under the line move down;
   *   if the line lies strictly inside a hold (not on the tail row), only the tail lengthens.
   * direction -1: reverse; crossing holds shorten. Receptor / scrollBeat is unchanged for both.
   */
  function shiftAllNotesByOneQuantizeStep(direction: 1 | -1) {
    if (s.playing.value) return;
    const d = quantizeGridStepRows();
    if (d <= 0) return;
    const deltaRows = direction * d;
    if (deltaRows < 0 && !canDeleteBeatShiftNotesUp()) return;

    const thresholdRow = receptorThresholdRow();
    const pieces: Array<{ row: number; note: ChartNoteInput }> = [];

    for (const r of s.noteRows.value) {
      const h = r.row;
      for (const n of r.notes) {
        // Delete beat: remove keys whose head is past the drawn receptor (matches canvas, not snap grid).
        if (deltaRows < 0 && noteHeadPastReceptorLine(r.beat)) continue;

        const tail = n.holdEndRow;
        const base: ChartNoteInput = {
          track: n.track,
          noteType: n.noteType,
          holdEndRow: n.holdEndRow,
          ...(n.routineLayer === 1 || n.routineLayer === 2 ? { routineLayer: n.routineLayer } : {}),
        };

        if (tail !== null) {
          if (holdCrossesThreshold(h, tail, thresholdRow)) {
            pieces.push({
              row: h,
              note: { ...base, holdEndRow: tail + deltaRows },
            });
          } else if (h >= thresholdRow) {
            pieces.push({
              row: h + deltaRows,
              note: { ...base, holdEndRow: tail + deltaRows },
            });
          } else {
            pieces.push({ row: h, note: { ...base } });
          }
        } else if (h >= thresholdRow) {
          pieces.push({
            row: h + deltaRows,
            note: { ...base, holdEndRow: null },
          });
        } else {
          pieces.push({ row: h, note: { ...base, holdEndRow: null } });
        }
      }
    }

    s.noteRows.value = mergeNotesIntoRows(pieces);
    pushUndo();
  }

  function addBeatShiftNotesDown() {
    if (s.allCharts.value.length === 0) return;
    shiftAllNotesByOneQuantizeStep(1);
  }

  function deleteBeatShiftNotesUp() {
    if (s.allCharts.value.length === 0) return;
    shiftAllNotesByOneQuantizeStep(-1);
  }

  return {
    canDeleteBeatShiftNotesUp,
    addBeatShiftNotesDown,
    deleteBeatShiftNotesUp,
  };
}
