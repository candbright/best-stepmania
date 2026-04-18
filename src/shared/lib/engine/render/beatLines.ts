/**
 * render/beatLines.ts
 *
 * Renders measure / beat / sub-beat horizontal grid lines across a panel.
 * Pure canvas operation — no component state.
 */

import type { GameEngine } from "@/shared/lib/engine";

/**
 * Draw beat lines (measure bars, beat lines, sub-beat lines) across one panel.
 *
 * @param fieldX      Left edge of the panel in canvas coordinates.
 * @param fieldWidth  Width of the panel.
 * @param receptorY   Y position of the receptor / judgment line.
 * @param canvasH     Full canvas height.
 * @param speedMod    Optional override for scroll speed (e.g. "C500", "2.0x").
 * @param reverse     Optional override for scroll direction.
 */
export function drawBeatLines(
  c: CanvasRenderingContext2D,
  engine: GameEngine,
  fieldX: number,
  fieldWidth: number,
  receptorY: number,
  canvasH: number,
  speedMod?: string,
  reverse?: boolean,
): void {
  const p1 = engine.config.playerConfigs?.[0];
  const panelSpeedMod = speedMod ?? p1?.speedMod ?? "C500";
  const panelReverse = reverse ?? p1?.reverse ?? false;

  const speed = panelSpeedMod.startsWith("C")
    ? parseInt(panelSpeedMod.slice(1), 10) || 500
    : (parseFloat(panelSpeedMod) || 1.0) * 200;

  const refBpm = engine.baseBpm || 120;
  const pixelsPerBeat = panelSpeedMod.startsWith("C")
    ? (speed * 60) / refBpm
    : Math.max(speed * 0.25, 40);

  const visibleSpan = (panelReverse ? receptorY : canvasH - receptorY) / pixelsPerBeat;
  // Same beat as getNoteY (updated in engine.update this frame); avoids extra timeToBeat(playhead).
  const currentBeat = engine.currentBeat;
  const startBeat = Math.floor((currentBeat - visibleSpan - 2) * 4) / 4;
  const endBeat = Math.ceil((currentBeat + visibleSpan + 4) * 4) / 4;

  for (let b = startBeat; b <= endBeat; b += 0.25) {
    let y: number;
    if (panelSpeedMod.startsWith("C")) {
      const speedC = parseInt(panelSpeedMod.slice(1), 10) || 500;
      const pixelsPerBeatC = (speedC * 60) / refBpm;
      const chartSec = engine.beatToTime(b);
      const beatAtLine = engine.timeToBeat(chartSec);
      const pixelOffset = (beatAtLine - currentBeat) * pixelsPerBeatC;
      y = panelReverse ? receptorY - pixelOffset : receptorY + pixelOffset;
    } else {
      // Match getNoteY(beatToTime(b)): scroll uses timeToBeat(chart second), not raw grid index `b`.
      const chartSec = engine.beatToTime(b);
      const beatAtNote = engine.timeToBeat(chartSec);
      const pixelOffset = engine.getVisualBeatDistance(currentBeat, beatAtNote, panelSpeedMod);
      y = panelReverse ? receptorY - pixelOffset : receptorY + pixelOffset;
    }
    if (y < -4 || y > canvasH + 4) continue;

    const q = Math.round(b * 4);
    const isMeasure = q % 16 === 0;
    const isBeat = q % 4 === 0;

    if (isMeasure) {
      c.strokeStyle = "rgba(255,255,255,0.20)";
      c.lineWidth = 1.5;
    } else if (isBeat) {
      c.strokeStyle = "rgba(255,255,255,0.08)";
      c.lineWidth = 1;
    } else {
      c.strokeStyle = "rgba(255,255,255,0.03)";
      c.lineWidth = 0.5;
    }

    c.beginPath();
    c.moveTo(fieldX, y);
    c.lineTo(fieldX + fieldWidth, y);
    c.stroke();
  }
}
