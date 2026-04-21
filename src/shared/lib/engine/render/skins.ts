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

/** Approx. axis-aligned bbox of `buildArrowPath(size)` in `size` units (width × height). */
const DEFAULT_ARROW_WIDTH_U = 0.88;
const DEFAULT_ARROW_HEIGHT_U = 0.86;
const SKIN_KEY_FRAME_U = Math.min(DEFAULT_ARROW_WIDTH_U, DEFAULT_ARROW_HEIGHT_U);

function getPumpCenterFrameScale(skin: string): number {
  if (skin === "default" || skin === "neon" || skin === "mechanical") {
    // Visual-balance: center key should match directional keys' perceived size.
    return 0.9;
  }
  return 1;
}

/**
 * Uniform scale about the origin so a glyph whose native AABB is `nativeW·size × nativeH·size`
 * fits inside the default arrow box (`DEFAULT_ARROW_WIDTH_U·size × DEFAULT_ARROW_HEIGHT_U·size`).
 * One axis touches the box edge; the other stays inside. Caller must `c.restore()` after drawing.
 */
function applyUniformScaleToDefaultArrowBox(
  c: CanvasRenderingContext2D,
  nativeW: number,
  nativeH: number,
): void {
  const k = Math.min(
    DEFAULT_ARROW_WIDTH_U / nativeW,
    DEFAULT_ARROW_HEIGHT_U / nativeH,
  );
  c.save();
  c.scale(k, k);
}

/**
 * Uniformly fit a glyph into a square key frame so all skin variants align to
 * the same per-lane box size and center anchor.
 */
export function computeSkinSquareScaleXY(nativeW: number, nativeH: number): { sx: number; sy: number } {
  return {
    sx: SKIN_KEY_FRAME_U / nativeW,
    sy: SKIN_KEY_FRAME_U / nativeH,
  };
}

function applyUniformScaleToSkinKeySquare(
  c: CanvasRenderingContext2D,
  nativeW: number,
  nativeH: number,
): void {
  const { sx, sy } = computeSkinSquareScaleXY(nativeW, nativeH);
  c.save();
  c.scale(sx, sy);
}

function applyArrowPathToSkinKeySquare(c: CanvasRenderingContext2D): void {
  applyUniformScaleToSkinKeySquare(c, DEFAULT_ARROW_WIDTH_U, DEFAULT_ARROW_HEIGHT_U);
}

