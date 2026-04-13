// --- Editor Canvas Drawing ---
// All canvas rendering logic for the chart editor.

import type { EditorState } from "./useEditorState";
import { BPM_BEAT_MATCH_EPS, COLUMN_WIDTH, NOTE_SIZE, HEADER_HEIGHT, WAVEFORM_WIDTH, WAVEFORM_FIELD_GAP } from "./constants";
import { useSessionStore } from "@/stores/session";
import { routineColorHex } from "@/constants/routinePlayerColors";
import { getThemeBgHex, getThemePrimaryHex } from "@/utils/themeCssBridge";
import { playRhythmLaneApproach } from "@/utils/sfx";

export function useEditorCanvas(s: EditorState) {
  const session = useSessionStore();
  let ctx: CanvasRenderingContext2D | null = null;
  let animId = 0;
  /** Previous playhead beat while editor timeline is playing — used to detect row.beat crossings vs receptors. */
  let prevEditorPlaybackBeat: number | null = null;

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
    return (beat - s.scrollBeat.value) * s.zoom.value + HEADER_HEIGHT + 2;
  }

  function yToBeat(y: number): number {
    return (y - HEADER_HEIGHT - 2) / s.zoom.value + s.scrollBeat.value;
  }

  function snapBeat(beat: number): number {
    const step = 4 / s.quantize.value;
    return Math.round(beat / step) * step;
  }

  function beatToRow(beat: number): number {
    return Math.round(beat * 48);
  }

  function getCanvasFieldX(): number {
    if (!s.canvasRef.value) return 0;
    return (s.canvasRef.value.clientWidth - s.FIELD_WIDTH.value) / 2;
  }

  function getWaveformPanelX(fieldX: number): number {
    return Math.max(14, fieldX - WAVEFORM_WIDTH - WAVEFORM_FIELD_GAP);
  }

  function beatToTime(beat: number): number {
    const bpm0 = s.bpmChanges.value[0]?.bpm ?? s.bpm.value;
    if (beat < 0) {
      return (beat * 60) / bpm0;
    }
    if (s.bpmChanges.value.length <= 1) return (beat * 60) / s.bpm.value;
    let time = 0;
    let prevBeat = 0;
    let prevBpm = s.bpmChanges.value[0]?.bpm || s.bpm.value;
    for (let i = 1; i < s.bpmChanges.value.length; i++) {
      const change = s.bpmChanges.value[i];
      if (change.beat >= beat) break;
      time += ((change.beat - prevBeat) * 60) / prevBpm;
      prevBeat = change.beat;
      prevBpm = change.bpm;
    }
    time += ((beat - prevBeat) * 60) / prevBpm;
    return time;
  }

  /** Inverse of beatToTime: given elapsed seconds, return the beat position (multi-BPM aware) */
  function timeToBeat(seconds: number): number {
    const bpm0 = s.bpmChanges.value[0]?.bpm ?? s.bpm.value;
    if (seconds < 0) {
      return (seconds * bpm0) / 60;
    }
    if (s.bpmChanges.value.length <= 1) return (seconds * s.bpm.value) / 60;
    let remaining = seconds;
    let prevBeat = 0;
    let prevBpm = s.bpmChanges.value[0]?.bpm || s.bpm.value;
    for (let i = 1; i < s.bpmChanges.value.length; i++) {
      const change = s.bpmChanges.value[i];
      const segDuration = ((change.beat - prevBeat) * 60) / prevBpm;
      if (remaining <= segDuration) break;
      remaining -= segDuration;
      prevBeat = change.beat;
      prevBpm = change.bpm;
    }
    return prevBeat + (remaining * prevBpm) / 60;
  }

  // --- Shape drawing helpers (matching NoteField.vue gameplay style) ---

  const DANCE_TRACK_DIRECTIONS: Record<number, string[]> = {
    3: ["left", "down", "right"],
    4: ["left", "down", "up", "right"],
  };
  const PUMP_TRACK_DIRECTIONS: Record<number, Array<string | null>> = {
    5:  ["downLeft", "upLeft", null, "upRight", "downRight"],
    10: ["downLeft", "upLeft", null, "upRight", "downRight",
         "downLeft", "upLeft", null, "upRight", "downRight"],
  };
  const DIRECTION_ROTATIONS: Record<string, number> = {
    up:        0,
    upRight:   Math.PI / 4,
    right:     Math.PI / 2,
    downRight: (Math.PI * 3) / 4,
    down:      Math.PI,
    downLeft: -(Math.PI * 3) / 4,
    left:     -Math.PI / 2,
    upLeft:   -Math.PI / 4,
  };

  function buildArrowPath(c: CanvasRenderingContext2D, size: number) {
    const s2 = size * 0.5;
    c.beginPath();
    c.moveTo(0, -s2);
    c.lineTo(s2 * 0.88,  s2 * 0.15);
    c.lineTo(s2 * 0.40, -s2 * 0.05);
    c.lineTo(s2 * 0.40,  s2 * 0.72);
    c.lineTo(-s2 * 0.40, s2 * 0.72);
    c.lineTo(-s2 * 0.40, -s2 * 0.05);
    c.lineTo(-s2 * 0.88,  s2 * 0.15);
    c.closePath();
  }

  function buildDiamondPath(c: CanvasRenderingContext2D, size: number) {
    const half = size / 2;
    c.beginPath();
    c.moveTo(0, -half);
    c.lineTo(half, 0);
    c.lineTo(0, half);
    c.lineTo(-half, 0);
    c.closePath();
  }

  /** Draw a receptor key in the gameplay "default / neon" style. */
  function drawEditorReceptor(
    c: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    track: number,
    color: string,
    iconSize?: number,
  ) {
    const numTracks = s.NUM_TRACKS.value;
    const isPump = numTracks === 5 || numTracks === 10;
    const recSize = iconSize ?? NOTE_SIZE * 0.88;

    if (isPump) {
      const dir = PUMP_TRACK_DIRECTIONS[numTracks]?.[track] ?? null;
      if (dir === null) {
        // Center key → circle outline
        const radius = recSize * 0.30;
        c.save();
        c.shadowColor = color;
        c.shadowBlur = 8;
        c.lineWidth = 2;
        c.strokeStyle = "rgba(255,255,255,0.28)";
        c.beginPath();
        c.arc(cx, cy, radius, 0, Math.PI * 2);
        c.stroke();
        c.shadowBlur = 0;
        c.restore();
      } else {
        // Diagonal arrow with neon outline
        const rot = DIRECTION_ROTATIONS[dir] ?? 0;
        c.save();
        c.translate(cx, cy);
        c.rotate(rot);
        buildArrowPath(c, recSize);
        c.shadowColor = color;
        c.shadowBlur = 8;
        c.strokeStyle = "rgba(255,255,255,0.28)";
        c.lineWidth = 1.8;
        c.stroke();
        c.fillStyle = color + "12";
        c.fill();
        c.shadowBlur = 0;
        c.restore();
      }
    } else {
      // Dance mode: directional arrows
      const dirs = DANCE_TRACK_DIRECTIONS[numTracks];
      const dir = dirs?.[track] ?? null;
      if (dir) {
        const rot = DIRECTION_ROTATIONS[dir] ?? 0;
        c.save();
        c.translate(cx, cy);
        c.rotate(rot);
        buildArrowPath(c, recSize);
        c.shadowColor = color;
        c.shadowBlur = 8;
        c.strokeStyle = "rgba(255,255,255,0.28)";
        c.lineWidth = 1.8;
        c.stroke();
        c.fillStyle = color + "10";
        c.fill();
        c.shadowBlur = 0;
        c.restore();
      } else {
        // Fallback: hollow diamond
        c.save();
        c.translate(cx, cy);
        c.rotate(Math.PI / 4);
        buildDiamondPath(c, NOTE_SIZE * 0.7);
        c.strokeStyle = "rgba(255,255,255,0.28)";
        c.lineWidth = 1.8;
        c.stroke();
        c.fillStyle = color + "10";
        c.fill();
        c.restore();
      }
    }
  }

  // --- Note shape drawing (for placed notes on the chart) ---
  // Matches gameplay drawNote: arrows for dance/PIU directions, circle for PIU center.
  function drawEditorLaneShape(
    c: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    track: number,
    color: string,
    fillAlpha = 1,
    hollow = false,
  ) {
    const numTracks = s.NUM_TRACKS.value;
    const isPump = numTracks === 5 || numTracks === 10;
    const alphaHex = fillAlpha < 1 ? Math.round(fillAlpha * 255).toString(16).padStart(2, "0") : "";
    const noteSize = NOTE_SIZE * 0.88;

    if (isPump) {
      const dir = PUMP_TRACK_DIRECTIONS[numTracks]?.[track] ?? null;
      if (dir === null) {
        // PIU center: filled circle
        const radius = NOTE_SIZE * 0.26;
        c.save();
        c.translate(cx, cy);
        if (!hollow) {
          c.fillStyle = color + alphaHex;
          c.beginPath();
          c.arc(0, 0, radius, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "rgba(255,255,255,0.22)";
          c.beginPath();
          c.arc(-radius * 0.28, -radius * 0.32, radius * 0.38, 0, Math.PI * 2);
          c.fill();
        }
        c.strokeStyle = hollow ? color : "rgba(255,255,255,0.5)";
        c.lineWidth = hollow ? 2.2 : 1.4;
        c.beginPath();
        c.arc(0, 0, radius, 0, Math.PI * 2);
        c.stroke();
        c.restore();
        return;
      }
      // PIU directional: filled arrow
      const rot = DIRECTION_ROTATIONS[dir] ?? 0;
      c.save();
      c.translate(cx, cy);
      c.rotate(rot);
      buildArrowPath(c, noteSize);
      if (!hollow) {
        c.fillStyle = color + alphaHex;
        c.fill();
        // top highlight
        buildArrowPath(c, noteSize * 0.72);
        c.fillStyle = "rgba(255,255,255,0.22)";
        c.fill();
      }
      c.strokeStyle = hollow ? color : "rgba(255,255,255,0.45)";
      c.lineWidth = hollow ? 2.2 : 1.4;
      buildArrowPath(c, noteSize);
      c.stroke();
      c.restore();
      return;
    }

    // Dance mode: directional arrow
    const dirs = DANCE_TRACK_DIRECTIONS[numTracks];
    const dir = dirs?.[track] ?? null;
    if (dir) {
      const rot = DIRECTION_ROTATIONS[dir] ?? 0;
      c.save();
      c.translate(cx, cy);
      c.rotate(rot);
      buildArrowPath(c, noteSize);
      if (!hollow) {
        c.fillStyle = color + alphaHex;
        c.fill();
        buildArrowPath(c, noteSize * 0.72);
        c.fillStyle = "rgba(255,255,255,0.22)";
        c.fill();
      }
      c.strokeStyle = hollow ? color : "rgba(255,255,255,0.45)";
      c.lineWidth = hollow ? 2.2 : 1.4;
      buildArrowPath(c, noteSize);
      c.stroke();
      c.restore();
    } else {
      // Fallback: hollow diamond
      c.save();
      c.translate(cx, cy);
      c.rotate(Math.PI / 4);
      buildDiamondPath(c, noteSize * 0.8);
      if (!hollow) {
        c.fillStyle = color + alphaHex;
        c.fill();
        buildDiamondPath(c, noteSize * 0.56);
        c.fillStyle = "rgba(255,255,255,0.18)";
        c.fill();
      }
      c.strokeStyle = hollow ? color : "rgba(255,255,255,0.45)";
      c.lineWidth = hollow ? 2.2 : 1.4;
      buildDiamondPath(c, noteSize * 0.8);
      c.stroke();
      c.restore();
    }
  }

  // --- Waveform Panel ---
  function drawWaveformPanel(c: CanvasRenderingContext2D, fieldX: number, h: number) {
    const panelX = getWaveformPanelX(fieldX) + s.waveformPanelOffsetX.value;
    const panelW = WAVEFORM_WIDTH;
    const panelY = 0;
    const panelH = h;
    const centerX = panelX + panelW * 0.5;

    // Draw waveform peaks
    if (s.waveformPeaks.value.length > 0 && s.waveformDuration.value > 0) {
      const visibleTop = panelY;
      const visibleH = panelH;
      const maxAmp = (panelW - 8) * 0.4;

      const dur = s.waveformDuration.value;
      const peaks = s.waveformPeaks.value;
      for (let py = visibleTop; py < visibleTop + visibleH; py += 1) {
        const beat = yToBeat(py);
        const sec = beatToTime(beat) - s.metaOffset.value;
        const inFile = sec >= 0 && sec <= dur;
        let amp: number;
        if (!inFile) {
          amp = 0;
        } else {
          const idx = Math.min(
            peaks.length - 1,
            Math.max(0, Math.floor((sec / dur) * peaks.length))
          );
          amp = peaks[idx] || 0;
        }
        const minHalf = inFile ? 0.5 : 2.5;
        const halfW = Math.max(minHalf, amp * maxAmp);

        c.strokeStyle = inFile ? getThemePrimaryHex() : "rgba(255,255,255,0.14)";
        c.lineWidth = inFile ? 0.5 : 1;
        c.beginPath();
        c.moveTo(centerX - halfW, py);
        c.lineTo(centerX + halfW, py);
        c.stroke();
      }
    }

    // Red dashed offset line
    if (s.metaOffset.value !== 0) {
      const offsetBeat = timeToBeat(s.metaOffset.value);
      const offsetBeatY = beatToY(offsetBeat);
      if (offsetBeatY >= panelY && offsetBeatY <= panelY + panelH) {
        c.strokeStyle = "#ff5252";
        c.lineWidth = 1.5;
        c.setLineDash([3, 3]);
        c.beginPath();
        c.moveTo(panelX, offsetBeatY);
        c.lineTo(panelX + panelW, offsetBeatY);
        c.stroke();
        c.setLineDash([]);
      }
    }

    // Green dashed line at beat 0
    const beat0Y = beatToY(0);
    if (beat0Y >= panelY && beat0Y <= panelY + panelH) {
      c.strokeStyle = "#76ff03";
      c.lineWidth = 1.5;
      c.setLineDash([4, 3]);
      c.beginPath();
      c.moveTo(panelX, beat0Y);
      c.lineTo(panelX + panelW, beat0Y);
      c.stroke();
      c.setLineDash([]);
    }
  }

  /** Check if a point is within the waveform panel area */
  function isInWaveformPanel(x: number, y: number, fieldX: number, h: number): boolean {
    const panelX = getWaveformPanelX(fieldX) + s.waveformPanelOffsetX.value;
    const panelW = WAVEFORM_WIDTH;
    return x >= panelX && x <= panelX + panelW && y >= 0 && y <= h;
  }

  /** Allowed waveform panel offset range so the panel always stays inside the canvas viewport. */
  function getWaveformPanelOffsetBounds(): { min: number; max: number } {
    if (!s.canvasRef.value) return { min: 0, max: 0 };
    const viewportPadding = 6;
    const canvasWidth = s.canvasRef.value.clientWidth;
    const fieldX = getCanvasFieldX();
    const basePanelX = getWaveformPanelX(fieldX);
    const minPanelX = viewportPadding;
    const maxPanelX = Math.max(minPanelX, canvasWidth - WAVEFORM_WIDTH - viewportPadding);
    return {
      min: minPanelX - basePanelX,
      max: maxPanelX - basePanelX,
    };
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

    /** Match NoteField.vue pump-routine coloring: layer 1/2 from note, else infer from 5|5 panel halves. */
    function editorNoteColor(
      track: number,
      routineLayer: 1 | 2 | null | undefined,
    ): string {
      if (!isPumpRoutine) {
        return colColors[track % colColors.length];
      }
      if (routineLayer === 1 || routineLayer === 2) {
        const id = routineLayer === 2 ? session.routineP2ColorId : session.routineP1ColorId;
        return routineColorHex(id) ?? colColors[track % colColors.length];
      }
      if (numTracks === 10) {
        const id = track < 5 ? session.routineP1ColorId : session.routineP2ColorId;
        return routineColorHex(id) ?? colColors[track % colColors.length];
      }
      return colColors[track % colColors.length];
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
      } else if (currBeat > prevBeat + 1e-9) {
        const low = prevBeat - eps;
        const high = currBeat + eps;
        const tracksCrossed = new Set<number>();
        for (const row of s.noteRows.value) {
          const nb = row.beat;
          if (nb <= low || nb > high) continue;
          for (const n of row.notes) {
            if (n.noteType === "Fake") continue;
            tracksCrossed.add(n.track);
          }
        }
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
    const iStart = Math.ceil((startBeat - 1e-9) / step);
    const iEnd = Math.floor((endBeat + 1e-9) / step);
    for (let i = iStart; i <= iEnd; i++) {
      const b = Math.round(i * step * 1e6) / 1e6;
      const y = beatToY(b);
      if (y < HEADER_HEIGHT - 5 || y > h + 5) continue;

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
        const labelX = s.waveformPeaks.value.length > 0 ? getWaveformPanelX(fieldX) + WAVEFORM_WIDTH - 8 : fieldX - 10;
        ctx.fillText(String(measureNum), labelX, y);
      }

      const hasBpmHere = s.bpmChanges.value.some((c) => Math.abs(c.beat - b) < BPM_BEAT_MATCH_EPS);
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

    // Selection highlight (primary + Ctrl+right additive regions)
    function drawSelectionRect(
      c: CanvasRenderingContext2D,
      minRow: number,
      maxRow: number,
      minTrack: number,
      maxTrack: number,
    ) {
      const sy1 = beatToY(minRow / 48);
      const sy2 = beatToY(maxRow / 48);
      const sx1 = fieldX + minTrack * COLUMN_WIDTH;
      const sx2 = fieldX + (maxTrack + 1) * COLUMN_WIDTH;
      const selY = Math.min(sy1, sy2);
      const selH = Math.abs(sy2 - sy1) || 2;
      c.fillStyle = "rgba(124,77,255,0.12)";
      c.fillRect(sx1, selY, sx2 - sx1, selH);
      c.strokeStyle = "rgba(124,77,255,0.4)";
      c.lineWidth = 1.5;
      c.strokeRect(sx1, selY, sx2 - sx1, selH);
    }
    for (const extra of s.additionalSelections.value) {
      drawSelectionRect(ctx, extra.minRow, extra.maxRow, extra.minTrack, extra.maxTrack);
    }
    if (s.selectionStart.value !== null && s.selectionEnd.value !== null) {
      const minRow = Math.min(s.selectionStart.value, s.selectionEnd.value);
      const maxRow = Math.max(s.selectionStart.value, s.selectionEnd.value);
      let minTrack = 0,
        maxTrack = numTracks - 1;
      if (s.selectionTrackStart.value !== null && s.selectionTrackEnd.value !== null) {
        minTrack = Math.min(s.selectionTrackStart.value, s.selectionTrackEnd.value);
        maxTrack = Math.max(s.selectionTrackStart.value, s.selectionTrackEnd.value);
      }
      drawSelectionRect(ctx, minRow, maxRow, minTrack, maxTrack);
    }

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
      return false;
    }

    // BPM change markers (after selection fill so lines stay visible; thicker when inside selection band)
    bpmEditButtons.length = 0;
    bpmDeleteButtons.length = 0;
    for (let ci = 0; ci < s.bpmChanges.value.length; ci++) {
      const change = s.bpmChanges.value[ci];
      const cy = beatToY(change.beat);
      if (cy < HEADER_HEIGHT || cy > h) continue;
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
          drawEditorLaneShape(ctx, x + COLUMN_WIDTH / 2, y, note.track, holdColor);
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
          drawEditorLaneShape(ctx, x + COLUMN_WIDTH / 2, y, note.track, "#ce93d8", 0.16, true);
        } else if (note.noteType === "Fake") {
          drawEditorLaneShape(ctx, x + COLUMN_WIDTH / 2, y, note.track, "#78909c", 0.18, false);
          ctx.setLineDash([4, 4]);
          drawEditorLaneShape(ctx, x + COLUMN_WIDTH / 2, y, note.track, "#78909c", 0, true);
          ctx.setLineDash([]);
        } else {
          drawEditorLaneShape(ctx, x + COLUMN_WIDTH / 2, y, note.track, color);
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
      drawEditorReceptor(ctx, fieldX + i * COLUMN_WIDTH + COLUMN_WIDTH / 2, receptorY, i, rcol);
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
    if (s.selectionStart.value === null || s.selectionEnd.value === null) return false;
    const minRow = Math.min(s.selectionStart.value, s.selectionEnd.value);
    const maxRow = Math.max(s.selectionStart.value, s.selectionEnd.value);
    let minTrack = 0,
      maxTrack = s.NUM_TRACKS.value - 1;
    if (s.selectionTrackStart.value !== null && s.selectionTrackEnd.value !== null) {
      minTrack = Math.min(s.selectionTrackStart.value, s.selectionTrackEnd.value);
      maxTrack = Math.max(s.selectionTrackStart.value, s.selectionTrackEnd.value);
    }
    return row >= minRow && row <= maxRow && track >= minTrack && track <= maxTrack;
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
