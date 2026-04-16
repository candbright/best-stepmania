<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { GameEngine, NoteFieldExposed, PanelConfig } from "@/engine";
import type { PlayMode } from "@/shared/stores/session";
import type { RoutinePlayerColorId } from "@/constants/routinePlayerColors";
import { routineColorHex } from "@/constants/routinePlayerColors";
import type { NoteSkinSnapshot } from "@/api";
import { trackColorForSkin } from "@/shared/stores/noteskin";
import type { PerPlayerConfig } from "@/engine/types";
import {
  buildPanels,
  clampDoublePanelGapPx,
  findPanelByTrack,
  getColumnWidth,
  getReceptorSize,
  usesSplitWidePanelLayout,
} from "@/engine/render/panelLayout";
import { resolveTrackEffects } from "@/engine/render/playerEffects";
import {
  getColumnLabel as schemaColumnLabel,
  getPumpDirection as schemaPumpDirection,
  getTrackColors as schemaTrackColors,
  getTrackDirection as schemaTrackDirection,
  isCenterColumn as schemaIsCenterColumn,
  type ArrowDirection,
} from "@/engine/render/noteSchema";
import {
  drawHoldDrawer,
  drawLiftDrawer,
  drawMineDrawer,
  drawNoteDrawer,
  drawReceptorDrawer,
  type RenderDrawerDeps,
} from "@/engine/render/drawers";
import { drawBeatLines } from "@/engine/render/beatLines";
import { createParticleSystem, type ParticleSystem } from "@/engine/render/particles";
import { createQualityState, tickRenderQuality, type QualityState } from "@/engine/render/renderQuality";
import { drawComboHud, drawJudgmentFlashHud } from "@/engine/render/noteFieldHud";
import { getThemePrimaryRgba } from "@/utils/themeCssBridge";

const props = defineProps<{
  engine: GameEngine;
  skinConfig?: NoteSkinSnapshot | null;
  skinConfig2?: NoteSkinSnapshot | null;
  playMode: PlayMode;
  routineP1ColorId: RoutinePlayerColorId;
  routineP2ColorId: RoutinePlayerColorId;
  doublePanelGapPx: number;
  targetFps: number;
  uiScale: number;
}>();

// ── Per-instance render subsystems ───────────────────────────────────────────

const quality: QualityState = createQualityState();
const particleSystem: ParticleSystem = createParticleSystem();

// ── Canvas state ──────────────────────────────────────────────────────────────

const canvasRef = ref<HTMLCanvasElement | null>(null);
let animFrameId = 0;
let ctx: CanvasRenderingContext2D | null = null;
let lastFrameTime = 0;
let lastFrameMs = 16;
let nextFrameAtMs = 0;
let resizeObserver: ResizeObserver | null = null;

const NOTE_HEIGHT = 24;

// ── HUD flash state ───────────────────────────────────────────────────────────

let judgmentFlashP1 = { text: "", color: "", alpha: 0, time: 0 };
let judgmentFlashP2 = { text: "", color: "", alpha: 0, time: 0 };
let comboFlashP1 = { scale: 1, time: 0 };
let comboFlashP2 = { scale: 1, time: 0 };

// ── Component-glue helpers ────────────────────────────────────────────────────

function getPlayerConfig(player: 1 | 2): PerPlayerConfig | undefined {
  return props.engine.config.playerConfigs?.[player - 1];
}

function getEffectsForTrack(track: number): { sudden: boolean; hidden: boolean; rotate: boolean } {
  return resolveTrackEffects(
    track,
    props.engine.config.numTracks,
    props.engine.config.coopMode,
    props.engine.config.playerConfigs,
  );
}

const getPanelForTrack = (track: number): PanelConfig | undefined => {
  const w = canvasRef.value?.width ?? 800;
  const h = canvasRef.value?.height ?? 600;
  return findPanelByTrack(track, computePanels(w, h));
};

function getTrackColors(panel?: PanelConfig): string[] {
  const n = panel?.numTracks ?? props.engine.config.numTracks;
  const cfg = props.engine.config;
  const isDoubleLayout = usesSplitWidePanelLayout(cfg.coopMode, cfg.numTracks);
  return schemaTrackColors(n, isDoubleLayout, panel?.player);
}