export function getTetrisMinoCenters(cell: number): ReadonlyArray<readonly [number, number]> {
  return [
    [-cell, -0.5 * cell],
    [0, -0.5 * cell],
    [cell, -0.5 * cell],
    [0, 0.5 * cell],
  ] as const;
}

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

  // All corner glyphs are axis-aligned squares (no 45° canvas rotation).
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
  // Keep center-key visual scale aligned with the four directional keys.
  const radius = size * 0.34;
  const centerFrame = SKIN_KEY_FRAME_U * size * getPumpCenterFrameScale(skin);
  const centerHalf = centerFrame / 2;

  if (skin === "neon") {
    const cw = centerFrame;
    const ch = centerFrame;
    const hw = cw / 2;
    const hh = ch / 2;
    if (qualityLevel !== "low") {
      c.shadowColor = color;
      c.shadowBlur = pressed ? 18 : isReceptor ? 8 : 12;
    }
    c.lineWidth = pressed ? 3 : 2;
    c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.22)") : color;
    c.strokeRect(-hw, -hh, cw, ch);
    if (!isReceptor) {
      c.fillStyle = color + "18";
      c.fillRect(-(hw - 1), -(hh - 1), cw - 2, ch - 2);
    } else if (pressed) {
      c.fillStyle = color + "22";
      c.fillRect(-(hw - 1), -(hh - 1), cw - 2, ch - 2);
    }
    c.shadowBlur = 0;
  } else if (skin === "retro") {
    const cw = SKIN_KEY_FRAME_U * size;
    const ch = SKIN_KEY_FRAME_U * size;
    const hw = cw / 2;
    const hh = ch / 2;
    c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.22)") : color;
    c.lineWidth = isReceptor ? 2.5 : 3;
    c.strokeRect(-hw, -hh, cw, ch);
  } else if (skin === "musical") {
    /** Native pump-center AABB ~0.45 x 0.62 in `size` units (radius = 0.4 * size). */
    applyUniformScaleToDefaultArrowBox(c, 0.45, 0.62);
    /** 符头为圆角矩形 + 竖杆，避免圆形符头；与方向键音符皮肤一致。 */
    const headW = radius * 1.12;
    const headH = radius * 0.58;
    const headY = radius * 0.08;
    const stemX = headW * 0.38;
    const stemTopY = -radius * 1.18;
    const rr = Math.min(5, headH * 0.22);

    c.save();
    c.translate(0, -radius * 0.06);

    c.beginPath();
    c.roundRect(-headW / 2, headY - headH / 2, headW, headH, rr);
    if (isReceptor) {
      c.fillStyle = pressed ? color + "30" : "rgba(255,255,255,0.05)";
      c.strokeStyle = pressed ? color : "rgba(255,255,255,0.22)";
      c.lineWidth = pressed ? 2.2 : 1.5;
    } else {
      c.fillStyle = color;
      c.strokeStyle = "rgba(255,255,255,0.5)";
      c.lineWidth = 1.8;
    }
    c.fill();
    c.stroke();

    c.beginPath();
    c.moveTo(stemX, headY - headH * 0.35);
    c.lineTo(stemX, stemTopY);
    c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.2)") : "rgba(255,255,255,0.55)";
    c.lineWidth = isReceptor ? 1.8 : 2.2;
    c.stroke();

    if (!isReceptor) {
      c.fillStyle = "rgba(255,255,255,0.2)";
      c.fillRect(-headW * 0.35, headY - headH * 0.28, headW * 0.28, headH * 0.22);
    }

    c.restore();
    c.restore();
  } else if (skin === "default") {
    const cw = centerFrame;
    const ch = centerFrame;
    const hw = cw / 2;
    const hh = ch / 2;
    c.fillStyle = isReceptor ? (pressed ? color + "22" : "rgba(255,255,255,0.04)") : color;
    c.fillRect(-hw, -hh, cw, ch);
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.18)";
    c.lineWidth = isReceptor ? (pressed ? 2.5 : 1.5) : 1.5;
    c.strokeRect(-hw, -hh, cw, ch);
    if (!isReceptor) {
      const inS = Math.min(cw, ch) * 0.45;
      const ih = inS / 2;
      c.fillStyle = "rgba(255,255,255,0.18)";
      c.fillRect(-ih, -ih, inS, inS);
    }
  } else if (skin === "tetris") {
    applyUniformScaleToDefaultArrowBox(c, 0.46, 0.46);
    const cell = radius * 0.58;
    const rr = Math.max(1.1, cell * 0.12);
    const strokeM = isReceptor ? (pressed ? color : "rgba(255,255,255,0.28)") : "rgba(0,0,0,0.55)";
    const baseFill = isReceptor ? (pressed ? color + "40" : "rgba(255,255,255,0.08)") : color;
    const bevelShade = isReceptor ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.24)";
    const seam = isReceptor ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.3)";

    for (const ox of [-cell / 2, cell / 2] as const) {
      for (const oy of [-cell / 2, cell / 2] as const) {
        const x = ox - cell / 2;
        const y = oy - cell / 2;
        c.beginPath();
        c.roundRect(x, y, cell, cell, rr);
        c.fillStyle = baseFill;
        c.fill();
        c.strokeStyle = strokeM;
        c.lineWidth = isReceptor ? 1.35 : 1.6;
        c.stroke();

        c.fillStyle = "rgba(255,255,255,0.24)";
        c.fillRect(x + cell * 0.1, y + cell * 0.1, cell * 0.52, cell * 0.18);
        c.fillStyle = bevelShade;
        c.fillRect(x + cell * 0.12, y + cell * 0.72, cell * 0.76, cell * 0.14);
      }
    }
    c.strokeStyle = seam;
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(0, -cell);
    c.lineTo(0, cell);
    c.moveTo(-cell, 0);
    c.lineTo(cell, 0);
    c.stroke();
    c.restore();
  } else if (skin === "cyberpunk") {
    applyUniformScaleToDefaultArrowBox(c, 0.45, 0.45);
    const h = radius * 1.12;
    const w = radius * 1.12;
    const ch = Math.min(w, h) * 0.22;
    c.beginPath();
    c.moveTo(-w / 2 + ch, -h / 2);
    c.lineTo(w / 2 - ch, -h / 2);
    c.lineTo(w / 2, -h / 2 + ch);
    c.lineTo(w / 2, h / 2 - ch);
    c.lineTo(w / 2 - ch, h / 2);
    c.lineTo(-w / 2 + ch, h / 2);
    c.lineTo(-w / 2, h / 2 - ch);
    c.lineTo(-w / 2, -h / 2 + ch);
    c.closePath();
    if (isReceptor) {
      c.fillStyle = pressed ? color + "36" : "rgba(6,10,18,0.6)";
      c.fill();
      c.strokeStyle = pressed ? color : "rgba(255,255,255,0.32)";
      c.lineWidth = 2;
      c.stroke();
    } else {
      c.fillStyle = "rgba(8,12,22,0.92)";
      c.fill();
      if (qualityLevel !== "low") {
        c.shadowColor = color;
        c.shadowBlur = qualityLevel === "high" ? 9 : 5;
      }
      c.strokeStyle = color;
      c.lineWidth = 2.2;
      c.stroke();
      c.shadowBlur = 0;
      c.save();
      c.scale(0.84, 0.84);
      c.beginPath();
      c.moveTo(-w / 2 + ch, -h / 2);
      c.lineTo(w / 2 - ch, -h / 2);
      c.lineTo(w / 2, -h / 2 + ch);
      c.lineTo(w / 2, h / 2 - ch);
      c.lineTo(w / 2 - ch, h / 2);
      c.lineTo(-w / 2 + ch, h / 2);
      c.lineTo(-w / 2, h / 2 - ch);
      c.lineTo(-w / 2, -h / 2 + ch);
      c.closePath();
      c.strokeStyle = "rgba(255,80,255,0.38)";
      c.lineWidth = 1;
      c.stroke();
      c.restore();
    }
    const tick = radius * 0.16;
    c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.35)") : "rgba(0,255,255,0.42)";
    c.lineWidth = 0.85;
    c.beginPath();
    c.moveTo(-w / 2, -h / 2 + ch * 0.6);
    c.lineTo(-w / 2 - tick, -h / 2 + ch * 0.6);
    c.moveTo(w / 2, -h / 2 + ch * 0.6);
    c.lineTo(w / 2 + tick, -h / 2 + ch * 0.6);
    c.moveTo(-w / 2 + ch * 0.55, h / 2);
    c.lineTo(-w / 2 + ch * 0.55, h / 2 + tick * 0.75);
    c.moveTo(w / 2 - ch * 0.55, h / 2);
    c.lineTo(w / 2 - ch * 0.55, h / 2 + tick * 0.75);
    c.stroke();
    c.restore();
  } else if (skin === "mechanical") {
    const pw = centerFrame;
    const ph = centerFrame;
    const rx = 2.5;
    c.beginPath();
    c.roundRect(-pw / 2, -ph / 2, pw, ph, rx);
    const plate = isReceptor
      ? (pressed ? color + "26" : "rgba(255,255,255,0.06)")
      : color;
    const edge = isReceptor ? (pressed ? color : "rgba(255,255,255,0.26)") : "#1a1a1a";
    c.fillStyle = plate;
    c.fill();
    c.strokeStyle = edge;
    c.lineWidth = isReceptor ? 2 : 2.2;
    c.stroke();
    c.strokeStyle = isReceptor ? "rgba(255,255,255,0.18)" : "rgba(20,20,20,0.55)";
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(-pw / 2 + 4, 0);
    c.lineTo(pw / 2 - 4, 0);
    c.stroke();
    c.fillStyle = isReceptor ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.16)";
    c.fillRect(-pw * 0.34, -ph * 0.32, pw * 0.5, ph * 0.14);
    const rivetR = centerHalf * 0.18;
    const inset = rivetR * 1.5;
    for (const [sx, sy] of [
      [-pw / 2 + inset, -ph / 2 + inset],
      [pw / 2 - inset, -ph / 2 + inset],
      [-pw / 2 + inset, ph / 2 - inset],
      [pw / 2 - inset, ph / 2 - inset],
    ] as const) {
      c.beginPath();
      c.arc(sx, sy, rivetR, 0, Math.PI * 2);
      c.fillStyle = isReceptor ? "rgba(42,42,42,0.9)" : "#2e2e2e";
      c.fill();
      c.strokeStyle = isReceptor ? "rgba(255,255,255,0.3)" : "#141414";
      c.lineWidth = 0.85;
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.32)";
      c.fillRect(sx - rivetR * 0.3, sy - rivetR * 0.3, rivetR * 0.45, rivetR * 0.28);
    }
    c.restore();
  } else {
    const cw = SKIN_KEY_FRAME_U * size;
    const ch = SKIN_KEY_FRAME_U * size;
    const hw = cw / 2;
    const hh = ch / 2;
    c.fillStyle = isReceptor ? (pressed ? color + "22" : "rgba(255,255,255,0.04)") : color;
    c.fillRect(-hw, -hh, cw, ch);
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.18)";
    c.lineWidth = isReceptor ? (pressed ? 2.5 : 1.5) : 1.5;
    c.strokeRect(-hw, -hh, cw, ch);
    if (!isReceptor) {
      const inS = Math.min(cw, ch) * 0.45;
      const ih = inS / 2;
      c.fillStyle = "rgba(255,255,255,0.18)";
      c.fillRect(-ih, -ih, inS, inS);
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
  const cornerW = SKIN_KEY_FRAME_U * size;
  const cornerH = SKIN_KEY_FRAME_U * size;
  const cornerHalfW = cornerW / 2;
  const cornerHalfH = cornerH / 2;

  if (skin === "neon") {
    if (qualityLevel !== "low") {
      c.shadowColor = color;
      c.shadowBlur = pressed ? 20 : isReceptor ? 8 : 14;
    }
    if (!isReceptor) {
      c.fillStyle = color + "14";
      c.fillRect(-cornerHalfW, -cornerHalfH, cornerW, cornerH);
    } else if (pressed) {
      c.fillStyle = color + "20";
      c.fillRect(-cornerHalfW, -cornerHalfH, cornerW, cornerH);
    }
    c.lineWidth = isReceptor ? (pressed ? 2.8 : 1.8) : 2.4;
    c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.22)") : color;
    c.strokeRect(-cornerHalfW, -cornerHalfH, cornerW, cornerH);
    c.shadowBlur = 0;
  } else if (skin === "retro") {
    c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.22)") : color;
    c.lineWidth = isReceptor ? 2.5 : 3;
    c.strokeRect(-cornerHalfW, -cornerHalfH, cornerW, cornerH);
  } else {
    c.fillStyle = isReceptor ? (pressed ? color + "22" : "rgba(255,255,255,0.04)") : color;
    c.fillRect(-cornerHalfW, -cornerHalfH, cornerW, cornerH);
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.18)";
    c.lineWidth = isReceptor ? (pressed ? 2.4 : 1.4) : 1.2;
    c.strokeRect(-cornerHalfW, -cornerHalfH, cornerW, cornerH);
    if (!isReceptor) {
      const inS = Math.min(cornerW, cornerH) * 0.76;
      const ih = inS / 2;
      c.fillStyle = "rgba(255,255,255,0.12)";
      c.fillRect(-ih, -ih, inS, inS);
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
  keepParallel = false,
): void {
  c.save();
  c.translate(cx, cy);
  // Retro uses on-screen axis-aligned squares; rotating would make them look diamond-shaped.
  if (skin !== "retro" && !keepParallel) {
    c.rotate(getDirectionRotation(direction));
  }

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
  applyArrowPathToSkinKeySquare(c);
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
  c.restore();
}

