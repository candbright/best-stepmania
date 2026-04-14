import { invokeWithRetry } from "./core";
import type { TimingDataResponse } from "./editor";

export interface ChartInfoItem {
  stepsType: string;
  difficulty: string;
  meter: number;
  chartName: string;
  noteCount: number;
  numTracks: number;
  chartIndex: number;
}

export interface SongListItem {
  path: string;
  title: string;
  subtitle: string;
  artist: string;
  displayBpm: string;
  bannerPath: string | null;
  backgroundPath: string | null;
  pack: string;
  genre: string;
  sampleStart: number;
  sampleLength: number;
  charts: ChartInfoItem[];
}

export interface ScanStatus {
  scanning: boolean;
  totalFound: number;
  done: boolean;
  error: string | null;
}

export interface ChartInfo {
  stepsType: string;
  difficulty: string;
  meter: number;
  chartName: string;
  description: string;
  noteCount: number;
  numTracks: number;
}

// Import the canonical types from the engine layer; re-export them so consumers
// of @/api (or @/utils/api) get a single source of truth.
// NoteInfo is an alias for ChartNoteInput to keep the external API surface stable.
import type { ChartNoteInput, ChartNoteRow } from "@/engine/types";
export type { ChartNoteInput as NoteInfo, ChartNoteRow };

export async function scanSongs(paths: string[]): Promise<number> {
  return invokeWithRetry<number>("scan_songs", { paths });
}

export async function getSongList(
  sortBy?: string,
  groupBy?: string,
): Promise<SongListItem[]> {
  return invokeWithRetry<SongListItem[]>("get_song_list", { sortBy, groupBy });
}

export async function searchSongs(query: string): Promise<SongListItem[]> {
  return invokeWithRetry<SongListItem[]>("search_songs", { query });
}

export async function getScanStatus(): Promise<ScanStatus> {
  return invokeWithRetry<ScanStatus>("get_scan_status");
}

export async function getSongsDir(): Promise<string> {
  return invokeWithRetry<string>("get_songs_dir");
}

export async function loadChart(songPath: string): Promise<ChartInfo[]> {
  return invokeWithRetry<ChartInfo[]>("load_chart", { songPath });
}

export async function getChartNotes(
  songPath: string,
  chartIndex: number,
): Promise<ChartNoteRow[]> {
  return invokeWithRetry<ChartNoteRow[]>("get_chart_notes", { songPath, chartIndex });
}

/** One IPC round-trip per load: notes + timing for each chart index (gameplay). */
export interface ChartPlayBundle {
  notes: ChartNoteRow[];
  timing: TimingDataResponse;
}

export async function getChartPlayPayload(
  songPath: string,
  chartIndices: number[],
): Promise<ChartPlayBundle[]> {
  return invokeWithRetry<ChartPlayBundle[]>("get_chart_play_payload", { songPath, chartIndices });
}

export async function getSongMusicPath(songPath: string): Promise<string> {
  return invokeWithRetry<string>("get_song_music_path", { songPath });
}
