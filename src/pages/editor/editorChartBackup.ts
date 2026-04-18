/**
 * Local crash-safety draft for the chart editor (localStorage).
 * One slot per (songPath, chartIndex).
 */

import type { EditorState } from "@/pages/editor/useEditorState";
import { logWarn } from "@/shared/lib/devLog";

const STORAGE_PREFIX = "bsm-editor-draft-v1";

export type EditorChartBackupStored = EditorChartBackupV1;

export interface EditorChartBackupV1 {
  v: 1;
  savedAt: number;
  songPath: string;
  chartIndex: number;
  /** `serializeEditorChartPersist` at save time — compare to disk chart baseline. */
  chartFingerprint: string;
  /** `serializeEditorMetaPersist` at save time — compare to disk meta baseline. */
  metaFingerprint: string;
  chart: ReturnType<typeof buildChartPersistObject>;
  meta: ReturnType<typeof buildMetaPersistObject>;
  scrollBeat: number;
  zoom: number;
  quantize: number;
  editorRoutineLayer: 1 | 2;
}

function buildChartPersistObject(s: EditorState) {
  return {
    notes: s.noteRows.value,
    bpms: s.bpmChanges.value,
    timeSignatures: s.timeSignatures.value,
    tickcounts: s.tickcounts.value,
    comboChanges: s.comboChanges.value,
    speedChanges: s.speedChanges.value,
    scrollChanges: s.scrollChanges.value,
    labelChanges: s.labelChanges.value,
    editChartStepsType: s.editChartStepsType.value,
    editChartDifficulty: s.editChartDifficulty.value,
    editChartMeter: s.editChartMeter.value,
  };
}

function buildMetaPersistObject(s: EditorState) {
  return {
    metaTitle: s.metaTitle.value,
    metaSubtitle: s.metaSubtitle.value,
    metaArtist: s.metaArtist.value,
    metaGenre: s.metaGenre.value,
    metaMusic: s.metaMusic.value,
    metaBanner: s.metaBanner.value,
    metaBackground: s.metaBackground.value,
    metaSampleStart: s.metaSampleStart.value,
    metaSampleLength: s.metaSampleLength.value,
    metaOffset: s.metaOffset.value,
  };
}

/** Serialized chart state used for save-to-file + chart panel (exit guard). Excludes offset (see meta persist). */
export function serializeEditorChartPersist(s: EditorState): string {
  return JSON.stringify(buildChartPersistObject(s));
}

/** Song metadata panel + offset (offset is written by both chart save and metadata save). */
export function serializeEditorMetaPersist(s: EditorState): string {
  return JSON.stringify(buildMetaPersistObject(s));
}

function storageKey(songPath: string, chartIndex: number): string {
  return `${STORAGE_PREFIX}:${chartIndex}:${songPath}`;
}

function normalizeBackup(parsed: unknown): EditorChartBackupStored | null {
  const p = parsed as Record<string, unknown>;
  if (p.v !== 1 || typeof p.songPath !== "string" || typeof p.chartIndex !== "number") return null;
  const chart = p.chart as Record<string, unknown> | undefined;
  const meta = p.meta as Record<string, unknown> | undefined;
  if (!chart || !meta) return null;

  if (typeof p.chartFingerprint === "string" && typeof p.metaFingerprint === "string") {
    return parsed as EditorChartBackupStored;
  }

  const chartNorm = JSON.parse(JSON.stringify(chart)) as Record<string, unknown>;
  const legacyOffset = chartNorm.metaOffset;
  delete chartNorm.metaOffset;

  const metaNorm = JSON.parse(JSON.stringify(meta)) as Record<string, unknown>;
  if (typeof metaNorm.metaOffset !== "number") {
    metaNorm.metaOffset = typeof legacyOffset === "number" ? legacyOffset : 0;
  }

  const chartPayload = chartNorm as unknown as EditorChartBackupStored["chart"];
  const metaPayload = metaNorm as unknown as EditorChartBackupStored["meta"];

  return {
    v: 1,
    savedAt: typeof p.savedAt === "number" ? p.savedAt : Date.now(),
    songPath: p.songPath,
    chartIndex: p.chartIndex,
    chartFingerprint: JSON.stringify(chartPayload),
    metaFingerprint: JSON.stringify(metaPayload),
    chart: chartPayload,
    meta: metaPayload,
    scrollBeat: typeof p.scrollBeat === "number" ? p.scrollBeat : 0,
    zoom: typeof p.zoom === "number" ? p.zoom : 80,
    quantize: typeof p.quantize === "number" ? p.quantize : 4,
    editorRoutineLayer: p.editorRoutineLayer === 2 ? 2 : 1,
  };
}