function _drawArrowRetro(
  c: CanvasRenderingContext2D, size: number, color: string,
  isReceptor: boolean, pressed: boolean,
): void {
  const w = SKIN_KEY_FRAME_U * size;
  const h = SKIN_KEY_FRAME_U * size;
  c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.22)") : color;
  c.lineWidth = isReceptor ? (pressed ? 3 : 2) : 2.5;
  c.strokeRect(-w / 2, -h / 2, w, h);
}

/** Up-pointing T-tetromino style: three blocks on top, one stem (classic “arrow” of minos). */
function _drawArrowTetris(
  c: CanvasRenderingContext2D, size: number, color: string,
  isReceptor: boolean, pressed: boolean,
): void {
  // Keep Tetris skin inside the shared square lane frame.
  applyUniformScaleToSkinKeySquare(c, 0.7, 0.56);
  const cell = size * 0.225;
  const r = Math.max(1.2, cell * 0.12);
  const strokeMino = isReceptor ? (pressed ? color : "rgba(255,255,255,0.3)") : "rgba(0,0,0,0.5)";
  const baseFill = isReceptor ? (pressed ? color + "44" : "rgba(255,255,255,0.07)") : color;

  const centers = getTetrisMinoCenters(cell);

  const drawMino = (mx: number, my: number) => {
    const x = mx - cell / 2;
    const y = my - cell / 2;
    c.beginPath();
    c.roundRect(x, y, cell, cell, r);
    c.fillStyle = baseFill;
    c.fill();
    c.strokeStyle = strokeMino;
    c.lineWidth = isReceptor ? 1.45 : 1.65;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.23)";
    c.fillRect(x + cell * 0.1, y + cell * 0.1, cell * 0.52, cell * 0.2);
    c.fillStyle = isReceptor ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.24)";
    c.fillRect(x + cell * 0.14, y + cell * 0.72, cell * 0.72, cell * 0.14);
  };

  for (const [mx, my] of centers) {
    drawMino(mx, my);
  }
  c.strokeStyle = isReceptor ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.28)";
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(0, -cell);
  c.lineTo(0, cell);
  c.moveTo(-1.5 * cell, 0);
  c.lineTo(1.5 * cell, 0);
  c.stroke();

  c.restore();
}