function getTrackColor(track: number, panel?: PanelConfig, routineLayer?: 1 | 2 | null): string {
  const p = panel ?? getPanelForTrack(track);
  const skinConfig = p?.skinConfig ?? props.skinConfig ?? null;
  const n = p?.numTracks ?? props.engine.config.numTracks;
  const localTrack = track - (p?.startTrack ?? 0);
  const pc = getPlayerConfig(p?.player ?? 1);
  const playerNoteskin = pc?.noteskin ?? "default";
  if (skinConfig && playerNoteskin !== "default") {
    return trackColorForSkin(skinConfig, localTrack, n);
  }
  if (props.playMode === "pump-routine" && playerNoteskin === "default") {
    if (routineLayer === 1 || routineLayer === 2) {
      const id = routineLayer === 2 ? props.routineP2ColorId : props.routineP1ColorId;
      const accent = routineColorHex(id);
      if (accent) return accent;
    }
    if (routineLayer == null && p?.player) {
      const id = p.player === 2 ? props.routineP2ColorId : props.routineP1ColorId;
      const accent = routineColorHex(id);
      if (accent) return accent;
    }
  }
  const colors = getTrackColors(p);
  return colors[localTrack % colors.length];
}

function getTrackDirection(col: number): ArrowDirection | null {
  return schemaTrackDirection(props.engine.config.numTracks, col);
}

function getPumpDirection(col: number): ArrowDirection | null {
  return schemaPumpDirection(props.engine.config.numTracks, col);
}

function getColumnLabel(col: number): string {
  return schemaColumnLabel(props.engine.config.numTracks, col);
}

function isCenterColumn(col: number): boolean {
  return schemaIsCenterColumn(props.engine.config.numTracks, col);
}

let cachedPanels: PanelConfig[] = [];
let panelsLayoutKey = "";

function computePanels(w: number, h: number): PanelConfig[] {
  const engine = props.engine;
  const [p1, p2] = engine.config.playerConfigs;
  const key = [
    w,
    h,
    props.doublePanelGapPx,
    props.playMode,
    engine.config.numTracks,
    engine.config.coopMode,
    props.skinConfig?.name ?? "",
    props.skinConfig2?.name ?? "",
    p1?.noteskin ?? "",
    String(p1?.noteScale ?? 1),
    p2?.noteskin ?? "",
    String(p2?.noteScale ?? 1),
  ].join("\0");

  if (key === panelsLayoutKey && cachedPanels.length > 0) {
    return cachedPanels;
  }
  panelsLayoutKey = key;
  cachedPanels = buildPanels({
    width: w,
    height: h,
    numTracks: engine.config.numTracks,
    coopMode: engine.config.coopMode,
    playerConfigs: engine.config.playerConfigs,
    skinConfig1: props.skinConfig ?? null,
    skinConfig2: props.skinConfig2 ?? null,
    gap: clampDoublePanelGapPx(props.doublePanelGapPx),
    uiScale: props.uiScale,
  });
  return cachedPanels;
}

function getRenderDrawerDeps(): RenderDrawerDeps {
  return {
    numTracks: props.engine.config.numTracks,
    noteHeight: NOTE_HEIGHT * props.uiScale,
    qualityLevel: quality.level,
    getPlayerConfig,
    getTrackColor,
    getTrackDirection,
    getPumpDirection,
    getColumnLabel,
    isCenterColumn,
    getEffectsForTrack,
  };
}

