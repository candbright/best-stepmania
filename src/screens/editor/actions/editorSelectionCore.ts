import type { BpmChange, EditorState } from "../useEditorState";
import type { SelectionRect } from "./selectionRectMath";

export function createEditorSelectionCore(s: EditorState) {
  function getSelectionRange(): SelectionRect | null {
    if (s.selectionStart.value === null || s.selectionEnd.value === null) return null;
    const minRow = Math.min(s.selectionStart.value, s.selectionEnd.value);
    const maxRow = Math.max(s.selectionStart.value, s.selectionEnd.value);
    let minTrack = 0;
    let maxTrack = s.NUM_TRACKS.value - 1;
    if (s.selectionTrackStart.value !== null && s.selectionTrackEnd.value !== null) {
      minTrack = Math.min(s.selectionTrackStart.value, s.selectionTrackEnd.value);
      maxTrack = Math.max(s.selectionTrackStart.value, s.selectionTrackEnd.value);
    }
    return { minRow, maxRow, minTrack, maxTrack };
  }

  function getAllSelectionRects(): SelectionRect[] {
    const rects: SelectionRect[] = [...s.additionalSelections.value];
    const p = getSelectionRange();
    if (p) rects.push(p);
    return rects;
  }

  /** Keep selection regions aligned with flipped notes (primary + Ctrl+drag rects). */
  function remapAllSelectionRects(mapper: (r: SelectionRect) => SelectionRect) {
    const primary = getSelectionRange();
    if (primary) {
      const u = mapper(primary);
      s.selectionStart.value = u.minRow;
      s.selectionEnd.value = u.maxRow;
      s.selectionTrackStart.value = u.minTrack;
      s.selectionTrackEnd.value = u.maxTrack;
    }
    s.additionalSelections.value = s.additionalSelections.value.map(mapper);
  }

  function noteInAnyRect(row: number, track: number, rects: SelectionRect[]): boolean {
    return rects.some(
      (range) =>
        row >= range.minRow &&
        row <= range.maxRow &&
        track >= range.minTrack &&
        track <= range.maxTrack,
    );
  }

  /** BPM marker row lies in the vertical span of any selection rect (tracks ignored). */
  function bpmChangeInSelectionRowBand(changeBeat: number, rects: SelectionRect[]): boolean {
    const row = Math.round(changeBeat * 48);
    return rects.some((r) => row >= r.minRow && row <= r.maxRow);
  }

  function collectBpmsInSelectionRects(rects: SelectionRect[]): BpmChange[] {
    return s.bpmChanges.value
      .filter((c) => bpmChangeInSelectionRowBand(c.beat, rects))
      .map((c) => ({ beat: c.beat, bpm: c.bpm }));
  }

  return {
    getSelectionRange,
    getAllSelectionRects,
    remapAllSelectionRects,
    noteInAnyRect,
    bpmChangeInSelectionRowBand,
    collectBpmsInSelectionRects,
  };
}