export function readEditorChartBackup(songPath: string, chartIndex: number): EditorChartBackupStored | null {
  try {
    const raw = localStorage.getItem(storageKey(songPath, chartIndex));
    if (!raw) return null;
    return normalizeBackup(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeEditorChartBackup(s: EditorState, songPath: string, chartIndex: number): void {
  const payload: EditorChartBackupStored = {
    v: 1,
    savedAt: Date.now(),
    songPath,
    chartIndex,
    chartFingerprint: serializeEditorChartPersist(s),
    metaFingerprint: serializeEditorMetaPersist(s),
    chart: buildChartPersistObject(s),
    meta: buildMetaPersistObject(s),
    scrollBeat: s.scrollBeat.value,
    zoom: s.zoom.value,
    quantize: s.quantize.value,
    editorRoutineLayer: s.editorRoutineLayer.value,
  };
  try {
    localStorage.setItem(storageKey(songPath, chartIndex), JSON.stringify(payload));
  } catch (e: unknown) {
    logWarn("EditorBackup", "write failed:", e);
  }
}

export function clearEditorChartBackup(songPath: string, chartIndex: number): void {
  try {
    localStorage.removeItem(storageKey(songPath, chartIndex));
  } catch {
    /* ignore */
  }
}

/** True if backup matches current disk snapshot (no need to prompt). */
export function editorBackupMatchesDisk(
  backup: EditorChartBackupStored,
  diskChartBaseline: string,
  diskMetaBaseline: string,
): boolean {
  return backup.chartFingerprint === diskChartBaseline && backup.metaFingerprint === diskMetaBaseline;
}

/** Apply crash backup into live editor state (caller resets undo afterward). */
export function applyEditorChartBackupToState(s: EditorState, data: EditorChartBackupStored): void {
  s.noteRows.value = JSON.parse(JSON.stringify(data.chart.notes)) as typeof s.noteRows.value;
  s.bpmChanges.value = JSON.parse(JSON.stringify(data.chart.bpms)) as typeof s.bpmChanges.value;
  s.timeSignatures.value = JSON.parse(JSON.stringify(data.chart.timeSignatures)) as typeof s.timeSignatures.value;
  s.tickcounts.value = JSON.parse(JSON.stringify(data.chart.tickcounts)) as typeof s.tickcounts.value;
  s.comboChanges.value = JSON.parse(JSON.stringify(data.chart.comboChanges)) as typeof s.comboChanges.value;
  s.speedChanges.value = JSON.parse(JSON.stringify(data.chart.speedChanges)) as typeof s.speedChanges.value;
  s.scrollChanges.value = JSON.parse(JSON.stringify(data.chart.scrollChanges)) as typeof s.scrollChanges.value;
  s.labelChanges.value = JSON.parse(JSON.stringify(data.chart.labelChanges)) as typeof s.labelChanges.value;
  s.editChartStepsType.value = data.chart.editChartStepsType;
  s.editChartDifficulty.value = data.chart.editChartDifficulty;
  s.editChartMeter.value = data.chart.editChartMeter;
  s.bpm.value = s.bpmChanges.value[0]?.bpm ?? s.bpm.value;

  s.metaTitle.value = data.meta.metaTitle;
  s.metaSubtitle.value = data.meta.metaSubtitle;
  s.metaArtist.value = data.meta.metaArtist;
  s.metaGenre.value = data.meta.metaGenre;
  s.metaMusic.value = data.meta.metaMusic;
  s.metaBanner.value = data.meta.metaBanner;
  s.metaBackground.value = data.meta.metaBackground;
  s.metaSampleStart.value = data.meta.metaSampleStart;
  s.metaSampleLength.value = data.meta.metaSampleLength;
  s.metaOffset.value = data.meta.metaOffset;

  s.scrollBeat.value = Math.max(0, data.scrollBeat);
  s.zoom.value = data.zoom;
  s.quantize.value = data.quantize;
  s.editorRoutineLayer.value = data.editorRoutineLayer === 2 ? 2 : 1;
}
