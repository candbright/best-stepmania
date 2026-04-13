/**
 * render/skins.ts
 *
 * Per-skin shape drawing primitives for notes and pump panels.
 * All functions are pure canvas operations: they receive an explicit
 * `qualityLevel` parameter instead of closing over component state.
 *
 * Exported surface:
 *   buildArrowPath(c, size)
 *   buildDiamondPath(c, size)
 *   drawArrowWithSkin(c, cx, cy, size, direction, color, skin, qualityLevel, isReceptor?, pressed?)
 *   drawPumpPanelWithSkin(c, cx, cy, size, color, skin, isCenter, qualityLevel, isReceptor?, pressed?)
 */

import { getDirectionRotation, type ArrowDirection } from "./noteSchema";
import type { QualityLevel } from "./drawers";

// ── Path builders ─────────────────────────────────────────────────────────────

/** Standard upward-pointing arrow path centered at (0, 0). */
export function buildArrowPath(c: CanvasRenderingContext2D, size: number): void {
  const s = size * 0.5;
  c.beginPath();
  c.moveTo(0, -s);
  c.lineTo(s * 0.88, s * 0.15);
  c.lineTo(s * 0.40, -s * 0.05);
  c.lineTo(s * 0.40, s * 0.72);
  c.lineTo(-s * 0.40, s * 0.72);
  c.lineTo(-s * 0.40, -s * 0.05);
  c.lineTo(-s * 0.88, s * 0.15);
  c.closePath();
}

/** Diamond (rotated square) path centered at (0, 0). */
export function buildDiamondPath(c: CanvasRenderingContext2D, size: number): void {
  const half = size / 2;
  c.beginPath();
  c.moveTo(0, -half);
  c.lineTo(half, 0);
  c.lineTo(0, half);
  c.lineTo(-half, 0);
  c.closePath();
}

// ── Pump panel (center dot + corner diamonds) ─────────────────────────────────

/**
 * Draw a pump-mode panel element (corner arrow or center dot) with per-skin styling.
 * Canvas is saved/restored internally; caller must not have active transforms.
 */
export function drawPumpPanelWithSkin(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  skin: string,
  isCenter: boolean,
  qualityLevel: QualityLevel,
  isReceptor = false,
  pressed = false,
): void {
  c.save();
  c.translate(cx, cy);

  if (isCenter) {
    _drawPumpCenter(c, size, color, skin, qualityLevel, isReceptor, pressed);
    c.restore();
    return;
  }

  c.rotate(Math.PI / 4);
  _drawPumpCorner(c, size, color, skin, qualityLevel, isReceptor, pressed);
  c.restore();
}

function _drawPumpCenter(
  c: CanvasRenderingContext2D,
  size: number,
  color: string,
  skin: string,
  qualityLevel: QualityLevel,
  isReceptor: boolean,
  pressed: boolean,
): void {
  const radius = size * 0.28;

  if (skin === "neon") {
    if (qualityLevel !== "low") {
      c.shadowColor = color;
      c.shadowBlur = pressed ? 18 : isReceptor ? 8 : 12;
    }
    c.lineWidth = pressed ? 3 : 2;
    c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.22)") : color;
    c.beginPath();
    c.arc(0, 0, radius, 0, Math.PI * 2);
    c.stroke();
    if (!isReceptor) {
      c.fillStyle = color + "18";
      c.beginPath();
      c.arc(0, 0, radius - 1, 0, Math.PI * 2);
      c.fill();
    } else if (pressed) {
      c.fillStyle = color + "22";
      c.beginPath();
      c.arc(0, 0, radius - 1, 0, Math.PI * 2);
      c.fill();
    }
    c.shadowBlur = 0;
  } else if (skin === "retro") {
    c.fillStyle = isReceptor ? (pressed ? color + "30" : "rgba(255,248,220,0.05)") : color;
    c.beginPath();
    c.arc(0, 0, radius, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = pressed ? "rgba(255,250,220,0.98)" : "rgba(255,240,200,0.7)";
    c.lineWidth = isReceptor ? 2.5 : 3;
    c.beginPath();
    c.arc(0, 0, radius, 0, Math.PI * 2);
    c.stroke();
    if (!isReceptor) {
      c.fillStyle = "rgba(0,0,0,0.18)";
      c.beginPath();
      c.arc(0, 0, radius * 0.58, 0, Math.PI * 2);
      c.fill();
    }
  } else {
    c.fillStyle = isReceptor ? (pressed ? color + "22" : "rgba(255,255,255,0.04)") : color;
    c.beginPath();
    c.arc(0, 0, radius, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.18)";
    c.lineWidth = isReceptor ? (pressed ? 2.5 : 1.5) : 1.5;
    c.beginPath();
    c.arc(0, 0, radius, 0, Math.PI * 2);
    c.stroke();
    if (!isReceptor) {
      c.fillStyle = "rgba(255,255,255,0.18)";
      c.beginPath();
      c.arc(0, 0, radius * 0.45, 0, Math.PI * 2);
      c.fill();
    }
  }
}

