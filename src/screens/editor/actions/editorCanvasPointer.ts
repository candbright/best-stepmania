// Canvas mouse / click handlers for the chart editor (notes, BPM hit targets, marquee, waveform panel).

import type { EditorState } from "../useEditorState";
import type { EditorCanvas } from "../useEditorCanvas";
import { COLUMN_WIDTH, HEADER_HEIGHT } from "../constants";

export interface EditorCanvasPointerDeps {
  s: EditorState;
  canvas: EditorCanvas;
  pushUndo: () => void;
  pointerToCanvasCss: (clientX: number, clientY: number) => { x: number; y: number };
  clampWaveformPanelOffset: (offset: number) => number;
  routineLayerForNewNote: () => { routineLayer: 1 | 2 } | Record<string, never>;
  createLongNote: (track: number, startRow: number, endRow: number, noteType: string) => void;
  bpm: {
    deleteBpmChange: (index: number) => void;
    startEditingBpmChange: (index: number) => void;
    addBpmChangeAtBeat: (beat: number) => void;
    commitBpmEdit: () => void;
  };
  marquee: {
    beginSelectionMarquee: (clientX: number, clientY: number, ctrlKey: boolean) => void;
    continueSelectionMarquee: (clientX: number, clientY: number) => void;
    finalizeSelectionMarquee: () => void;
  };
}

