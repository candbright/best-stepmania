// --- Editor Canvas Drawing ---
// All canvas rendering logic for the chart editor.

import type { EditorState } from "./useEditorState";
import { BPM_BEAT_MATCH_EPS, COLUMN_WIDTH, NOTE_SIZE, HEADER_HEIGHT, WAVEFORM_WIDTH } from "./constants";
import {
  beatToRowFromState,
  beatToYFromState,
  marqueePreviewRowTrackRectFromState,
  snapBeatFromState,
  yToBeatFromState,
} from "./editorCanvasMath";
import { useSessionStore } from "@/shared/stores/session";
import { getThemeBgHex } from "@/shared/lib/themeCssBridge";
import { playBeatLine, playRhythmLaneApproach } from "@/shared/lib/sfx";
import { drawEditorLaneShape, drawEditorReceptor } from "./editorCanvasNoteShapes";
import {
  drawEditorWaveformPanel,
  getEditorWaveformPanelOffsetBounds,
  isPointInEditorWaveformPanel,
  waveformPanelLeftX,
} from "./editorCanvasWaveform";
import { editorCanvasNoteColor } from "./editorCanvasNoteColor";
import {
  buildBpmTimingCache,
  beatToSecondCached,
  secondToBeatCached,
  type BpmTimingCache,
} from "./editorBpmTimingCache";

