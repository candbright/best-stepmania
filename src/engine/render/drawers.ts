import type { GameEngine, HoldState, PanelConfig } from "@/engine";
import type { PerPlayerConfig } from "@/engine/types";
import type { ArrowDirection } from "./noteSchema";
import { drawArrowWithSkin, drawPumpPanelWithSkin } from "./skins";

export type QualityLevel = "low" | "medium" | "high";

export interface RenderDrawerDeps {
  numTracks: number;
  noteHeight: number;
  qualityLevel: QualityLevel;
  getPlayerConfig: (player: 1 | 2) => PerPlayerConfig | undefined;
  getTrackColor: (track: number, panel?: PanelConfig, routineLayer?: 1 | 2 | null) => string;
  getTrackDirection: (col: number) => ArrowDirection | null;
  getPumpDirection: (col: number) => ArrowDirection | null;
  getColumnLabel: (col: number) => string;
  isCenterColumn: (col: number) => boolean;
  getEffectsForTrack: (track: number) => { sudden: boolean; hidden: boolean; rotate: boolean };
}

export function drawReceptorDrawer(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  col: number,
  pressed: boolean,
  color: string,
  colW: number,
  recSize: number,
  panelPlayer: 1 | 2,
  deps: RenderDrawerDeps,
): void {
  const isPump = deps.numTracks === 5 || deps.numTracks === 10;
  const cx = x + colW / 2;
  const style = deps.getPlayerConfig(panelPlayer)?.noteStyle ?? "default";

  if (isPump) {
    if (style === "default") {
      const pumpDirection = deps.getPumpDirection(col);
      if (pumpDirection) {
        const arrowSize = recSize * 0.92;
        c.save();
        if (pressed && deps.qualityLevel !== "low") {
          c.shadowColor = color;
          c.shadowBlur = deps.qualityLevel === "high" ? 18 : 8;
        }
        c.globalAlpha = pressed ? 1 : 0.92;
        drawArrowWithSkin(c, cx, y, arrowSize, pumpDirection, color, "default", deps.qualityLevel, true, pressed);
        c.restore();
      } else {
        const radius = recSize * 0.24;
        c.save();
        if (pressed && deps.qualityLevel !== "low") {
          c.shadowColor = color;
          c.shadowBlur = deps.qualityLevel === "high" ? 18 : 8;
        }
        c.fillStyle = pressed ? color + "22" : color + "18";
        c.beginPath();
        c.arc(cx, y, radius, 0, Math.PI * 2);
        c.fill();
        c.lineWidth = pressed ? 3 : 2;
        c.strokeStyle = pressed ? color : "rgba(255,255,255,0.28)";
        c.beginPath();
        c.arc(cx, y, radius, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
    } else {
      drawPumpPanelWithSkin(c, cx, y, recSize * 0.78, color, style, deps.isCenterColumn(col), deps.qualityLevel, true, pressed);
    }
    return;
  }

  const direction = deps.getTrackDirection(col);
  if (direction) {
    const arrowSize = recSize * 0.88;
    drawArrowWithSkin(c, cx, y, arrowSize, direction, color, style, deps.qualityLevel, true, pressed);
    return;
  }

  const offset = (colW - recSize) / 2;
  const rx = x + offset;
  const ry = y - recSize / 2;
  c.strokeStyle = pressed ? color : "rgba(255,255,255,0.2)";
  c.fillStyle = pressed ? color + "30" : "rgba(255,255,255,0.04)";
  c.lineWidth = pressed ? 2.5 : 1.5;
  c.beginPath();
  c.roundRect(rx, ry, recSize, recSize, 6);
  c.fill();
  c.stroke();
  c.fillStyle = pressed ? "#fff" : "rgba(255,255,255,0.25)";
  const fontSize = colW <= 48 ? 14 : 18;
  c.font = `${pressed ? "bold " : ""}${fontSize}px monospace`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(deps.getColumnLabel(col), cx, y);
}

export function drawNoteDrawer(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  track: number,
  colW: number,
  noteType: string,
  panel: PanelConfig | undefined,
  deps: RenderDrawerDeps,
  routineLayer?: 1 | 2 | null,
): void {
  const color = deps.getTrackColor(track, panel, routineLayer);
  const cx = x + colW / 2;
  const isPump = deps.numTracks === 5 || deps.numTracks === 10;
  const player = panel?.player ?? 1;
  const pc = deps.getPlayerConfig(player);
  const noteStyle = pc?.noteStyle ?? "default";
  const scale = panel?.noteScale ?? pc?.noteScale ?? 1;

  if (isPump) {
    const fillColor = noteType === "Roll" ? "#ff9800" : color;
    const pumpDirection = deps.getPumpDirection(track);

    if (noteStyle === "default" && pumpDirection) {
      const arrowSize = Math.min(colW * 0.8, 48) * scale;
      drawArrowWithSkin(c, cx, y, arrowSize, pumpDirection, fillColor, "default", deps.qualityLevel);
    } else if (noteStyle === "default" && deps.isCenterColumn(track)) {
      const radius = Math.min(colW * 0.18, 10) * scale;
      c.save();
      if (deps.qualityLevel !== "low") {
        c.shadowColor = fillColor;
        c.shadowBlur = deps.qualityLevel === "high" ? 10 : 5;
      }
      c.fillStyle = fillColor;
      c.beginPath();
      c.arc(cx, y, radius, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = "rgba(255,255,255,0.6)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(cx, y, radius, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    } else {
      drawPumpPanelWithSkin(c, cx, y, Math.min(colW * 0.74, deps.noteHeight * 1.28) * scale, fillColor, noteStyle, deps.isCenterColumn(track), deps.qualityLevel);
    }
    return;
  }

  const direction = deps.getTrackDirection(track);
  const fillColor = noteType === "Roll" ? "#ff9800" : color;
  if (direction) {
    const arrowSize = Math.min(colW * 0.78, 46) * scale;
    drawArrowWithSkin(c, cx, y, arrowSize, direction, fillColor, noteStyle, deps.qualityLevel);
    return;
  }

  const pad = 6;
  c.fillStyle = fillColor;
  c.beginPath();
  c.roundRect(x + pad, y - deps.noteHeight / 2, colW - pad * 2, deps.noteHeight, 4);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.3)";
  c.beginPath();
  c.roundRect(x + pad + 2, y - deps.noteHeight / 2 + 2, colW - pad * 2 - 4, 6, 2);
  c.fill();
}

export function drawHoldDrawer(
  c: CanvasRenderingContext2D,
  engine: GameEngine,
  hold: HoldState,
  fieldX: number,
  receptorY: number,
  canvasH: number,
  colW: number,
  panel: PanelConfig,
  deps: RenderDrawerDeps,
): void {
  const startNote = engine.notes.find((n) => n.track === hold.track && n.row === hold.startRow);
  if (!startNote) return;

  const headJudged = engine.judgment?.isNoteJudged(hold.track, hold.startRow);
  if (headJudged && !hold.active) return;

  const startSec = startNote.second;
  const endSec = hold.endSecond;
  /** Same domain as `note.second` / `getNoteY` — do not mix with row `beat` (can diverge under stops / timing). */
  const playheadChartSec = engine.getChartPlayheadSeconds();

  let clipStartSec: number;
  let clipEndSec: number;
  if (hold.active) {
    clipStartSec = Math.max(startSec, playheadChartSec);
    if (hold.broken && hold.brokenAtSecond != null) {
      clipEndSec = Math.min(endSec, hold.brokenAtSecond);
    } else {
      clipEndSec = endSec;
    }
  } else {
    clipStartSec = startSec;
    clipEndSec = endSec;
  }

  if (clipStartSec >= clipEndSec - 1e-5) return;

  const startY = engine.getNoteY(clipStartSec, receptorY, canvasH, panel.speedMod, panel.reverse);
  const endY = engine.getNoteY(clipEndSec, receptorY, canvasH, panel.speedMod, panel.reverse);

  const localTrack = hold.track - panel.startTrack;
  const x = fieldX + localTrack * colW;
  const color = deps.getTrackColor(hold.track, panel, startNote.routineLayer ?? null);
  const isRoll = hold.isRoll ?? false;
  const rollColor = "#ff9800";
  const bodyColor = isRoll ? rollColor : color;
  const bodyW = Math.min(24, colW - 16);
  const bodyX = x + (colW - bodyW) / 2;

  let topY = Math.min(startY, endY);
  let bottomY = Math.max(startY, endY);

  let holdAlpha = 1.0;
  const hfx = deps.getEffectsForTrack(hold.track);
  if (hfx.sudden || hfx.hidden) {
    const fadeZone = canvasH * 0.10;
    const midY = canvasH / 2;
    const centerY = (topY + bottomY) / 2;

    if (hfx.sudden) {
      if (centerY < midY - fadeZone) {
        holdAlpha = 0;
      } else if (centerY < midY + fadeZone) {
        holdAlpha = (centerY - (midY - fadeZone)) / (2 * fadeZone);
      }
      topY = Math.max(topY, midY - fadeZone);
    }
    if (hfx.hidden) {
      if (centerY > midY + fadeZone) {
        holdAlpha = 0;
      } else if (centerY > midY - fadeZone) {
        holdAlpha = ((midY + fadeZone) - centerY) / (2 * fadeZone);
      }
      bottomY = Math.min(bottomY, midY + fadeZone);
    }
  }

  const holdHeight = Math.max(0, bottomY - topY);
  if (holdHeight <= 0 && holdAlpha <= 0) return;

  const baseAlpha = hold.finished
    ? 0.15
    : hold.active && (hold.isRoll ? hold.held : hold.held || hold.broken)
      ? 0.95
      : 0.5;
  c.globalAlpha = baseAlpha * holdAlpha;

  if (isRoll) {
    const grad = c.createLinearGradient(bodyX, topY, bodyX, bottomY || topY + 1);
    grad.addColorStop(0, rollColor + "80");
    grad.addColorStop(0.5, rollColor + "c0");
    grad.addColorStop(1, rollColor + "80");
    c.fillStyle = grad;
    c.fillRect(bodyX, topY, bodyW, holdHeight);
    if (deps.qualityLevel !== "low") {
      c.strokeStyle = rollColor + "60";
      c.lineWidth = deps.qualityLevel === "high" ? 2 : 1;
      const stripeSpacing = deps.qualityLevel === "high" ? 8 : 12;
      for (let sy = topY; sy < bottomY; sy += stripeSpacing) {
        c.beginPath();
        c.moveTo(bodyX, sy);
        c.lineTo(bodyX + bodyW, sy);
        c.stroke();
      }
    }
  } else {
    const grad = c.createLinearGradient(bodyX, topY, bodyX + bodyW, topY);
    grad.addColorStop(0, bodyColor + "60");
    grad.addColorStop(0.5, bodyColor + "a0");
    grad.addColorStop(1, bodyColor + "60");
    c.fillStyle = grad;
    c.fillRect(bodyX, topY, bodyW, holdHeight);
  }

  const capY = endY;
  let capAlpha = holdAlpha;
  if (hfx.sudden || hfx.hidden) {
    const fadeZone = canvasH * 0.10;
    const midY = canvasH / 2;
    capAlpha = 1.0;
    if (hfx.sudden) {
      if (capY < midY - fadeZone) capAlpha = 0;
      else if (capY < midY + fadeZone) capAlpha = (capY - (midY - fadeZone)) / (2 * fadeZone);
    }
    if (hfx.hidden) {
      if (capY > midY + fadeZone) capAlpha = 0;
      else if (capY > midY - fadeZone) capAlpha = ((midY + fadeZone) - capY) / (2 * fadeZone);
    }
  }

  if (capAlpha > 0) {
    c.globalAlpha = baseAlpha * capAlpha;
    c.fillStyle = bodyColor;
    c.save();
    c.translate(bodyX + bodyW / 2, capY);
    c.rotate(Math.PI / 4);
    const capSize = 6;
    c.fillRect(-capSize / 2, -capSize / 2, capSize, capSize);
    c.restore();
  }

  c.globalAlpha = 1;
}

export function drawMineDrawer(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  colW: number,
  time: number,
): void {
  const cx = x + colW / 2;
  const rotation = (time / 1000) * 2;
  c.save();
  c.translate(cx, y);
  c.rotate(rotation);
  c.strokeStyle = "#ff1744";
  c.lineWidth = 2;
  c.beginPath();
  c.arc(0, 0, 14, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = "rgba(255, 23, 68, 0.15)";
  c.fill();
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    c.beginPath();
    c.moveTo(Math.cos(angle) * 10, Math.sin(angle) * 10);
    c.lineTo(Math.cos(angle) * 18, Math.sin(angle) * 18);
    c.stroke();
  }
  c.restore();
}

export function drawLiftDrawer(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  track: number,
  colW: number,
  panel: PanelConfig | undefined,
  deps: RenderDrawerDeps,
  routineLayer?: 1 | 2 | null,
): void {
  const color = deps.getTrackColor(track, panel, routineLayer);
  const cx = x + colW / 2;
  const size = Math.min(colW * 0.65, deps.noteHeight * 1.1);
  const half = size / 2;
  c.save();
  c.translate(cx, y);
  c.rotate(Math.PI / 4);
  c.strokeStyle = color;
  c.lineWidth = 2.5;
  if (deps.qualityLevel !== "low") {
    c.shadowColor = color;
    c.shadowBlur = deps.qualityLevel === "high" ? 6 : 3;
  }
  c.strokeRect(-half, -half, size, size);
  c.shadowBlur = 0;
  c.restore();
}