function drawPanel(c: CanvasRenderingContext2D, panel: PanelConfig, h: number, time: number, _dt: number) {
  const engine = props.engine;
  const deps = getRenderDrawerDeps();
  const colW = getColumnWidth(panel.numTracks) * props.uiScale;
  const recSize = getReceptorSize(panel.numTracks, panel.noteScale ?? 1) * props.uiScale;
  const { x: px, width: pWidth, receptorY, numTracks } = panel;

  c.save();
  c.beginPath();
  c.rect(px, 0, pWidth, h);
  c.clip();

  c.fillStyle = "#08080f";
  c.fillRect(px, 0, pWidth, h);

  c.strokeStyle = "rgba(255, 255, 255, 0.04)";
  c.lineWidth = 1;
  for (let i = 0; i <= numTracks; i++) {
    const lx = px + i * colW;
    c.beginPath();
    c.moveTo(lx, 0);
    c.lineTo(lx, h);
    c.stroke();
  }

  if (quality.level !== "low") {
    drawBeatLines(c, engine, px, pWidth, receptorY, h, panel.speedMod, panel.reverse);
  }

  const jlGrad = c.createLinearGradient(px, receptorY - 12, px, receptorY + 12);
  jlGrad.addColorStop(0, getThemePrimaryRgba(0));
  jlGrad.addColorStop(0.5, getThemePrimaryRgba(0.12));
  jlGrad.addColorStop(1, getThemePrimaryRgba(0));
  c.fillStyle = jlGrad;
  c.fillRect(px, receptorY - 12, pWidth, 24);
  c.strokeStyle = "rgba(255, 255, 255, 0.18)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(px, receptorY);
  c.lineTo(px + pWidth, receptorY);
  c.stroke();

  const blankLead = engine.isChartLeadInBlankPhase();

  if (!blankLead && engine.judgment) {
    for (const hold of engine.judgment.holds) {
      if (hold.track >= panel.startTrack && hold.track < panel.startTrack + numTracks) {
        drawHoldDrawer(c, engine, hold, px, receptorY, h, colW, panel, deps);
      }
    }
  }

  if (!blankLead) {
    const visibleRange = 3.0;
    const [visibleStart, visibleEnd] = engine.getVisibleNoteRange(visibleRange, visibleRange);
    const playheadChart = engine.getChartPlayheadSeconds();
    for (let i = visibleStart; i < visibleEnd; i++) {
    const note = engine.notes[i]!;
    if (note.track < panel.startTrack || note.track >= panel.startTrack + numTracks) continue;
    if (engine.judgment?.isNoteJudged(note.track, note.row)) continue;
    if (Math.abs(note.second - playheadChart) > visibleRange) continue;

    const localTrack = note.track - panel.startTrack;
    const y = engine.getNoteY(note.second, receptorY, h, panel.speedMod, panel.reverse);
    if (y < -50 || y > h + 50) continue;

    const nx = px + localTrack * colW;
    const fx = getEffectsForTrack(note.track);

    let noteAlpha = 1.0;
    if (fx.sudden || fx.hidden) {
      const fadeZone = h * 0.10;
      const midY = h / 2;
      if (panel.reverse) {
        if (fx.sudden) {
          if (y > midY + fadeZone) noteAlpha = 0;
          else if (y > midY - fadeZone) noteAlpha = ((midY + fadeZone) - y) / (2 * fadeZone);
        }
        if (fx.hidden) {
          if (y < midY - fadeZone) noteAlpha = 0;
          else if (y < midY + fadeZone) noteAlpha = (y - (midY - fadeZone)) / (2 * fadeZone);
        }
      } else {
        if (fx.sudden) {
          if (y < midY - fadeZone) noteAlpha = 0;
          else if (y < midY + fadeZone) noteAlpha = (y - (midY - fadeZone)) / (2 * fadeZone);
        }
        if (fx.hidden) {
          if (y > midY + fadeZone) noteAlpha = 0;
          else if (y > midY - fadeZone) noteAlpha = ((midY + fadeZone) - y) / (2 * fadeZone);
        }
      }
    }
    if (noteAlpha <= 0) continue;

    const rotation = fx.rotate
      ? ((panel.reverse ? y - receptorY : receptorY - y) / h) * Math.PI * 4
      : 0;

    c.save();
    c.globalAlpha = noteAlpha;
    if (rotation !== 0) {
      c.translate(nx + colW / 2, y);
      c.rotate(rotation);
      c.translate(-(nx + colW / 2), -y);
    }

    if (note.noteType === "Mine") {
      drawMineDrawer(c, nx, y, colW, time);
    } else if (note.noteType === "Lift") {
      drawLiftDrawer(c, nx, y, note.track, colW, panel, deps, note.routineLayer ?? null);
    } else {
      drawNoteDrawer(c, nx, y, note.track, colW, recSize, note.noteType, panel, deps, note.routineLayer ?? null);
    }

    c.restore();
    }
  }

  for (let col = 0; col < numTracks; col++) {
    const lx = px + col * colW;
    const trackIdx = panel.startTrack + col;
    const pressed = engine.keysDown[trackIdx] ?? false;
    const color = getTrackColor(trackIdx, panel);

    if (pressed) {
      const gradient = c.createRadialGradient(lx + colW / 2, receptorY, 0, lx + colW / 2, receptorY, colW);
      gradient.addColorStop(0, color + "40");
      gradient.addColorStop(1, "transparent");
      c.fillStyle = gradient;
      c.fillRect(lx - 10, receptorY - colW, colW + 20, colW * 2);
    }

    drawReceptorDrawer(c, lx, receptorY, trackIdx, pressed, color, colW, recSize, panel.player, deps);
  }

  c.restore();
}