export function useEditorCanvas(s: EditorState) {
  const session = useSessionStore();
  let ctx: CanvasRenderingContext2D | null = null;
  let animId = 0;
  /** Previous playhead beat while editor timeline is playing — used to detect row.beat crossings vs receptors. */
  let prevEditorPlaybackBeat: number | null = null;
  /** Playback SFX scan pointer (into sorted `noteRows` by beat). */
  let noteRowScanIdx = 0;

  // --- Timing caches (rebuilt when bpmChanges changes) ---
  let timingCache: BpmTimingCache | null = null;
  let timingCacheKey = "";
  let bpmBeatKeySet: Set<number> | null = null;

  function beatKey(beat: number): number {
    // Stable integer key for beat comparisons using the same tolerance as UI matching.
    // (E.g. two beats within BPM_BEAT_MATCH_EPS map to the same key.)
    return Math.round(beat / BPM_BEAT_MATCH_EPS);
  }

  function getTimingCaches(): { cache: BpmTimingCache; bpmBeatKeys: Set<number> } {
    const arr = s.bpmChanges.value;
    const len = arr.length;
    const first = arr[0];
    const last = arr[len - 1];
    const key = `${len}|${first?.beat ?? 0}|${first?.bpm ?? 0}|${last?.beat ?? 0}|${last?.bpm ?? 0}`;
    if (!timingCache || !bpmBeatKeySet || key !== timingCacheKey) {
      timingCacheKey = key;
      timingCache = buildBpmTimingCache(arr, s.bpm.value);
      const set = new Set<number>();
      for (const c of arr) set.add(beatKey(c.beat));
      bpmBeatKeySet = set;
    }
    return { cache: timingCache, bpmBeatKeys: bpmBeatKeySet };
  }

  /** Hit areas for BPM edit buttons drawn on canvas (rebuilt each frame) */
  const bpmEditButtons: Array<{ index: number; x: number; y: number; w: number; h: number }> = [];
  /** Hit areas for BPM delete buttons (beside edit; rebuilt each frame) */
  const bpmDeleteButtons: Array<{ index: number; x: number; y: number; w: number; h: number }> = [];
  /** Hit areas for "+" add-BPM on quantize grid lines (rebuilt each frame) */
  const bpmAddButtons: Array<{ beat: number; x: number; y: number; w: number; h: number }> = [];

  function nearMultipleOf(x: number, m: number): boolean {
    if (m <= 0) return false;
    const q = x / m;
    return Math.abs(q - Math.round(q)) < 1e-3;
  }

  // --- Coordinate helpers ---
  function beatToY(beat: number): number {
    return beatToYFromState(beat, s.scrollBeat.value, s.zoom.value);
  }

  function yToBeat(y: number): number {
    return yToBeatFromState(y, s.scrollBeat.value, s.zoom.value);
  }

  function snapBeat(beat: number): number {
    return snapBeatFromState(beat, s.quantize.value);
  }

  function beatToRow(beat: number): number {
    return beatToRowFromState(beat);
  }

  function getCanvasFieldX(): number {
    if (!s.canvasRef.value) return 0;
    return (s.canvasRef.value.clientWidth - s.FIELD_WIDTH.value) / 2;
  }

  /** Row/track bounds of the in-progress marquee (same geometry as commit); null if off the field. */
  function marqueePreviewRowTrackRect(): {
    minRow: number;
    maxRow: number;
    minTrack: number;
    maxTrack: number;
  } | null {
    return marqueePreviewRowTrackRectFromState({
      rubberBand: s.selectionRubberBand.value,
      fieldX: getCanvasFieldX(),
      fieldWidth: s.FIELD_WIDTH.value,
      numTracks: s.NUM_TRACKS.value,
      beatToY,
      yToBeat,
    });
  }

  function beatToTime(beat: number): number {
    const { cache } = getTimingCaches();
    return beatToSecondCached(beat, cache);
  }

  /** Inverse of beatToTime: given elapsed seconds, return the beat position (multi-BPM aware) */
  function timeToBeat(seconds: number): number {
    const { cache } = getTimingCaches();
    return secondToBeatCached(seconds, cache);
  }

  function drawWaveformPanel(c: CanvasRenderingContext2D, fieldX: number, h: number) {
    drawEditorWaveformPanel({
      c,
      fieldX,
      h,
      panelOffsetX: s.waveformPanelOffsetX.value,
      waveformMinMax: s.waveformMinMax.value,
      waveformDuration: s.waveformDuration.value,
      metaOffset: s.metaOffset.value,
      yToBeat,
      beatToTime,
      timeToBeat,
      beatToY,
    });
  }

  function isInWaveformPanel(x: number, y: number, fieldX: number, h: number): boolean {
    return isPointInEditorWaveformPanel(x, y, fieldX, h, s.waveformPanelOffsetX.value);
  }

  function getWaveformPanelOffsetBounds(): { min: number; max: number } {
    if (!s.canvasRef.value) return { min: 0, max: 0 };
    return getEditorWaveformPanelOffsetBounds(s.canvasRef.value.clientWidth, getCanvasFieldX());
  }

  // --- Main draw loop ---
  function drawEditor(_time: number) {
    if (!ctx || !s.canvasRef.value) return;
    const w = s.canvasRef.value.clientWidth;
    const h = s.canvasRef.value.clientHeight;

    if (s.allCharts.value.length === 0 || !s.activeChart.value) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = getThemeBgHex();
      ctx.fillRect(0, 0, w, h);
      animId = requestAnimationFrame(drawEditor);
      return;
    }

    const numTracks = s.NUM_TRACKS.value;
    const fieldWidth = s.FIELD_WIDTH.value;
    const colColors = s.COL_COLORS.value;
    const fieldX = (w - fieldWidth) / 2;
    const isPumpRoutine = s.activeChart.value?.stepsType === "pump-routine";

    function editorNoteColor(track: number, routineLayer: 1 | 2 | null | undefined): string {
      return editorCanvasNoteColor(
        track,
        routineLayer,
        isPumpRoutine,
        numTracks,
        colColors,
        session.routineP1ColorId,
        session.routineP2ColorId,
      );
    }

    if (s.playing.value) {
      // Wall-clock chart time keeps rAF smooth; offset only affects audio seek in togglePlayback, not scroll speed.
      const elapsedSec =
        ((performance.now() - s.editorPlaybackWallStartMs.value) / 1000) * s.editorRate.value;
      const playbackChartTime = s.playStartChartSec.value + elapsedSec;
      s.scrollBeat.value = timeToBeat(playbackChartTime);

      // Rhythm SFX on each key: same space as drawing (`beatToY(row.beat)` vs receptor at scrollBeat).
      // Integer-beat + r.second heuristics miss off-grid rows and desync from the flowing notes.
      const currBeat = s.scrollBeat.value;
      const prevBeat = prevEditorPlaybackBeat;
      const eps = 1e-5;
      if (prevBeat === null) {
        prevEditorPlaybackBeat = currBeat;
        noteRowScanIdx = 0;
      } else if (currBeat > prevBeat + 1e-9) {
        const low = prevBeat - eps;
        const high = currBeat + eps;
        const crossedBeatStart = Math.ceil(prevBeat + eps);
        const crossedBeatEnd = Math.floor(currBeat + eps);
        for (let beat = crossedBeatStart; beat <= crossedBeatEnd; beat++) {
          void beat;
          playBeatLine();
        }
        const tracksCrossed = new Set<number>();
        const rows = s.noteRows.value;
        // Advance pointer to first row with beat > low.
        while (noteRowScanIdx < rows.length && rows[noteRowScanIdx]!.beat <= low) {
          noteRowScanIdx += 1;
        }
        // Scan rows in (low, high].
        let j = noteRowScanIdx;
        while (j < rows.length) {
          const row = rows[j]!;
          const nb = row.beat;
          if (nb > high) break;
          for (const n of row.notes) {
            if (n.noteType === "Fake") continue;
            tracksCrossed.add(n.track);
          }
          j += 1;
        }
        noteRowScanIdx = j;
        if (tracksCrossed.size > 0) {
          const scale = 1 / Math.sqrt(tracksCrossed.size);
          for (const track of tracksCrossed) {
            playRhythmLaneApproach(track, scale);
          }
        }
        prevEditorPlaybackBeat = currBeat;
      } else {
        prevEditorPlaybackBeat = currBeat;
      }
    } else {
      prevEditorPlaybackBeat = null;
    }

    ctx.clearRect(0, 0, w, h);

    // Field background
    ctx.fillStyle = getThemeBgHex();
    ctx.fillRect(fieldX, 0, fieldWidth, h);

    // Track grid cell backgrounds and column separators (drawn from top to bottom to fill header area)
    if (s.showTrackGrid.value) {
      for (let i = 0; i < numTracks; i++) {
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.02)";
        ctx.fillRect(fieldX + i * COLUMN_WIDTH, 0, COLUMN_WIDTH, h);
      }
      // Column separators (all)
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= numTracks; i++) {
        ctx.beginPath();
        ctx.moveTo(fieldX + i * COLUMN_WIDTH, 0);
        ctx.lineTo(fieldX + i * COLUMN_WIDTH, h);
        ctx.stroke();
      }
    } else {
      // Only draw outer boundary lines (left edge of first column, right edge of last column)
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      for (const i of [0, numTracks] as const) {
        ctx.beginPath();
        ctx.moveTo(fieldX + i * COLUMN_WIDTH, 0);
        ctx.lineTo(fieldX + i * COLUMN_WIDTH, h);
        ctx.stroke();
      }
    }

    // Include beats that would appear in the header area (0 to HEADER_HEIGHT)
    const headerBeats = HEADER_HEIGHT / s.zoom.value;
    const startBeat = Math.max(0, Math.floor(s.scrollBeat.value - headerBeats - 2));
    const endBeat = Math.ceil(s.scrollBeat.value + h / s.zoom.value + 2);

    // Quantize grid: every subdivision line shares the same styling tier; BPM "+" on each line without a change.
    if (s.showBeatLines.value) {
    const step = 4 / s.quantize.value;
    const qColors: Record<number, string> = {
      3: "rgba(255,100,100,0.18)",
      4: "rgba(255,255,255,0.08)",
      6: "rgba(171,71,188,0.16)",
      8: "rgba(41,121,255,0.16)",
      12: "rgba(171,71,188,0.14)",
      16: "rgba(0,230,118,0.14)",
      24: "rgba(255,145,0,0.12)",
      32: "rgba(255,234,0,0.10)",
      48: "rgba(64,196,255,0.10)",
      64: "rgba(224,224,224,0.08)",
      192: "rgba(158,158,158,0.06)",
    };

    bpmAddButtons.length = 0;
    const { bpmBeatKeys } = getTimingCaches();
    const iStart = Math.ceil((startBeat - 1e-9) / step);
    const iEnd = Math.floor((endBeat + 1e-9) / step);
    for (let i = iStart; i <= iEnd; i++) {
      const b = Math.round(i * step * 1e6) / 1e6;
      const y = beatToY(b);
      // Show beat/measure lines all the way up to the lane top (y=0),
      // not just the chart field below the header/judgment area.
      if (y < -5 || y > h + 5) continue;

      const onMeasure = nearMultipleOf(b, 4);
      const onBeat = nearMultipleOf(b, 1);

      let lineWidth: number;
      let strokeStyle: string;
      if (onMeasure) {
        lineWidth = 2;
        strokeStyle = "rgba(255,255,255,0.45)";
      } else if (onBeat) {
        lineWidth = 1;
        strokeStyle = "rgba(255,255,255,0.15)";
      } else {
        lineWidth = 1;
        strokeStyle = qColors[s.quantize.value] || "rgba(255,255,255,0.08)";
      }
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(fieldX, y);
      ctx.lineTo(fieldX + fieldWidth, y);
      ctx.stroke();

      if (onMeasure) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const measureNum = Math.round(b / 4) + 1;
        const labelX = s.waveformMinMax.value.length >= 2 ? waveformPanelLeftX(fieldX) + WAVEFORM_WIDTH - 8 : fieldX - 10;
        ctx.fillText(String(measureNum), labelX, y);
      }

      // O(1) membership check instead of scanning the full BPM list per grid line.
      const hasBpmHere = bpmBeatKeys.has(beatKey(b));
      if (!hasBpmHere) {
        const addBtnX = fieldX + fieldWidth + 8;
        const addBtnY = y - 9;
        const addBtnW = 18;
        const addBtnH = 18;
        ctx.fillStyle = onMeasure ? "rgba(255,171,0,0.12)" : onBeat ? "rgba(255,171,0,0.08)" : "rgba(255,171,0,0.05)";
        ctx.beginPath();
        ctx.roundRect(addBtnX, addBtnY, addBtnW, addBtnH, 3);
        ctx.fill();
        ctx.fillStyle = onMeasure ? "rgba(255,171,0,0.55)" : onBeat ? "rgba(255,171,0,0.40)" : "rgba(255,171,0,0.32)";
        ctx.font = "13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("+", addBtnX + addBtnW / 2, y);
        bpmAddButtons.push({ beat: b, x: addBtnX, y: addBtnY, w: addBtnW, h: addBtnH });
      }
    }
    }

    // Committed selection: no block fill (marquee is the only rectangle overlay). Notes use isNoteInSelection stroke below.

    function bpmChangeRowInSelectionRowBand(beat: number): boolean {
      const row = Math.round(beat * 48);
      for (const extra of s.additionalSelections.value) {
        if (row >= extra.minRow && row <= extra.maxRow) return true;
      }
      if (s.selectionStart.value !== null && s.selectionEnd.value !== null) {
        const lo = Math.min(s.selectionStart.value, s.selectionEnd.value);
        const hi = Math.max(s.selectionStart.value, s.selectionEnd.value);
        if (row >= lo && row <= hi) return true;
      }
      const mp = marqueePreviewRowTrackRect();
      if (mp && row >= mp.minRow && row <= mp.maxRow) return true;
      return false;
    }

    // BPM change markers (after selection fill so lines stay visible; thicker when inside selection band)
    bpmEditButtons.length = 0;
    bpmDeleteButtons.length = 0;
    for (let ci = 0; ci < s.bpmChanges.value.length; ci++) {
      const change = s.bpmChanges.value[ci];
      const cy = beatToY(change.beat);
      // Keep BPM guide lines visible through the receptor/judgment area;
      // only cull when they leave the top of the lane region.
      if (cy < 0 || cy > h) continue;
      const inSelBand = bpmChangeRowInSelectionRowBand(change.beat);
      ctx.strokeStyle = inSelBand ? "rgba(255,224,130,0.95)" : "rgba(255,171,0,0.7)";
      ctx.lineWidth = inSelBand ? 3 : 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(fieldX - 5, cy);
      ctx.lineTo(fieldX + fieldWidth + 5, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = inSelBand ? "#ffe082" : "#ffab00";
      ctx.font = "12px system-ui, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const labelText = `\u266a${change.bpm}`;
      const labelX = fieldX + fieldWidth + 12;
      ctx.fillText(labelText, labelX, cy);
      const labelW = ctx.measureText(labelText).width;
      const btnX = labelX + labelW + 6;
      const btnY = cy - 10;
      const btnW = 22;
      const btnH = 20;
      ctx.fillStyle = inSelBand ? "rgba(255,224,130,0.28)" : "rgba(255,171,0,0.18)";
      ctx.beginPath();
      ctx.roundRect(btnX, btnY, btnW, btnH, 4);
      ctx.fill();
      ctx.fillStyle = inSelBand ? "#ffe082" : "#ffab00";
      ctx.font = "13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✎", btnX + btnW / 2, cy);
      bpmEditButtons.push({ index: ci, x: btnX, y: btnY, w: btnW, h: btnH });

      const canDeleteBpm =
        s.bpmChanges.value.length > 1 && Math.abs(change.beat) >= BPM_BEAT_MATCH_EPS;
      if (canDeleteBpm) {
        const gap = 4;
        const delX = btnX + btnW + gap;
        ctx.fillStyle = inSelBand ? "rgba(255,128,128,0.22)" : "rgba(255,80,80,0.16)";
        ctx.beginPath();
        ctx.roundRect(delX, btnY, btnW, btnH, 4);
        ctx.fill();
        ctx.fillStyle = inSelBand ? "#ffab91" : "#ff8a80";
        ctx.font = "12px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✕", delX + btnW / 2, cy);
        bpmDeleteButtons.push({ index: ci, x: delX, y: btnY, w: btnW, h: btnH });
      }
    }

    // Hold start marker
    if (s.holdStartRow.value) {
      const hy = beatToY(s.holdStartRow.value.row / 48);
      const hx = fieldX + s.holdStartRow.value.track * COLUMN_WIDTH;
      ctx.strokeStyle = "#ffd740";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(hx + 4, hy - NOTE_SIZE / 2 - 2, COLUMN_WIDTH - 8, NOTE_SIZE + 4);
      if (s.holdDragCurrentRow.value !== null) {
        const endY = beatToY(s.holdDragCurrentRow.value / 48);
        const bodyW = NOTE_SIZE * 0.42;
        const bodyX = hx + (COLUMN_WIDTH - bodyW) / 2;
        const holdPreviewRl = isPumpRoutine ? s.editorRoutineLayer.value : undefined;
        const holdBase =
          s.currentNoteType.value === "Roll"
            ? "#ffd740"
            : editorNoteColor(s.holdStartRow.value.track, holdPreviewRl);
        ctx.fillStyle = holdBase + "30";
        ctx.fillRect(bodyX, Math.min(hy, endY), bodyW, Math.abs(endY - hy));
      }
      ctx.setLineDash([]);
    }

    // Notes
    const nsHalf = NOTE_SIZE / 2;
    const noteCullMargin = 80;
    for (const row of s.noteRows.value) {
      const y = beatToY(row.beat);
      const rowNearView = y >= -noteCullMargin && y <= h + noteCullMargin;
      let holdsOnly = false;
      if (!rowNearView) {
        let anyHoldSpansView = false;
        for (const n of row.notes) {
          if ((n.noteType === "HoldHead" || n.noteType === "Roll") && n.holdEndRow !== null) {
            const endY = beatToY(n.holdEndRow / 48);
            const top = Math.min(y, endY);
            const bot = Math.max(y, endY);
            if (bot >= -noteCullMargin && top <= h + noteCullMargin) {
              anyHoldSpansView = true;
              break;
            }
          }
        }
        if (!anyHoldSpansView) continue;
        holdsOnly = true;
      }

      for (const note of row.notes) {
        if (
          holdsOnly &&
          note.noteType !== "HoldHead" &&
          note.noteType !== "Roll"
        ) {
          continue;
        }
        const x = fieldX + note.track * COLUMN_WIDTH;
        const rl = note.routineLayer === 1 || note.routineLayer === 2 ? note.routineLayer : undefined;
        const color = editorNoteColor(note.track, rl);
        const inSelection = isNoteInSelection(row.row, note.track);

        if (note.noteType === "Mine") {
          ctx.save();
          const mineR = nsHalf - 2;
          ctx.strokeStyle = "#ff1744";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(x + COLUMN_WIDTH / 2, y, mineR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(255,23,68,0.15)";
          ctx.fill();
          ctx.fillStyle = "#ff1744";
          ctx.font = `${Math.round(NOTE_SIZE * 0.42)}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("\u2715", x + COLUMN_WIDTH / 2, y);
          ctx.restore();
        } else if ((note.noteType === "HoldHead" || note.noteType === "Roll") && note.holdEndRow !== null) {
          const endBeatVal = note.holdEndRow / 48;
          const endY = beatToY(endBeatVal);
          const bodyW = NOTE_SIZE * 0.5;
          const bodyX = x + (COLUMN_WIDTH - bodyW) / 2;
          const holdColor = note.noteType === "Roll" ? "#ffd740" : color;
          ctx.fillStyle = holdColor + "40";
          ctx.fillRect(bodyX, Math.min(y, endY), bodyW, Math.abs(endY - y));
          ctx.strokeStyle = holdColor + "60";
          ctx.lineWidth = 1;
          ctx.strokeRect(bodyX, Math.min(y, endY), bodyW, Math.abs(endY - y));
          drawEditorLaneShape(ctx, x + COLUMN_WIDTH / 2, y, note.track, holdColor, numTracks);
          ctx.fillStyle = holdColor + "90";
          ctx.fillRect(bodyX - 2, endY - 4, bodyW + 4, 8);
          if (note.noteType === "Roll") {
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.font = `${Math.round(NOTE_SIZE * 0.32)}px system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("R", x + COLUMN_WIDTH / 2, y);
          }
        } else if (note.noteType === "Lift") {
          drawEditorLaneShape(ctx, x + COLUMN_WIDTH / 2, y, note.track, "#ce93d8", numTracks, 0.16, true);
        } else if (note.noteType === "Fake") {
          drawEditorLaneShape(ctx, x + COLUMN_WIDTH / 2, y, note.track, "#78909c", numTracks, 0.18, false);
          ctx.setLineDash([4, 4]);
          drawEditorLaneShape(ctx, x + COLUMN_WIDTH / 2, y, note.track, "#78909c", numTracks, 0, true);
          ctx.setLineDash([]);
        } else {
          drawEditorLaneShape(ctx, x + COLUMN_WIDTH / 2, y, note.track, color, numTracks);
        }

        if (inSelection) {
          ctx.strokeStyle = "rgba(124,77,255,0.9)";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(x + COLUMN_WIDTH / 2 - NOTE_SIZE / 2 - 2, y - nsHalf - 2, NOTE_SIZE + 4, NOTE_SIZE + 4, 7);
          ctx.stroke();
        }
      }
    }

    // ── Judgment / receptor line (matching NoteField.vue gameplay style) ──
    const receptorY = beatToY(s.scrollBeat.value);
    const jlGrad = ctx.createLinearGradient(fieldX, receptorY - 14, fieldX, receptorY + 14);
    jlGrad.addColorStop(0,   "rgba(108, 59, 255, 0)");
    jlGrad.addColorStop(0.5, "rgba(108, 59, 255, 0.18)");
    jlGrad.addColorStop(1,   "rgba(108, 59, 255, 0)");
    ctx.fillStyle = jlGrad;
    ctx.fillRect(fieldX, receptorY - 14, fieldWidth, 28);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fieldX, receptorY);
    ctx.lineTo(fieldX + fieldWidth, receptorY);
    ctx.stroke();

    // ── Receptor keys (gameplay-style arrows / shapes) ──
    for (let i = 0; i < numTracks; i++) {
      const rcol = editorNoteColor(i, undefined);
      drawEditorReceptor(ctx, fieldX + i * COLUMN_WIDTH + COLUMN_WIDTH / 2, receptorY, i, rcol, numTracks);
    }

    // Playhead
    if (s.playing.value) {
      const py = beatToY(s.scrollBeat.value);
      ctx.strokeStyle = "#76ff03";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(fieldX - 20, py);
      ctx.lineTo(fieldX + fieldWidth + 20, py);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Waveform panel drawn last so it appears on top when overlapping with field
    drawWaveformPanel(ctx, fieldX, h);

    const rb = s.selectionRubberBand.value;
    if (rb) {
      const ax = fieldX + rb.anchorTrackT * COLUMN_WIDTH;
      const ay = beatToY(rb.anchorBeat);
      const ex = fieldX + rb.endTrackT * COLUMN_WIDTH;
      const ey = beatToY(rb.endBeat);
      const mx0 = Math.min(ax, ex);
      const my0 = Math.min(ay, ey);
      const mw = Math.abs(ex - ax);
      const mh = Math.abs(ey - ay);
      ctx.fillStyle = "rgba(124,77,255,0.07)";
      ctx.fillRect(mx0, my0, mw, mh);
      ctx.strokeStyle = "rgba(186, 147, 255, 0.92)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(mx0 + 0.5, my0 + 0.5, Math.max(0, mw - 1), Math.max(0, mh - 1));
      ctx.setLineDash([]);
    }

    animId = requestAnimationFrame(drawEditor);
  }

  // --- Selection helper (used by drawing) ---
  function isNoteInSelection(row: number, track: number): boolean {
    for (const rect of s.additionalSelections.value) {
      if (
        row >= rect.minRow &&
        row <= rect.maxRow &&
        track >= rect.minTrack &&
        track <= rect.maxTrack
      ) {
        return true;
      }
    }
    if (s.selectionStart.value !== null && s.selectionEnd.value !== null) {
      const minRow = Math.min(s.selectionStart.value, s.selectionEnd.value);
      const maxRow = Math.max(s.selectionStart.value, s.selectionEnd.value);
      let minTrack = 0,
        maxTrack = s.NUM_TRACKS.value - 1;
      if (s.selectionTrackStart.value !== null && s.selectionTrackEnd.value !== null) {
        minTrack = Math.min(s.selectionTrackStart.value, s.selectionTrackEnd.value);
        maxTrack = Math.max(s.selectionTrackStart.value, s.selectionTrackEnd.value);
      }
      if (row >= minRow && row <= maxRow && track >= minTrack && track <= maxTrack) return true;
    }
    const mp = marqueePreviewRowTrackRect();
    if (
      mp &&
      row >= mp.minRow &&
      row <= mp.maxRow &&
      track >= mp.minTrack &&
      track <= mp.maxTrack
    ) {
      return true;
    }
    return false;
  }

  /** Check if a canvas pixel coordinate hits a BPM edit button; returns the BPM change index or -1 */
  function getBpmEditButtonAt(px: number, py: number): number {
    for (const btn of bpmEditButtons) {
      if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
        return btn.index;
      }
    }
    return -1;
  }

  /** Check if a canvas pixel coordinate hits a BPM delete button; returns the BPM change index or -1 */
  function getBpmDeleteButtonAt(px: number, py: number): number {
    for (const btn of bpmDeleteButtons) {
      if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
        return btn.index;
      }
    }
    return -1;
  }

  /** Check if a canvas pixel coordinate hits a "+" BPM add button; returns the beat or -1 */
  function getBpmAddButtonAt(px: number, py: number): number {
    for (const btn of bpmAddButtons) {
      if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
        return btn.beat;
      }
    }
    return -1;
  }

  // --- Resize (HiDPI-aware) ---
  function resizeCanvas() {
    if (!s.canvasRef.value) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = s.canvasRef.value.clientWidth;
    const ch = s.canvasRef.value.clientHeight;
    s.canvasRef.value.width = Math.round(cw * dpr);
    s.canvasRef.value.height = Math.round(ch * dpr);
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // --- Lifecycle ---
  function initCanvas() {
    if (s.canvasRef.value) {
      ctx = s.canvasRef.value.getContext("2d");
      resizeCanvas();
      animId = requestAnimationFrame(drawEditor);
    }
  }

  function destroyCanvas() {
    cancelAnimationFrame(animId);
  }

  return {
    beatToY,
    yToBeat,
    snapBeat,
    beatToRow,
    getCanvasFieldX,
    beatToTime,
    timeToBeat,
    getBpmEditButtonAt,
    getBpmDeleteButtonAt,
    getBpmAddButtonAt,
    isInWaveformPanel,
    getWaveformPanelOffsetBounds,
    resizeCanvas,
    initCanvas,
    destroyCanvas,
  };
}

export type EditorCanvas = ReturnType<typeof useEditorCanvas>;
