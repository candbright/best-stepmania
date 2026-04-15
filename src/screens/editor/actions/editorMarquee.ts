import type { EditorState } from "../useEditorState";
import type { EditorCanvas } from "../useEditorCanvas";
import { COLUMN_WIDTH, HEADER_HEIGHT } from "../constants";
import type { SelectionRect } from "./selectionRectMath";

export function createEditorMarquee(
  s: EditorState,
  canvas: EditorCanvas,
  getSelectionRange: () => SelectionRect | null,
) {
  /** True for the current marquee if Ctrl was held at mousedown (additive selection). */
  let selectionMarqueeAdditive = false;
  let selectionMarqueeEdgeRaf = 0;
  let selectionMarqueeLastClientX = 0;
  let selectionMarqueeLastClientY = 0;

  function stopSelectionMarqueeEdgeScroll() {
    if (selectionMarqueeEdgeRaf !== 0) {
      cancelAnimationFrame(selectionMarqueeEdgeRaf);
      selectionMarqueeEdgeRaf = 0;
    }
  }

  function selectionMarqueeEdgeScrollStep() {
    if (!s.isDragging.value || !s.selectionRubberBand.value) {
      selectionMarqueeEdgeRaf = 0;
      return;
    }
    autoScrollEditorDuringMarquee(selectionMarqueeLastClientY);
    const { x, y } = pointerToCanvasCss(selectionMarqueeLastClientX, selectionMarqueeLastClientY);
    const rb = s.selectionRubberBand.value;
    const fieldX = canvas.getCanvasFieldX();
    const clampedY = Math.max(y, HEADER_HEIGHT);
    s.selectionRubberBand.value = {
      ...rb,
      endBeat: canvas.yToBeat(clampedY),
      endTrackT: (x - fieldX) / COLUMN_WIDTH,
    };
    selectionMarqueeEdgeRaf = requestAnimationFrame(selectionMarqueeEdgeScrollStep);
  }

  /** Canvas pixel corners for marquee (anchor follows chart; end follows pointer). */
  function marqueeCanvasCorners(rb: {
    anchorBeat: number;
    anchorTrackT: number;
    endBeat: number;
    endTrackT: number;
  }): {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } {
    const fieldX = canvas.getCanvasFieldX();
    const x0 = fieldX + rb.anchorTrackT * COLUMN_WIDTH;
    const y0 = canvas.beatToY(rb.anchorBeat);
    const x1 = fieldX + rb.endTrackT * COLUMN_WIDTH;
    const y1 = canvas.beatToY(rb.endBeat);
    return { x0, y0, x1, y1 };
  }

  /**
   * Viewport → canvas CSS pixel space (same as drawEditor / getCanvasFieldX).
   * EditorScreen wraps the view in `transform: scale(uiScale)`; getBoundingClientRect is then
   * scaled on screen while clientWidth/height stay layout-sized — without this ratio, hits drift.
   */
  function pointerToCanvasCss(clientX: number, clientY: number): { x: number; y: number } {
    const el = s.canvasRef.value;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const rw = rect.width;
    const rh = rect.height;
    if (rw <= 0 || rh <= 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rw) * el.clientWidth,
      y: ((clientY - rect.top) / rh) * el.clientHeight,
    };
  }

  /** While marquee-selecting past canvas top/bottom, scroll so more rows enter the field. */
  function autoScrollEditorDuringMarquee(clientY: number) {
    const el = s.canvasRef.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 40;
    const base = 0.32;
    if (clientY > rect.bottom - margin) {
      const over = clientY - (rect.bottom - margin);
      const t = Math.min(1, over / margin);
      s.scrollBeat.value = Math.min(
        s.totalBeats.value,
        s.scrollBeat.value + base * (0.35 + t * t * 2.6),
      );
    } else if (clientY < rect.top + margin) {
      const over = rect.top + margin - clientY;
      const t = Math.min(1, over / margin);
      s.scrollBeat.value = Math.max(0, s.scrollBeat.value - base * (0.35 + t * t * 2.6));
    }
  }

  /** Turn marquee pixels into row/track selection; additive = Ctrl at mousedown. */
  function commitMarqueeSelection() {
    const rb = s.selectionRubberBand.value;
    if (!rb) return;
    const { x0: ax0, y0: ay0, x1: ax1, y1: ay1 } = marqueeCanvasCorners(rb);
    const fieldX = canvas.getCanvasFieldX();
    const fieldW = s.FIELD_WIDTH.value;
    const nT = s.NUM_TRACKS.value;
    const rx0 = Math.min(ax0, ax1);
    const rx1 = Math.max(ax0, ax1);
    const ry0 = Math.min(ay0, ay1);
    const ry1 = Math.max(ay0, ay1);
    const ix0 = Math.max(rx0, fieldX);
    const ix1 = Math.min(rx1, fieldX + fieldW);
    if (ix1 <= fieldX || ix0 >= fieldX + fieldW) {
      if (!selectionMarqueeAdditive) {
        s.selectionStart.value = null;
        s.selectionEnd.value = null;
        s.selectionTrackStart.value = null;
        s.selectionTrackEnd.value = null;
      }
      return;
    }
    const chartY0 = Math.max(ry0, HEADER_HEIGHT);
    const chartY1 = Math.max(ry1, HEADER_HEIGHT);
    const b0 = canvas.yToBeat(chartY0);
    const b1 = canvas.yToBeat(chartY1);
    const bLo = Math.min(b0, b1);
    const bHi = Math.max(b0, b1);
    let minRow = Math.floor(bLo * 48);
    let maxRow = Math.ceil(bHi * 48) - 1;
    if (maxRow < minRow) maxRow = minRow;
    minRow = Math.max(0, minRow);
    let minTrack = Math.max(0, Math.min(nT - 1, Math.floor((ix0 - fieldX) / COLUMN_WIDTH)));
    let maxTrack = Math.max(0, Math.min(nT - 1, Math.floor((ix1 - fieldX - Number.EPSILON) / COLUMN_WIDTH)));
    if (maxTrack < minTrack) {
      const swap = minTrack;
      minTrack = maxTrack;
      maxTrack = swap;
    }
    if (selectionMarqueeAdditive) {
      const prev = getSelectionRange();
      if (prev) {
        s.additionalSelections.value = [...s.additionalSelections.value, prev];
      }
    }
    s.selectionStart.value = minRow;
    s.selectionEnd.value = maxRow;
    s.selectionTrackStart.value = minTrack;
    s.selectionTrackEnd.value = maxTrack;
  }

  /** End marquee drag: commit to row/track selection and clear rubber (also safe if already cleared). */
  function finalizeSelectionMarquee() {
    stopSelectionMarqueeEdgeScroll();
    if (s.isDragging.value && s.selectionRubberBand.value) {
      commitMarqueeSelection();
      s.selectionRubberBand.value = null;
    }
    s.isDragging.value = false;
  }

  /** After scroll/zoom, re-map marquee end to chart coords under the last pointer (wheel does not fire mousemove). */
  function syncMarqueeEndFromLastPointer() {
    if (!s.isDragging.value || !s.selectionRubberBand.value || !s.canvasRef.value) return;
    const { x, y } = pointerToCanvasCss(selectionMarqueeLastClientX, selectionMarqueeLastClientY);
    const rb = s.selectionRubberBand.value;
    const fieldX = canvas.getCanvasFieldX();
    const clampedY = Math.max(y, HEADER_HEIGHT);
    s.selectionRubberBand.value = {
      ...rb,
      endBeat: canvas.yToBeat(clampedY),
      endTrackT: (x - fieldX) / COLUMN_WIDTH,
    };
  }

  function beginSelectionMarquee(clientX: number, clientY: number, additive: boolean) {
    selectionMarqueeAdditive = additive;
    if (!selectionMarqueeAdditive) {
      s.additionalSelections.value = [];
      s.selectionStart.value = null;
      s.selectionEnd.value = null;
      s.selectionTrackStart.value = null;
      s.selectionTrackEnd.value = null;
    }
    s.isDragging.value = true;
    stopSelectionMarqueeEdgeScroll();
    const { x, y } = pointerToCanvasCss(clientX, clientY);
    const fieldX0 = canvas.getCanvasFieldX();
    const clampedY = Math.max(y, HEADER_HEIGHT);
    const b0 = canvas.yToBeat(clampedY);
    const t0 = (x - fieldX0) / COLUMN_WIDTH;
    s.selectionRubberBand.value = {
      anchorBeat: b0,
      anchorTrackT: t0,
      endBeat: b0,
      endTrackT: t0,
    };
    selectionMarqueeLastClientX = clientX;
    selectionMarqueeLastClientY = clientY;
  }

  function continueSelectionMarquee(clientX: number, clientY: number) {
    if (!s.isDragging.value || !s.selectionRubberBand.value) return;
    const { x, y } = pointerToCanvasCss(clientX, clientY);
    const rb = s.selectionRubberBand.value;
    const fieldX = canvas.getCanvasFieldX();
    const clampedY = Math.max(y, HEADER_HEIGHT);
    s.selectionRubberBand.value = {
      ...rb,
      endBeat: canvas.yToBeat(clampedY),
      endTrackT: (x - fieldX) / COLUMN_WIDTH,
    };
    selectionMarqueeLastClientX = clientX;
    selectionMarqueeLastClientY = clientY;
    autoScrollEditorDuringMarquee(clientY);
    const el = s.canvasRef.value;
    if (el) {
      const rect = el.getBoundingClientRect();
      const margin = 40;
      const pastEdge = clientY > rect.bottom - margin || clientY < rect.top + margin;
      if (pastEdge && selectionMarqueeEdgeRaf === 0) {
        selectionMarqueeEdgeRaf = requestAnimationFrame(selectionMarqueeEdgeScrollStep);
      } else if (!pastEdge) {
        stopSelectionMarqueeEdgeScroll();
      }
    }
  }

  return {
    pointerToCanvasCss,
    stopSelectionMarqueeEdgeScroll,
    syncMarqueeEndFromLastPointer,
    finalizeSelectionMarquee,
    beginSelectionMarquee,
    continueSelectionMarquee,
  };
}
