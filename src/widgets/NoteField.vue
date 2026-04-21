<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { GameEngine, NoteFieldExposed, PanelConfig } from "@/shared/lib/engine";
import type { PlayMode } from "@/shared/stores/session";
import type { RoutinePlayerColorId } from "@/shared/constants/routinePlayerColors";
import { routineColorHex } from "@/shared/constants/routinePlayerColors";
import type { NoteSkinSnapshot } from "@/shared/api";
import { trackColorForSkin } from "@/shared/stores/noteskin";
import type { PerPlayerConfig } from "@/shared/lib/engine/types";
import {
  buildPanels,
  clampDoublePanelGapPx,
  findPanelByTrack,
  getColumnWidth,
  getReceptorSize,
  usesSplitWidePanelLayout,
} from "@/shared/lib/engine/render/panelLayout";
import { resolveTrackEffects } from "@/shared/lib/engine/render/playerEffects";
import {
  getColumnLabel as schemaColumnLabel,
  getPumpDirection as schemaPumpDirection,
  getTrackColors as schemaTrackColors,
  getTrackDirection as schemaTrackDirection,
  isCenterColumn as schemaIsCenterColumn,
  type ArrowDirection,
} from "@/shared/lib/engine/render/noteSchema";
import {
  drawHoldDrawer,
  drawLiftDrawer,
  drawMineDrawer,
  drawNoteDrawer,
  drawReceptorDrawer,
  type RenderDrawerDeps,
} from "@/shared/lib/engine/render/drawers";
import { drawBeatLines } from "@/shared/lib/engine/render/beatLines";
import { createParticleSystem, type ParticleSystem } from "@/shared/lib/engine/render/particles";
import { createQualityState, tickRenderQuality, type QualityState } from "@/shared/lib/engine/render/renderQuality";
import { drawComboHud, drawJudgmentFlashHud } from "@/shared/lib/engine/render/noteFieldHud";
import { getThemePrimaryRgba } from "@/shared/lib/themeCssBridge";
import { logDebug, isDebugLogLevelEnabled } from "@/shared/lib/devLog";

/** RAF time of last visibility diagnostic log per player panel (dev only). */
const lastNoteVisibilityLogMsByPlayer: [number, number] = [0, 0];
const NOTE_VISIBILITY_LOG_INTERVAL_MS = 450;
const NOTE_Y_CLIP_PAD = 50;
const PERF_LOG_INTERVAL_MS = 1500;
const HOLD_PARTICLE_EMIT_INTERVAL_MS = 60;

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
let perfWindowStartMs = 0;
let perfFrameCount = 0;
let perfFrameTotalMs = 0;
let perfDrawPanelTotalMs = 0;
const holdParticleLastEmitMs = new Map<string, number>();

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
let panelGradientCache = new Map<string, CanvasGradient>();

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
  panelGradientCache = new Map<string, CanvasGradient>();
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

function getPanelLineGradient(c: CanvasRenderingContext2D, panel: PanelConfig): CanvasGradient {
  const gradientKey = [
    panel.player,
    panel.receptorY,
    panel.width,
    getThemePrimaryRgba(0.12),
  ].join("\0");
  const cached = panelGradientCache.get(gradientKey);
  if (cached) {
    return cached;
  }
  const grad = c.createLinearGradient(panel.x, panel.receptorY - 12, panel.x, panel.receptorY + 12);
  grad.addColorStop(0, getThemePrimaryRgba(0));
  grad.addColorStop(0.5, getThemePrimaryRgba(0.12));
  grad.addColorStop(1, getThemePrimaryRgba(0));
  panelGradientCache.set(gradientKey, grad);
  return grad;
}