function _drawPumpCorner(
  c: CanvasRenderingContext2D,
  size: number,
  color: string,
  skin: string,
  qualityLevel: QualityLevel,
  isReceptor: boolean,
  pressed: boolean,
): void {
  if (skin === "neon") {
    buildDiamondPath(c, size);
    if (qualityLevel !== "low") {
      c.shadowColor = color;
      c.shadowBlur = pressed ? 20 : isReceptor ? 8 : 14;
    }
    c.lineWidth = isReceptor ? (pressed ? 2.8 : 1.8) : 2.4;
    c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.22)") : color;
    c.stroke();
    if (!isReceptor) {
      c.fillStyle = color + "14";
      buildDiamondPath(c, size);
      c.fill();
    } else if (pressed) {
      c.fillStyle = color + "20";
      buildDiamondPath(c, size);
      c.fill();
    }
    c.shadowBlur = 0;
  } else if (skin === "retro") {
    buildDiamondPath(c, size);
    c.fillStyle = isReceptor ? (pressed ? color + "32" : "rgba(255,248,220,0.05)") : color;
    c.fill();
    c.strokeStyle = pressed ? "rgba(255,250,220,0.98)" : "rgba(255,240,200,0.75)";
    c.lineWidth = isReceptor ? 2.5 : 3;
    c.stroke();
    if (!isReceptor) {
      buildDiamondPath(c, size * 0.62);
      c.fillStyle = "rgba(0,0,0,0.2)";
      c.fill();
    }
  } else {
    buildDiamondPath(c, size);
    c.fillStyle = isReceptor ? (pressed ? color + "22" : "rgba(255,255,255,0.04)") : color;
    c.fill();
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.18)";
    c.lineWidth = isReceptor ? (pressed ? 2.4 : 1.4) : 1.2;
    c.stroke();
    if (!isReceptor) {
      buildDiamondPath(c, size * 0.76);
      c.fillStyle = "rgba(255,255,255,0.12)";
      c.fill();
    }
  }
}

// ── Arrow (dance-single / non-pump modes) ─────────────────────────────────────

/**
 * Draw a directional arrow with the given visual skin.
 * Canvas is saved/restored internally. `direction` controls the rotation.
 */
export function drawArrowWithSkin(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  direction: ArrowDirection,
  color: string,
  skin: string,
  qualityLevel: QualityLevel,
  isReceptor = false,
  pressed = false,
): void {
  c.save();
  c.translate(cx, cy);
  c.rotate(getDirectionRotation(direction));

  switch (skin) {
    case "neon":   _drawArrowNeon(c, size, color, qualityLevel, isReceptor, pressed); break;
    case "retro":  _drawArrowRetro(c, size, color, isReceptor, pressed); break;
    case "tetris": _drawArrowTetris(c, size, color, isReceptor, pressed); break;
    case "cyberpunk": _drawArrowCyberpunk(c, size, color, qualityLevel, isReceptor, pressed); break;
    case "mechanical": _drawArrowMechanical(c, size, color, isReceptor, pressed); break;
    case "musical": _drawArrowMusical(c, size, color, isReceptor, pressed); break;
    default: _drawArrowDefault(c, size, color, qualityLevel, isReceptor, pressed); break;
  }

  c.restore();
}