/** Chamfered HUD arrow: dark glass fill, dual neon strokes, corner bracket ticks. */
function _drawArrowCyberpunk(
  c: CanvasRenderingContext2D, size: number, color: string,
  qualityLevel: QualityLevel, isReceptor: boolean, pressed: boolean,
): void {
  applyArrowPathToSkinKeySquare(c);
  const s = size * 0.5;
  const chamfer = s * 0.22;
  c.beginPath();
  c.moveTo(0, -s);
  c.lineTo(s * 0.88 - chamfer * 0.2, s * 0.15 - chamfer * 0.35);
  c.lineTo(s * 0.88, s * 0.15 + chamfer * 0.15);
  c.lineTo(s * 0.40, s * 0.72 - chamfer * 0.25);
  c.lineTo(s * 0.40 - chamfer * 0.15, s * 0.72);
  c.lineTo(-s * 0.40 + chamfer * 0.15, s * 0.72);
  c.lineTo(-s * 0.40, s * 0.72 - chamfer * 0.25);
  c.lineTo(-s * 0.88, s * 0.15 + chamfer * 0.15);
  c.lineTo(-s * 0.88 + chamfer * 0.2, s * 0.15 - chamfer * 0.35);
  c.closePath();

  if (isReceptor) {
    c.fillStyle = pressed ? color + "38" : "rgba(6,10,18,0.58)";
    c.fill();
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.32)";
    c.lineWidth = 2;
    c.stroke();
  } else {
    c.fillStyle = "rgba(8,12,22,0.92)";
    c.fill();
    if (qualityLevel !== "low") {
      c.shadowColor = color;
      c.shadowBlur = qualityLevel === "high" ? 11 : 7;
    }
    c.strokeStyle = color;
    c.lineWidth = 2.3;
    c.stroke();
    c.shadowBlur = 0;
    c.save();
    c.scale(0.82, 0.82);
    c.beginPath();
    c.moveTo(0, -s);
    c.lineTo(s * 0.88 - chamfer * 0.2, s * 0.15 - chamfer * 0.35);
    c.lineTo(s * 0.88, s * 0.15 + chamfer * 0.15);
    c.lineTo(s * 0.40, s * 0.72 - chamfer * 0.25);
    c.lineTo(s * 0.40 - chamfer * 0.15, s * 0.72);
    c.lineTo(-s * 0.40 + chamfer * 0.15, s * 0.72);
    c.lineTo(-s * 0.40, s * 0.72 - chamfer * 0.25);
    c.lineTo(-s * 0.88, s * 0.15 + chamfer * 0.15);
    c.lineTo(-s * 0.88 + chamfer * 0.2, s * 0.15 - chamfer * 0.35);
    c.closePath();
    c.strokeStyle = "rgba(255,80,255,0.38)";
    c.lineWidth = 1;
    c.stroke();
    c.restore();
  }

  const tick = size * 0.06;
  c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.35)") : "rgba(0,255,255,0.42)";
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(-s * 0.88, -s * 0.35);
  c.lineTo(-s * 0.88 - tick, -s * 0.35);
  c.moveTo(s * 0.88, -s * 0.35);
  c.lineTo(s * 0.88 + tick, -s * 0.35);
  c.moveTo(-s * 0.42, s * 0.72);
  c.lineTo(-s * 0.42, s * 0.72 + tick * 0.75);
  c.moveTo(s * 0.42, s * 0.72);
  c.lineTo(s * 0.42, s * 0.72 + tick * 0.75);
  c.stroke();
  c.restore();
}