function drawFrame(time: number) {
  if (!ctx || !canvasRef.value) return;

  const rawFps = props.targetFps;
  const uncapped = rawFps === 0;
  const targetFps = uncapped ? 0 : Math.max(30, rawFps > 0 ? rawFps : 144);
  if (!uncapped && time < nextFrameAtMs) {
    animFrameId = requestAnimationFrame(drawFrame);
    return;
  }
  if (!uncapped) {
    nextFrameAtMs = time + 1000 / targetFps;
  }

  const engine = props.engine;
  const w = canvasRef.value.width;
  const h = canvasRef.value.height;

  const dt = lastFrameTime > 0 ? Math.min((time - lastFrameTime) / 1000, 0.05) : 0.016;
  lastFrameMs = dt * 1000;
  tickRenderQuality(quality, lastFrameMs);
  lastFrameTime = time;

  const panels = computePanels(w, h);
  const primaryPanel = panels[0];
  if (primaryPanel) {
    engine.setChartLeadInFromLayout(h, primaryPanel.receptorY, primaryPanel.reverse, primaryPanel.speedMod);
  }
  engine.update(time);
  ctx.clearRect(0, 0, w, h);
  for (const panel of panels) {
    drawPanel(ctx, panel, h, time, dt);
  }
  particleSystem.updateAndDraw(ctx, dt, quality.level);

  animFrameId = requestAnimationFrame(drawFrame);

  const hudP1 = panels.find((p) => p.player === 1);
  const hudP2 = panels.find((p) => p.player === 2);
  if (hudP1) {
    drawJudgmentFlashHud(ctx, time, h, hudP1, quality.level, judgmentFlashP1);
    drawComboHud(ctx, time, h, hudP1, quality.level, comboFlashP1.time, engine.judgment?.player1Score.combo ?? 0);
  }
  if (hudP2) {
    drawJudgmentFlashHud(ctx, time, h, hudP2, quality.level, judgmentFlashP2);
    drawComboHud(ctx, time, h, hudP2, quality.level, comboFlashP2.time, engine.judgment?.player2Score.combo ?? 0);
  }
}

function showJudgment(judgment: string, color: string, track?: number) {
  const now = performance.now();
  const panel = track !== undefined ? getPanelForTrack(track) : undefined;
  const player = panel?.player ?? 1;
  if (player === 2) {
    judgmentFlashP2 = { text: judgment, color, alpha: 1, time: now };
    comboFlashP2 = { scale: 1.15, time: now };
  } else {
    judgmentFlashP1 = { text: judgment, color, alpha: 1, time: now };
    comboFlashP1 = { scale: 1.15, time: now };
  }

  if (canvasRef.value && track !== undefined) {
    const panel = getPanelForTrack(track);
    if (panel) {
      const colW = getColumnWidth(panel.numTracks) * props.uiScale;
      const localTrack = track - panel.startTrack;
      const px = panel.x + localTrack * colW + colW / 2;
      const receptorY = panel.receptorY;
      if (judgment !== "Miss" && judgment !== "Way Off" && judgment !== "Boo") {
        particleSystem.spawnHitEffect(
          px, receptorY, color,
          judgment === "Marvelous" || judgment === "Fantastic" ? "W1"
            : judgment === "Perfect" || judgment === "Excellent" ? "W2"
            : judgment === "Great" ? "W3" : "W4",
          quality.level,
          props.engine.config.showParticles ?? true,
        );
      }
    }
  }
}

function getPerfState() {
  return {
    qualityLevel: quality.level,
    frameMs: lastFrameMs,
    particles: particleSystem.count,
  };
}

defineExpose<NoteFieldExposed>({ showJudgment, getPerfState });

function resizeCanvas() {
  if (!canvasRef.value) return;
  const parent = canvasRef.value.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width || parent.clientWidth || window.innerWidth));
  const height = Math.max(1, Math.floor(rect.height || parent.clientHeight || window.innerHeight));
  canvasRef.value.width = width;
  canvasRef.value.height = height;
}

onMounted(() => {
  if (canvasRef.value) {
    ctx = canvasRef.value.getContext("2d");
    resizeCanvas();
    animFrameId = requestAnimationFrame(drawFrame);
    const parent = canvasRef.value.parentElement;
    if (parent && "ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => resizeCanvas());
      resizeObserver.observe(parent);
    }
  }
  window.addEventListener("resize", resizeCanvas);
});

onUnmounted(() => {
  cancelAnimationFrame(animFrameId);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  window.removeEventListener("resize", resizeCanvas);
});
</script>

<template>
  <div class="note-field-wrap">
    <canvas ref="canvasRef" class="note-field-canvas" />
  </div>
</template>

<style scoped>
.note-field-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}
.note-field-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>