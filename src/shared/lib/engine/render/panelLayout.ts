import type { NoteSkinSnapshot } from "@/shared/api";
import type { CoopMode, PanelConfig, PerPlayerConfig } from "@/shared/lib/engine/types";

/** Two side-by-side panels (each half the lanes) — used for double, routine, and solo on wide (e.g. 10-key) charts. */
export function usesSplitWidePanelLayout(coopMode: CoopMode, numTracks: number): boolean {
  return (
    numTracks >= 8 &&
    (coopMode === "double" || coopMode === "co-op" || coopMode === "solo")
  );
}

const DEFAULT_SPEED_MOD = "C500";
const DEFAULT_NOTE_SCALE = 1;

/** Default and allowed range for horizontal gap between P1/P2 panels (double / co-op). */
export const DOUBLE_PANEL_GAP_DEFAULT_PX = 56;
export const DOUBLE_PANEL_GAP_MIN_PX = 16;
export const DOUBLE_PANEL_GAP_MAX_PX = 160;

export function clampDoublePanelGapPx(gap: number): number {
  const n = Math.round(Number(gap));
  if (!Number.isFinite(n)) return DOUBLE_PANEL_GAP_DEFAULT_PX;
  return Math.min(DOUBLE_PANEL_GAP_MAX_PX, Math.max(DOUBLE_PANEL_GAP_MIN_PX, n));
}

/** Column pixel width for a given track count. */
export function getColumnWidth(numTracks?: number): number {
  const n = numTracks ?? 4;
  if (n <= 4) return 64;
  if (n <= 6) return 56;
  if (n <= 8) return 48;
  return 40;
}

/** Receptor square size in pixels for a given track count and note scale. */
export function getReceptorSize(numTracks: number, noteScale: number): number {
  let base: number;
  if (numTracks <= 4) base = 56;
  else if (numTracks <= 6) base = 48;
  else if (numTracks <= 8) base = 40;
  else base = 34;
  return Math.round(base * noteScale);
}

interface BuildPanelsInput {
  width: number;
  height: number;
  numTracks: number;
  coopMode: CoopMode;
  playerConfigs: [PerPlayerConfig, PerPlayerConfig];
  skinConfig1?: NoteSkinSnapshot | null;
  skinConfig2?: NoteSkinSnapshot | null;
  gap?: number;
  uiScale?: number;
}

export function buildPanels(input: BuildPanelsInput): PanelConfig[] {
  const {
    width,
    height,
    numTracks,
    coopMode,
    playerConfigs,
    skinConfig1,
    skinConfig2,
    gap = DOUBLE_PANEL_GAP_DEFAULT_PX,
    uiScale = 1,
  } = input;
  const gapPx = clampDoublePanelGapPx(gap);
  const receptorBaseY = Math.round(100 * uiScale);

  const [p1, p2] = playerConfigs;

  if (usesSplitWidePanelLayout(coopMode, numTracks)) {
    const half = Math.floor(numTracks / 2);
    const colW = getColumnWidth(half) * uiScale;
    const panelWidth = half * colW;
    const totalWidth = panelWidth * 2 + gapPx;
    const startX = Math.floor((width - totalWidth) / 2);

    return [
      {
        numTracks: half,
        x: startX,
        width: panelWidth,
        receptorY: p1.reverse ? height - receptorBaseY : receptorBaseY,
        player: 1,
        reverse: p1.reverse,
        noteScale: p1.noteScale ?? DEFAULT_NOTE_SCALE,
        speedMod: p1.speedMod ?? DEFAULT_SPEED_MOD,
        skinConfig: skinConfig1 ?? null,
        startTrack: 0,
      },
      {
        numTracks: half,
        x: startX + panelWidth + gapPx,
        width: panelWidth,
        receptorY: p2.reverse ? height - receptorBaseY : receptorBaseY,
        player: 2,
        reverse: p2.reverse,
        noteScale: p2.noteScale ?? DEFAULT_NOTE_SCALE,
        speedMod: p2.speedMod ?? DEFAULT_SPEED_MOD,
        skinConfig: skinConfig2 ?? skinConfig1 ?? null,
        startTrack: half,
      },
    ];
  }

  if (coopMode === "co-op" && numTracks <= 5) {
    const colW = getColumnWidth(numTracks) * uiScale;
    const panelWidth = numTracks * colW;
    const totalWidth = panelWidth * 2 + gapPx;
    const startX = Math.floor((width - totalWidth) / 2);

    return [
      {
        numTracks,
        x: startX,
        width: panelWidth,
        receptorY: p1.reverse ? height - receptorBaseY : receptorBaseY,
        player: 1,
        reverse: p1.reverse,
        noteScale: p1.noteScale ?? DEFAULT_NOTE_SCALE,
        speedMod: p1.speedMod ?? DEFAULT_SPEED_MOD,
        skinConfig: skinConfig1 ?? null,
        startTrack: 0,
      },
      {
        numTracks,
        x: startX + panelWidth + gapPx,
        width: panelWidth,
        receptorY: p2.reverse ? height - receptorBaseY : receptorBaseY,
        player: 2,
        reverse: p2.reverse,
        noteScale: p2.noteScale ?? DEFAULT_NOTE_SCALE,
        speedMod: p2.speedMod ?? DEFAULT_SPEED_MOD,
        skinConfig: skinConfig2 ?? skinConfig1 ?? null,
        startTrack: 0,
      },
    ];
  }

  const colW = getColumnWidth(numTracks) * uiScale;
  const panelWidth = numTracks * colW;

  return [
    {
      numTracks,
      x: Math.floor((width - panelWidth) / 2),
      width: panelWidth,
      receptorY: p1.reverse ? height - receptorBaseY : receptorBaseY,
      player: 1,
      reverse: p1.reverse,
      noteScale: p1.noteScale ?? DEFAULT_NOTE_SCALE,
      speedMod: p1.speedMod ?? DEFAULT_SPEED_MOD,
      skinConfig: skinConfig1 ?? null,
      startTrack: 0,
    },
  ];
}

export function findPanelByTrack(track: number, panels: PanelConfig[]): PanelConfig | undefined {
  return panels.find((panel) => track >= panel.startTrack && track < panel.startTrack + panel.numTracks);
}