/** Steel bracket plate: trapezoid crown + base, rivets, center seam. */
function _drawArrowMechanical(
  c: CanvasRenderingContext2D, size: number, color: string,
  isReceptor: boolean, pressed: boolean,
): void {
  // Keep Mechanical skin inside the shared square lane frame.
  applyUniformScaleToSkinKeySquare(c, 0.82, 0.8);

  const w = size * 0.4;
  const yTop = -size * 0.42;
  const yMid = size * 0.06;
  const yBot = size * 0.36;
  const notch = size * 0.06;

  c.beginPath();
  c.moveTo(0, yTop);
  c.lineTo(w, yMid - notch);
  c.lineTo(w, yBot);
  c.lineTo(-w, yBot);
  c.lineTo(-w, yMid - notch);
  c.closePath();

  const plate = isReceptor
    ? (pressed ? color + "28" : "rgba(255,255,255,0.06)")
    : color;
  const edge = isReceptor ? (pressed ? color : "rgba(255,255,255,0.25)") : "#1a1a1a";

  c.fillStyle = plate;
  c.fill();
  c.strokeStyle = edge;
  c.lineWidth = isReceptor ? 2 : 2.4;
  c.stroke();

  c.strokeStyle = isReceptor ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.45)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-w + notch, yMid);
  c.lineTo(w - notch, yMid);
  c.stroke();
  c.fillStyle = isReceptor ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.16)";
  c.fillRect(-w * 0.32, yTop + size * 0.1, w * 0.5, size * 0.08);

  const rivetR = size * 0.045;
  const rivets: [number, number][] = [
    [0, yTop + size * 0.08],
    [-w * 0.72, yMid - notch * 0.4],
    [w * 0.72, yMid - notch * 0.4],
    [-w * 0.78, yBot - rivetR * 1.2],
    [w * 0.78, yBot - rivetR * 1.2],
  ];
  for (const [rx, ry] of rivets) {
    c.beginPath();
    c.arc(rx, ry, rivetR, 0, Math.PI * 2);
    c.fillStyle = isReceptor ? "rgba(40,40,40,0.85)" : "#2c2c2c";
    c.fill();
    c.strokeStyle = isReceptor ? "rgba(255,255,255,0.35)" : "#111";
    c.lineWidth = 0.9;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.fillRect(rx - rivetR * 0.35, ry - rivetR * 0.35, rivetR * 0.5, rivetR * 0.35);
  }

  c.restore();
}