function drawPanel(c: CanvasRenderingContext2D, panel: PanelConfig, h: number, time: number, _dt: number) {
  const panelStarted = performance.now();
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

  c.fillStyle = getPanelLineGradient(c, panel);
  c.fillRect(px, receptorY - 12, pWidth, 24);
  c.strokeStyle = "rgba(255, 255, 255, 0.18)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(px, receptorY);
  c.lineTo(px + pWidth, receptorY);
  c.stroke();

  const blankLead = engine.isChartLeadInBlankPhase();
  const activeHoldParticleKeys = new Set<string>();

  if (!blankLead && engine.judgment) {
    for (const hold of engine.judgment.holds) {
      if (hold.track >= panel.startTrack && hold.track < panel.startTrack + numTracks) {
        drawHoldDrawer(c, engine, hold, px, receptorY, h, colW, recSize, panel, deps);
        const keyStillDown = engine.keysDown[hold.track] ?? false;
        const shouldEmitHoldParticles = hold.isRoll
          ? hold.active && hold.held && !hold.finished
          : hold.active && !hold.finished && (props.engine.config.autoPlay || keyStillDown);
        if (shouldEmitHoldParticles && (props.engine.config.showParticles ?? true)) {
          const key = `${panel.player}:${hold.track}:${hold.startRow}`;
          activeHoldParticleKeys.add(key);
          const lastEmit = holdParticleLastEmitMs.get(key) ?? -Infinity;
          if (time - lastEmit >= HOLD_PARTICLE_EMIT_INTERVAL_MS) {
            holdParticleLastEmitMs.set(key, time);
            const localTrack = hold.track - panel.startTrack;
            const pxCenter = px + localTrack * colW + colW / 2;
            particleSystem.spawnHitEffect(
              pxCenter,
              receptorY,
              getTrackColor(hold.track, panel),
              "W3",
              quality.level,
              true,
            );
          }
        }
      }
    }
  }

  for (const key of holdParticleLastEmitMs.keys()) {
    if (key.startsWith(`${panel.player}:`) && !activeHoldParticleKeys.has(key)) {
      holdParticleLastEmitMs.delete(key);
    }
  }

  if (!blankLead) {
    const visibleRange = 3.0;
    const [visibleStart, visibleEnd] = engine.getVisibleNoteRange(visibleRange, visibleRange);
    const playheadChart = engine.getChartPlayheadSeconds();

    const pi = panel.player === 2 ? 1 : 0;
    const shouldLogVisibility =
      isDebugLogLevelEnabled &&
      engine.state === "playing" &&
      time - lastNoteVisibilityLogMsByPlayer[pi]! >= NOTE_VISIBILITY_LOG_INTERVAL_MS;

    let visWrongPanel = 0;
    let visJudged = 0;
    let visTimeGate = 0;
    let visYClip = 0;
    let visAlpha0 = 0;
    let visDrawn = 0;
    let visSampleYClip:
      | {
          row: number;
          second: number;
          dChartSec: number;
          y: number;
          edge: "aboveField" | "belowField";
          beatAtNote: number;
          beatDelta: number;
          scrollPx: number;
        }
      | undefined;

    const effectCache = new Map<number, { sudden: boolean; hidden: boolean; rotate: boolean }>();
    for (let i = visibleStart; i < visibleEnd; i++) {
      const note = engine.notes[i]!;
      if (note.track < panel.startTrack || note.track >= panel.startTrack + numTracks) {
        visWrongPanel++;
        continue;
      }
      if (engine.judgment?.isNoteJudged(note.track, note.row)) {
        visJudged++;
        continue;
      }
      if (Math.abs(note.second - playheadChart) > visibleRange) {
        visTimeGate++;
        continue;
      }

      const localTrack = note.track - panel.startTrack;
      const y = engine.getNoteY(note.second, receptorY, h, panel.speedMod, panel.reverse);
      if (y < -NOTE_Y_CLIP_PAD || y > h + NOTE_Y_CLIP_PAD) {
        visYClip++;
        if (
          shouldLogVisibility &&
          visSampleYClip === undefined &&
          note.second >= playheadChart - 1e-6
        ) {
          const beatAtNote = engine.timeToBeat(note.second);
          const beatDelta = beatAtNote - engine.currentBeat;
          const scrollPx = engine.getVisualBeatDistance(engine.currentBeat, beatAtNote, panel.speedMod);
          visSampleYClip = {
            row: note.row,
            second: note.second,
            dChartSec: note.second - playheadChart,
            y,
            edge: y < -NOTE_Y_CLIP_PAD ? "aboveField" : "belowField",
            beatAtNote,
            beatDelta,
            scrollPx,
          };
        }
        continue;
      }

      const nx = px + localTrack * colW;
      let fx = effectCache.get(note.track);
      if (!fx) {
        fx = getEffectsForTrack(note.track);
        effectCache.set(note.track, fx);
      }

      let noteAlpha = 1.0;
      if (fx.sudden || fx.hidden) {
        const fadeZone = h * 0.1;
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
      if (noteAlpha <= 0) {
        visAlpha0++;
        continue;
      }

      visDrawn++;

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

    if (shouldLogVisibility) {
      lastNoteVisibilityLogMsByPlayer[pi] = time;
      const beatAtPh = engine.timeToBeat(playheadChart);
      logDebug("NoteField", "noteVisibility", {
        player: panel.player,
        engineState: engine.state,
        playheadChartSec: playheadChart,
        currentBeat: engine.currentBeat,
        beatAtPlayhead: beatAtPh,
        bpmAtPlayhead: engine.getBpmAtBeat(beatAtPh),
        baseBpm: engine.baseBpm,
        speedMod: panel.speedMod,
        reverse: panel.reverse,
        visibleRangeSec: visibleRange,
        indexRange: [visibleStart, visibleEnd],
        notesTotal: engine.notes.length,
        fieldHeight: h,
        receptorY,
        yClipPad: NOTE_Y_CLIP_PAD,
        counts: {
          wrongPanel: visWrongPanel,
          judged: visJudged,
          timeGate: visTimeGate,
          yClip: visYClip,
          alpha0: visAlpha0,
          drawn: visDrawn,
        },
        firstFutureNoteYClipped: visSampleYClip,
      });
    }
  }

  const trackColorCache = new Map<number, string>();
  for (let col = 0; col < numTracks; col++) {
    const lx = px + col * colW;
    const trackIdx = panel.startTrack + col;
    const pressed = engine.keysDown[trackIdx] ?? false;
    const cachedColor = trackColorCache.get(trackIdx);
    const color = cachedColor ?? getTrackColor(trackIdx, panel);
    if (!cachedColor) trackColorCache.set(trackIdx, color);

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
  perfDrawPanelTotalMs += performance.now() - panelStarted;
}

function drawFrame(time: number) {
  const frameStarted = performance.now();
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

  const frameCost = performance.now() - frameStarted;
  perfFrameCount++;
  perfFrameTotalMs += frameCost;
  if (import.meta.env.DEV) {
    if (perfWindowStartMs <= 0) {
      perfWindowStartMs = frameStarted;
    }
    const elapsed = frameStarted - perfWindowStartMs;
    if (elapsed >= PERF_LOG_INTERVAL_MS && perfFrameCount > 0) {
      const avgFrame = perfFrameTotalMs / perfFrameCount;
      const avgPanel = perfDrawPanelTotalMs / perfFrameCount;
      logDebug("NoteFieldPerf", {
        metric: "notefield.frame.ms",
        avgFrameMs: Number(avgFrame.toFixed(2)),
        avgDrawPanelMs: Number(avgPanel.toFixed(2)),
        frames: perfFrameCount,
      });
      perfWindowStartMs = frameStarted;
      perfFrameCount = 0;
      perfFrameTotalMs = 0;
      perfDrawPanelTotalMs = 0;
    }
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
      const particleColor = getTrackColor(track, panel);
      if (judgment !== "Miss" && judgment !== "Way Off" && judgment !== "Boo") {
        particleSystem.spawnHitEffect(
          px, receptorY, particleColor,
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