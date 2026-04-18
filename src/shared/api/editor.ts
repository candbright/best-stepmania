import { invoke, invokeWithRetry } from "./core";

export interface SaveChartNote {
  row: number;
  track: number;
  noteType: string;
  holdEndRow: number | null;
  /** Pump routine: layer before/after `&` in chart data */
  routineLayer?: 1 | 2;
}

export interface SongMetadata {
  title: string;
  subtitle: string;
  artist: string;
  genre: string;
  credit: string;
  music: string;
  banner: string;
  background: string;
  sampleStart: number;
  sampleLength: number;
  offset: number;
}

export interface SongMetadataUpdate {
  title?: string;
  subtitle?: string;
  artist?: string;
  genre?: string;
  credit?: string;
  banner?: string;
  background?: string;
  music?: string;
  sampleStart?: number;
  sampleLength?: number;
  offset?: number;
}

export async function saveChart(
  songPath: string,
  chartIndex: number,
  notes: SaveChartNote[],
): Promise<void> {
  return invoke("save_chart", { songPath, chartIndex, notes });
}

export async function createNewChart(
  songPath: string,
  stepsType: string,
  difficulty: string,
  meter: number,
): Promise<number> {
  return invokeWithRetry<number>("create_new_chart", { songPath, stepsType, difficulty, meter });
}

export async function duplicateChart(songPath: string, chartIndex: number): Promise<number> {
  return invokeWithRetry<number>("duplicate_chart", { songPath, chartIndex });
}

export async function deleteChart(
  songPath: string,
  chartIndex: number,
): Promise<void> {
  return invoke("delete_chart", { songPath, chartIndex });
}

export async function exportChartAsSm(
  songPath: string,
  chartIndex: number,
  outputPath: string,
): Promise<void> {
  return invoke("export_chart_as_sm", { songPath, chartIndex, outputPath });
}

/** Appends one chart from a single-difficulty `.sm` file; returns the new chart index. */
export async function importSmAsNewChart(songPath: string, smPath: string): Promise<number> {
  return invoke<number>("import_sm_as_new_chart", { songPath, smPath });
}

export async function updateChartProperties(
  songPath: string,
  chartIndex: number,
  stepsType: string,
  difficulty: string,
  meter: number,
): Promise<void> {
  return invoke("update_chart_properties", {
    songPath,
    chartIndex,
    stepsType,
    difficulty,
    meter,
  });
}

export async function getSongMetadata(songPath: string): Promise<SongMetadata> {
  return invokeWithRetry<SongMetadata>("get_song_metadata", { songPath });
}

export async function updateSongMetadata(
  songPath: string,
  metadata: SongMetadataUpdate,
): Promise<void> {
  return invoke("update_song_metadata", { songPath, metadata });
}

// --- Timing Segments API (StepMania-compatible) ---

export interface BpmChange {
  beat: number;
  bpm: number;
}

export interface TimeSignatureChange {
  beat: number;
  numerator: number;
  denominator: number;
}

export interface TickcountChange {
  beat: number;
  ticksPerBeat: number;
}

export interface ComboChange {
  beat: number;
  combo: number;
  missCombo: number;
}

export interface SpeedChange {
  beat: number;
  ratio: number;
  delay: number;
  unit: 0 | 1; // 0 = beats, 1 = seconds
}

export interface ScrollChange {
  beat: number;
  ratio: number;
}

export interface LabelChange {
  beat: number;
  label: string;
}

export interface TimingDataResponse {
  bpms: BpmChange[];
  stops: [number, number][];  // [beat, duration]
  delays: [number, number][]; // [beat, duration]
  timeSignatures: TimeSignatureChange[];
  tickcounts: TickcountChange[];
  combos: ComboChange[];
  speeds: SpeedChange[];
  scrolls: ScrollChange[];
  labels: LabelChange[];
  offset: number;
}

export interface TimingDataUpdate {
  bpms?: BpmChange[];
  stops?: [number, number][];
  delays?: [number, number][];
  timeSignatures?: TimeSignatureChange[];
  tickcounts?: TickcountChange[];
  combos?: ComboChange[];
  speeds?: SpeedChange[];
  scrolls?: ScrollChange[];
  labels?: LabelChange[];
  offset?: number;
}

export async function getTimingData(
  songPath: string,
  chartIndex?: number,
): Promise<TimingDataResponse> {
  return invokeWithRetry<TimingDataResponse>("get_bpm_changes", { songPath, chartIndex });
}

export async function saveTimingData(
  songPath: string,
  update: TimingDataUpdate,
  chartIndex?: number,
): Promise<void> {
  return invoke("save_bpm_changes", { songPath, chartIndex, update });
}

// Backwards compatibility aliases
export { getTimingData as getBpmChanges, saveTimingData as saveBpmChanges };
export type { TimingDataUpdate as BpmChangesUpdate };
