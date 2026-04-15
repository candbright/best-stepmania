// Editor canvas: waveform panel drawing and hit geometry.

import { WAVEFORM_WIDTH, WAVEFORM_FIELD_GAP } from "./constants";
import { getThemePrimaryHex } from "@/utils/themeCssBridge";

export function waveformPanelLeftX(fieldX: number): number {
  return Math.max(14, fieldX - WAVEFORM_WIDTH - WAVEFORM_FIELD_GAP);
}

export interface EditorWaveformPanelDrawArgs {
  c: CanvasRenderingContext2D;
  fieldX: number;
  h: number;
  panelOffsetX: number;
  waveformMinMax: Float32Array | readonly number[];
  waveformDuration: number;
  metaOffset: number;
  yToBeat: (y: number) => number;
  beatToTime: (beat: number) => number;
  timeToBeat: (sec: number) => number;
  beatToY: (beat: number) => number;
}

export function drawEditorWaveformPanel(a: EditorWaveformPanelDrawArgs) {
  const {
    c,
    fieldX,
    h,
    panelOffsetX,
    waveformMinMax,
    waveformDuration,
    metaOffset,
    yToBeat,
    beatToTime,
    timeToBeat,
    beatToY,
  } = a;

  const panelX = waveformPanelLeftX(fieldX) + panelOffsetX;
  const panelW = WAVEFORM_WIDTH;
  const panelY = 0;
  const panelH = h;
  const centerX = panelX + panelW * 0.5;

  if (waveformMinMax.length >= 2 && waveformDuration > 0) {
    const visibleTop = panelY;
    const visibleBottom = panelY + panelH;
    const sampleStepPx = 2; // lower = smoother but slower
    const scaleX = (panelW - 10) * 0.46;
    const dur = waveformDuration;
    const mm = waveformMinMax;
    const nBuckets = mm.length >> 1;
    const strokeIn = getThemePrimaryHex();
    const strokeOut = "rgba(255,255,255,0.15)";

    const sampleCount = Math.max(1, Math.ceil((visibleBottom - visibleTop) / sampleStepPx));
    const xsMin = new Float32Array(sampleCount);
    const xsMax = new Float32Array(sampleCount);
    const inFileMask = new Uint8Array(sampleCount);

    // Pre-sample the envelope once (avoids repeated beat->time conversion per draw pass).
    for (let si = 0; si < sampleCount; si++) {
      const py = visibleTop + si * sampleStepPx;
      const beat = yToBeat(py);
      const sec = beatToTime(beat) - metaOffset;
      if (sec < 0 || sec > dur) {
        xsMin[si] = centerX;
        xsMax[si] = centerX;
        inFileMask[si] = 0;
        continue;
      }
      const idx = Math.min(nBuckets - 1, Math.max(0, Math.floor((sec / dur) * nBuckets)));
      const lo = mm[idx * 2]!;
      const hi = mm[idx * 2 + 1]!;
      xsMin[si] = centerX + lo * scaleX;
      xsMax[si] = centerX + hi * scaleX;
      inFileMask[si] = 1;
    }

    c.save();
    c.beginPath();
    let first = true;
    for (let si = 0; si < sampleCount; si++) {
      const py = visibleTop + si * sampleStepPx;
      const mx = xsMax[si]!;
      if (first) {
        c.moveTo(mx, py);
        first = false;
      } else {
        c.lineTo(mx, py);
      }
    }
    for (let si = sampleCount - 1; si >= 0; si--) {
      const py = visibleTop + si * sampleStepPx;
      const mn = xsMin[si]!;
      c.lineTo(mn, py);
    }
    c.closePath();
    c.globalAlpha = 0.1;
    c.fillStyle = strokeIn;
    c.fill();
    c.globalAlpha = 1;
    c.restore();

    c.lineWidth = 1;
    c.lineJoin = "round";
    c.lineCap = "round";

    function strokeSegmentedPolyline(edge: "min" | "max") {
      let segIn: boolean | null = null;
      let started = false;
      for (let si = 0; si < sampleCount; si++) {
        const py = visibleTop + si * sampleStepPx;
        const x = edge === "max" ? xsMax[si]! : xsMin[si]!;
        const inFile = inFileMask[si] === 1;
        if (segIn === null) {
          segIn = inFile;
          c.beginPath();
          c.moveTo(x, py);
          started = true;
          continue;
        }
        if (inFile !== segIn) {
          c.strokeStyle = segIn ? strokeIn : strokeOut;
          c.stroke();
          segIn = inFile;
          c.beginPath();
          c.moveTo(x, py);
          started = true;
          continue;
        }
        c.lineTo(x, py);
      }
      if (started) {
        c.strokeStyle = segIn ? strokeIn : strokeOut;
        c.stroke();
      }
    }

    strokeSegmentedPolyline("max");
    strokeSegmentedPolyline("min");
  }

  if (metaOffset !== 0) {
    const offsetBeat = timeToBeat(metaOffset);
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

export function isPointInEditorWaveformPanel(
  x: number,
  y: number,
  fieldX: number,
  h: number,
  panelOffsetX: number,
): boolean {
  const panelX = waveformPanelLeftX(fieldX) + panelOffsetX;
  const panelW = WAVEFORM_WIDTH;
  return x >= panelX && x <= panelX + panelW && y >= 0 && y <= h;
}

export function getEditorWaveformPanelOffsetBounds(
  canvasWidth: number,
  fieldX: number,
): { min: number; max: number } {
  const viewportPadding = 6;
  const basePanelX = waveformPanelLeftX(fieldX);
  const minPanelX = viewportPadding;
  const maxPanelX = Math.max(minPanelX, canvasWidth - WAVEFORM_WIDTH - viewportPadding);
  return {
    min: minPanelX - basePanelX,
    max: maxPanelX - basePanelX,
  };
}
