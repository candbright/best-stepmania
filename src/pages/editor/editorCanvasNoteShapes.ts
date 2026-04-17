// Editor canvas: receptor and note lane shapes (aligned with NoteField gameplay style).

import { NOTE_SIZE } from "./constants";

const DANCE_TRACK_DIRECTIONS: Record<number, string[]> = {
  3: ["left", "down", "right"],
  4: ["left", "down", "up", "right"],
};
const PUMP_TRACK_DIRECTIONS: Record<number, Array<string | null>> = {
  5: ["downLeft", "upLeft", null, "upRight", "downRight"],
  10: [
    "downLeft", "upLeft", null, "upRight", "downRight",
    "downLeft", "upLeft", null, "upRight", "downRight",
  ],
};
const DIRECTION_ROTATIONS: Record<string, number> = {
  up: 0,
  upRight: Math.PI / 4,
  right: Math.PI / 2,
  downRight: (Math.PI * 3) / 4,
  down: Math.PI,
  downLeft: -(Math.PI * 3) / 4,
  left: -Math.PI / 2,
  upLeft: -Math.PI / 4,
};

export function buildArrowPath(c: CanvasRenderingContext2D, size: number) {
  const s2 = size * 0.5;
  c.beginPath();
  c.moveTo(0, -s2);
  c.lineTo(s2 * 0.88, s2 * 0.15);
  c.lineTo(s2 * 0.4, -s2 * 0.05);
  c.lineTo(s2 * 0.4, s2 * 0.72);
  c.lineTo(-s2 * 0.4, s2 * 0.72);
  c.lineTo(-s2 * 0.4, -s2 * 0.05);
  c.lineTo(-s2 * 0.88, s2 * 0.15);
  c.closePath();
}

export function buildDiamondPath(c: CanvasRenderingContext2D, size: number) {
  const half = size / 2;
  c.beginPath();
  c.moveTo(0, -half);
  c.lineTo(half, 0);
  c.lineTo(0, half);
  c.lineTo(-half, 0);
  c.closePath();
}

/** Draw a receptor key in the gameplay "default / neon" style. */
export function drawEditorReceptor(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  track: number,
  color: string,
  numTracks: number,
  iconSize?: number,
) {
  const isPump = numTracks === 5 || numTracks === 10;
  const recSize = iconSize ?? NOTE_SIZE * 0.88;

  if (isPump) {
    const dir = PUMP_TRACK_DIRECTIONS[numTracks]?.[track] ?? null;
    if (dir === null) {
      const half = recSize * 0.3;
      c.save();
      c.shadowColor = color;
      c.shadowBlur = 8;
      c.lineWidth = 2;
      c.strokeStyle = "rgba(255,255,255,0.28)";
      c.strokeRect(cx - half, cy - half, half * 2, half * 2);
      c.shadowBlur = 0;
      c.restore();
    } else {
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

/** Placed notes on the chart — PIU center = square; other lanes = arrows (dance) / arrows + diamond fallback. */
export function drawEditorLaneShape(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  track: number,
  color: string,
  numTracks: number,
  fillAlpha = 1,
  hollow = false,
) {
  const isPump = numTracks === 5 || numTracks === 10;
  const alphaHex = fillAlpha < 1 ? Math.round(fillAlpha * 255).toString(16).padStart(2, "0") : "";
  const noteSize = NOTE_SIZE * 0.88;

  if (isPump) {
    const dir = PUMP_TRACK_DIRECTIONS[numTracks]?.[track] ?? null;
    if (dir === null) {
      const side = NOTE_SIZE * 0.52;
      const half = side / 2;
      c.save();
      c.translate(cx, cy);
      if (!hollow) {
        c.fillStyle = color + alphaHex;
        c.fillRect(-half, -half, side, side);
        const inner = side * 0.72;
        const ih = inner / 2;
        c.fillStyle = "rgba(255,255,255,0.22)";
        c.fillRect(-ih, -ih, inner, inner);
      }
      c.strokeStyle = hollow ? color : "rgba(255,255,255,0.5)";
      c.lineWidth = hollow ? 2.2 : 1.4;
      c.strokeRect(-half, -half, side, side);
      c.restore();
      return;
    }
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
    return;
  }

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
