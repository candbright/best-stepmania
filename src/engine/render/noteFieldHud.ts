import type { GameEngine } from "@/engine/GameEngine";
import type { PanelConfig } from "@/engine/types";
import type { QualityLevel } from "@/engine/render/drawers";

export interface JudgmentFlashState {
  text: string;
  color: string;
  alpha: number;
  time: number;
}

export function drawJudgmentFlashHud(
  ctx: CanvasRenderingContext2D,
  time: number,
  h: number,
  primaryPanel: PanelConfig,
  qualityLevel: QualityLevel,
  flash: JudgmentFlashState,
): void {
  if (flash.alpha <= 0) return;

  const dt2 = (time - flash.time) / 1000;
  flash.alpha = Math.max(0, 1 - dt2 * 2.2);
  const bounce = dt2 < 0.08 ? 1.18 - dt2 * 2 : 1 + Math.max(0, 0.08 - (dt2 - 0.08)) * 2;
  const fontSize = Math.round(30 * bounce);
  const panelCenterX = primaryPanel.x + primaryPanel.width / 2;
  const jy = primaryPanel.reverse
    ? Math.max(primaryPanel.receptorY - 55, h * 0.25)
    : Math.min(primaryPanel.receptorY + 55, h * 0.25);

  ctx.save();
  ctx.globalAlpha = flash.alpha;
  ctx.font = `900 ${fontSize}px 'Orbitron', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = flash.color;
  if (qualityLevel !== "low") {
    ctx.shadowColor = flash.color;
    ctx.shadowBlur = qualityLevel === "high" ? 20 : 10;
  }
  ctx.fillText(flash.text, panelCenterX, jy);
  if (qualityLevel === "high") {
    const tw = ctx.measureText(flash.text).width;
    ctx.strokeStyle = flash.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = flash.alpha * 0.4;
    ctx.beginPath();
    ctx.moveTo(panelCenterX - tw / 2, jy + fontSize * 0.52);
    ctx.lineTo(panelCenterX + tw / 2, jy + fontSize * 0.52);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawComboHud(
  ctx: CanvasRenderingContext2D,
  time: number,
  h: number,
  primaryPanel: PanelConfig,
  qualityLevel: QualityLevel,
  comboFlashTime: number,
  engine: GameEngine,
): void {
  if (!engine.judgment || engine.judgment.score.combo <= 2) return;

  const comboAge = (time - comboFlashTime) / 1000;
  const cBounce = comboAge < 0.06 ? 1.15 : 1 + Math.max(0, 0.12 - comboAge) * 1.2;
  const comboY = primaryPanel.reverse
    ? Math.min(primaryPanel.receptorY - 105, h * 0.52)
    : Math.max(primaryPanel.receptorY + 105, h * 0.33);
  const panelCenterX = primaryPanel.x + primaryPanel.width / 2;

  ctx.save();
  ctx.font = `900 ${Math.round(50 * cBounce)}px 'Orbitron', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (qualityLevel !== "low") {
    ctx.shadowColor = "rgba(108, 59, 255, 0.4)";
    ctx.shadowBlur = 12;
  }
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(String(engine.judgment.score.combo), panelCenterX, comboY);
  ctx.shadowBlur = 0;
  ctx.font = "700 11px 'Orbitron', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText("COMBO", panelCenterX, comboY + 28);
  ctx.restore();
}