export function createEditorCanvasPointer(deps: EditorCanvasPointerDeps) {
  const {
    s,
    canvas,
    pushUndo,
    pointerToCanvasCss,
    clampWaveformPanelOffset,
    routineLayerForNewNote,
    createLongNote,
    bpm,
    marquee,
  } = deps;

  let suppressNextClick = false;

  function handleCanvasClick(e: MouseEvent) {
    if (!s.canvasRef.value || s.playing.value) return;
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (s.isWaveformPanelDragging.value) {
      s.isWaveformPanelDragging.value = false;
      s.waveformPanelDragState.value = "idle";
      return;
    }
    if (e.shiftKey) return;
    const { x, y } = pointerToCanvasCss(e.clientX, e.clientY);

    const bpmDelIdx = canvas.getBpmDeleteButtonAt(x, y);
    if (bpmDelIdx >= 0) {
      bpm.deleteBpmChange(bpmDelIdx);
      return;
    }

    const bpmIdx = canvas.getBpmEditButtonAt(x, y);
    if (bpmIdx >= 0) {
      bpm.startEditingBpmChange(bpmIdx);
      return;
    }

    const addBeat = canvas.getBpmAddButtonAt(x, y);
    if (addBeat >= 0) {
      bpm.addBpmChangeAtBeat(addBeat);
      return;
    }

    if (s.editingBpmChangeIndex.value >= 0) {
      bpm.commitBpmEdit();
    }

    const fieldX = canvas.getCanvasFieldX();
    const col = Math.floor((x - fieldX) / COLUMN_WIDTH);
    if (col < 0 || col >= s.NUM_TRACKS.value) return;

    if (y < HEADER_HEIGHT) return;

    const beat = canvas.snapBeat(canvas.yToBeat(y));
    if (beat < 0) return;
    const row = canvas.beatToRow(beat);

    const existingIdx = s.noteRows.value.findIndex((r) => r.row === row && r.notes.some((n) => n.track === col));

    if (existingIdx >= 0) {
      const r = s.noteRows.value[existingIdx];
      r.notes = r.notes.filter((n) => n.track !== col);
      if (r.notes.length === 0) s.noteRows.value.splice(existingIdx, 1);
    } else {
      const second = canvas.beatToTime(beat);
      const noteInfo = {
        track: col,
        noteType: s.currentNoteType.value,
        holdEndRow: null,
        ...routineLayerForNewNote(),
      };
      const existing = s.noteRows.value.find((r) => r.row === row);
      if (existing) {
        existing.notes.push(noteInfo);
      } else {
        s.noteRows.value.push({ row, beat, second, notes: [noteInfo] });
        s.noteRows.value.sort((a, b) => a.row - b.row);
      }
    }
    pushUndo();
  }

  function handleMouseDown(e: MouseEvent) {
    if (!s.canvasRef.value || s.playing.value || s.allCharts.value.length === 0) return;

    if (s.isWaveformPanelDragging.value) {
      return;
    }

    if (s.waveformPanelDragState.value === "canceled") {
      s.waveformPanelDragState.value = "idle";
      s.isWaveformPanelDragging.value = false;
      return;
    }

    const { x, y } = pointerToCanvasCss(e.clientX, e.clientY);
    const fieldX = canvas.getCanvasFieldX();
    const fieldW = s.FIELD_WIDTH.value;

    if (e.button === 0 && !e.shiftKey) {
      const h = s.canvasRef.value.clientHeight;
      if (canvas.isInWaveformPanel(x, y, fieldX, h)) {
        s.waveformPanelDragState.value = "dragging";
        s.waveformPanelDragStartX.value = x;
        s.waveformPanelDragStartOffset.value = clampWaveformPanelOffset(s.waveformPanelOffsetX.value);
        s.waveformPanelOffsetX.value = s.waveformPanelDragStartOffset.value;
        s.isWaveformPanelDragging.value = true;
        return;
      }
    }

    if (e.button === 0 && !e.shiftKey) {
      if (x < fieldX || x >= fieldX + fieldW) return;
      const col = Math.floor((x - fieldX) / COLUMN_WIDTH);
      if (col < 0 || col >= s.NUM_TRACKS.value) return;
      const beat = canvas.snapBeat(canvas.yToBeat(y));
      if (y < HEADER_HEIGHT) return;
      const row = canvas.beatToRow(beat);
      s.holdStartRow.value = { row, track: col };
      s.holdDragCurrentRow.value = row;
      s.isHoldDragging.value = true;
      return;
    }

    if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      marquee.beginSelectionMarquee(e.clientX, e.clientY, e.ctrlKey);
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!s.canvasRef.value || s.allCharts.value.length === 0) return;

    if (s.waveformPanelDragState.value === "dragging") {
      const { x } = pointerToCanvasCss(e.clientX, e.clientY);
      const deltaX = x - s.waveformPanelDragStartX.value;
      s.waveformPanelOffsetX.value = clampWaveformPanelOffset(s.waveformPanelDragStartOffset.value + deltaX);
      return;
    }

    if (s.isHoldDragging.value && s.holdStartRow.value) {
      const { y } = pointerToCanvasCss(e.clientX, e.clientY);
      const clampedY = Math.max(y, HEADER_HEIGHT);
      const beat = canvas.snapBeat(canvas.yToBeat(clampedY));
      s.holdDragCurrentRow.value = canvas.beatToRow(beat);
      return;
    }
    if (!s.isDragging.value || !s.selectionRubberBand.value) return;
    marquee.continueSelectionMarquee(e.clientX, e.clientY);
  }

  function handleMouseUp(e: MouseEvent) {
    if (s.waveformPanelDragState.value === "dragging" || s.isWaveformPanelDragging.value) {
      const { x, y } = pointerToCanvasCss(e.clientX, e.clientY);
      const h = s.canvasRef.value?.clientHeight ?? 0;
      const fieldX = canvas.getCanvasFieldX();

      if (!canvas.isInWaveformPanel(x, y, fieldX, h)) {
        s.waveformPanelDragState.value = "idle";
        s.isWaveformPanelDragging.value = false;
        return;
      }

      s.waveformPanelDragState.value = "idle";
      s.isWaveformPanelDragging.value = false;
      return;
    }
    if (s.waveformPanelDragState.value === "canceled") {
      s.waveformPanelDragState.value = "idle";
      s.isWaveformPanelDragging.value = false;
      return;
    }

    let createdLongNote = false;
    if (s.isHoldDragging.value && s.holdStartRow.value && s.holdDragCurrentRow.value !== null) {
      if (s.holdStartRow.value.row !== s.holdDragCurrentRow.value) {
        createLongNote(
          s.holdStartRow.value.track,
          s.holdStartRow.value.row,
          s.holdDragCurrentRow.value,
          s.currentNoteType.value === "Roll" ? "Roll" : "HoldHead",
        );
        createdLongNote = true;
      }
    }
    if (createdLongNote) suppressNextClick = true;
    s.isHoldDragging.value = false;
    s.holdStartRow.value = null;
    s.holdDragCurrentRow.value = null;
    marquee.finalizeSelectionMarquee();
  }

  function handleRightClick(e: MouseEvent) {
    e.preventDefault();
    marquee.finalizeSelectionMarquee();
  }

  return {
    handleCanvasClick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleRightClick,
  };
}