function _drawArrowNeon(
  c: CanvasRenderingContext2D, size: number, color: string,
  qualityLevel: QualityLevel, isReceptor: boolean, pressed: boolean,
): void {
  buildArrowPath(c, size);
  if (qualityLevel !== "low") {
    c.shadowColor = color;
    c.shadowBlur = pressed ? 22 : isReceptor ? 6 : 14;
  }
  c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.18)") : color;
  c.lineWidth = isReceptor ? (pressed ? 2.5 : 1.5) : 2.5;
  c.stroke();
  if (!isReceptor) {
    c.fillStyle = color + "15";
    c.fill();
  } else if (pressed) {
    c.fillStyle = color + "28";
    c.fill();
  }
  c.shadowBlur = 0;
}

function _drawArrowRetro(
  c: CanvasRenderingContext2D, size: number, color: string,
  isReceptor: boolean, pressed: boolean,
): void {
  buildArrowPath(c, size);
  if (isReceptor) {
    c.fillStyle = pressed ? color + "38" : "rgba(255,255,255,0.04)";
    c.fill();
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.22)";
    c.lineWidth = pressed ? 3 : 2;
    c.stroke();
  } else {
    c.fillStyle = color;
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.7)";
    c.lineWidth = 2.5;
    c.stroke();
    buildArrowPath(c, size * 0.65);
    c.fillStyle = "rgba(0,0,0,0.2)";
    c.fill();
  }
}

function _drawArrowTetris(
  c: CanvasRenderingContext2D, size: number, color: string,
  isReceptor: boolean, pressed: boolean,
): void {
  const blockSize = size * 0.2;
  const blocksX = [-1, 0, 1, 0, 0];
  const blocksY = [0, -1, 0, 0, 1];

  if (isReceptor) {
    c.fillStyle = pressed ? color + "40" : "rgba(255,255,255,0.05)";
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.2)";
  } else {
    c.fillStyle = color;
    c.strokeStyle = "rgba(0,0,0,0.5)";
  }
  c.lineWidth = 1.5;

  for (let i = 0; i < blocksX.length; i++) {
    c.beginPath();
    c.rect(
      blocksX[i]! * blockSize - blockSize / 2,
      blocksY[i]! * blockSize - blockSize / 2 - size * 0.1,
      blockSize, blockSize,
    );
    c.fill();
    c.stroke();
  }
  c.beginPath();
  c.moveTo(0, -size * 0.4);
  c.lineTo(-size * 0.3, -size * 0.1);
  c.lineTo(size * 0.3, -size * 0.1);
  c.closePath();
  c.fill();
  c.stroke();

  if (!isReceptor) {
    c.fillStyle = "rgba(255,255,255,0.3)";
    for (let i = 0; i < blocksX.length; i++) {
      c.fillRect(
        blocksX[i]! * blockSize - blockSize / 2 + 2,
        blocksY[i]! * blockSize - blockSize / 2 - size * 0.1 + 2,
        blockSize * 0.3, blockSize * 0.3,
      );
    }
  }
}

function _drawArrowCyberpunk(
  c: CanvasRenderingContext2D, size: number, color: string,
  qualityLevel: QualityLevel, isReceptor: boolean, pressed: boolean,
): void {
  buildArrowPath(c, size * 0.9);
  if (isReceptor) {
    c.fillStyle = pressed ? color + "50" : "rgba(255,255,255,0.05)";
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.2)";
    c.lineWidth = 2;
  } else {
    c.fillStyle = "#111";
    c.strokeStyle = color;
    c.lineWidth = 3;
    if (qualityLevel !== "low") {
      c.shadowColor = color;
      c.shadowBlur = 10;
    }
  }
  c.fill();
  c.stroke();
  c.shadowBlur = 0;

  if (!isReceptor || pressed) {
    c.beginPath();
    c.moveTo(0, -size * 0.2);
    c.lineTo(0, size * 0.2);
    c.moveTo(-size * 0.15, 0);
    c.lineTo(size * 0.15, 0);
    c.strokeStyle = isReceptor ? color : "rgba(255,255,255,0.6)";
    c.lineWidth = 1;
    c.stroke();
  }
}