function _drawArrowMusical(
  c: CanvasRenderingContext2D, size: number, color: string,
  isReceptor: boolean, pressed: boolean,
): void {
  // Keep Musical skin inside the shared square lane frame.
  applyUniformScaleToSkinKeySquare(c, 0.72, 0.86);
  const headW = size * 0.44;
  const headH = size * 0.26;
  const headY = size * 0.18;
  const stemX = size * 0.17;
  const stemTop = -size * 0.4;
  const stemBottom = size * 0.03;
  const tailY = size * 0.54;
  const rr = Math.max(3, headH * 0.25);

  c.beginPath();
  c.roundRect(-headW / 2, headY - headH / 2, headW, headH, rr);
  if (isReceptor) {
    c.fillStyle = pressed ? color + "36" : "rgba(255,255,255,0.06)";
    c.strokeStyle = pressed ? color : "rgba(255,255,255,0.22)";
    c.lineWidth = 1.6;
  } else {
    c.fillStyle = color;
    c.strokeStyle = "rgba(255,255,255,0.5)";
    c.lineWidth = 1.9;
  }
  c.fill();
  c.stroke();

  c.beginPath();
  c.moveTo(stemX, stemBottom);
  c.lineTo(stemX, stemTop);
  c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.22)") : "rgba(255,255,255,0.58)";
  c.lineWidth = isReceptor ? 1.8 : 2.2;
  c.stroke();

  c.beginPath();
  c.moveTo(stemX, stemTop);
  c.quadraticCurveTo(size * 0.28, -size * 0.29, size * 0.3, -size * 0.12);
  c.strokeStyle = isReceptor ? (pressed ? color : "rgba(255,255,255,0.18)") : "rgba(255,255,255,0.44)";
  c.lineWidth = isReceptor ? 1.2 : 1.45;
  c.stroke();

  c.beginPath();
  c.moveTo(0, headY + headH / 2);
  c.quadraticCurveTo(-size * 0.02, size * 0.4, 0, tailY);
  c.quadraticCurveTo(size * 0.02, size * 0.4, 0, headY + headH / 2);
  c.fillStyle = isReceptor ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.2)";
  c.fill();

  c.restore();
}

function _drawArrowDefault(
  c: CanvasRenderingContext2D, size: number, color: string,
  qualityLevel: QualityLevel, isReceptor: boolean, pressed: boolean,
): void {
  applyArrowPathToSkinKeySquare(c);
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
  c.restore();
}