function _drawArrowMechanical(
  c: CanvasRenderingContext2D, size: number, color: string,
  isReceptor: boolean, pressed: boolean,
): void {
  c.beginPath();
  c.moveTo(0, -size * 0.45);
  c.lineTo(-size * 0.4, 0);
  c.lineTo(-size * 0.2, 0);
  c.lineTo(-size * 0.2, size * 0.3);
  c.lineTo(size * 0.2, size * 0.3);
  c.lineTo(size * 0.2, 0);
  c.lineTo(size * 0.4, 0);
  c.closePath();

  if (isReceptor) {
    c.fillStyle = pressed ? color + "30" : "rgba(255,255,255,0.05)";
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.2)";
  } else {
    c.fillStyle = color;
    c.strokeStyle = "#222";
  }
  c.lineWidth = 2;
  c.fill();
  c.stroke();

  if (!isReceptor) {
    c.fillStyle = "#222";
    const rivets: [number, number][] = [
      [0, -size * 0.2], [-size * 0.2, 0], [size * 0.2, 0], [0, size * 0.15],
    ];
    for (const [rx, ry] of rivets) {
      c.beginPath();
      c.arc(rx, ry, size * 0.05, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.4)";
      c.fillRect(rx - 1, ry - 1, 2, 2);
      c.fillStyle = "#222";
    }
  }
}

function _drawArrowMusical(
  c: CanvasRenderingContext2D, size: number, color: string,
  isReceptor: boolean, pressed: boolean,
): void {
  c.beginPath();
  c.moveTo(0, -size * 0.4);
  c.bezierCurveTo(size * 0.2, -size * 0.3, size * 0.4, -size * 0.1, size * 0.4, size * 0.1);
  c.lineTo(size * 0.1, size * 0.1);
  c.lineTo(size * 0.1, size * 0.3);
  c.arc(0, size * 0.3, size * 0.15, 0, Math.PI * 2);
  c.lineTo(-size * 0.1, -size * 0.1);
  c.lineTo(-size * 0.3, -size * 0.1);
  c.closePath();

  if (isReceptor) {
    c.fillStyle = pressed ? color + "35" : "rgba(255,255,255,0.05)";
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.2)";
    c.lineWidth = 1.5;
  } else {
    c.fillStyle = color;
    c.strokeStyle = "rgba(255,255,255,0.5)";
    c.lineWidth = 2;
  }
  c.fill();
  c.stroke();

  if (!isReceptor) {
    c.beginPath();
    c.moveTo(0, -size * 0.3);
    c.bezierCurveTo(size * 0.1, -size * 0.2, size * 0.3, 0, size * 0.25, size * 0.05);
    c.strokeStyle = "rgba(255,255,255,0.4)";
    c.lineWidth = 2;
    c.stroke();
  }
}

function _drawArrowDefault(
  c: CanvasRenderingContext2D, size: number, color: string,
  qualityLevel: QualityLevel, isReceptor: boolean, pressed: boolean,
): void {
  buildArrowPath(c, size);
  if (isReceptor) {
    if (pressed && qualityLevel !== "low") {
      c.shadowColor = color;
      c.shadowBlur = 18;
    }
    c.fillStyle = pressed ? color + "32" : "rgba(255,255,255,0.04)";
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.18)";
    c.lineWidth = pressed ? 2.5 : 1.5;
    c.stroke();
  } else {
    if (qualityLevel !== "low") {
      c.shadowColor = color;
      c.shadowBlur = qualityLevel === "high" ? 10 : 5;
    }
    c.fillStyle = color;
    c.fill();
    c.shadowBlur = 0;
    buildArrowPath(c, size * 0.72);
    c.fillStyle = "rgba(255,255,255,0.28)";
    c.fill();
  }
}
