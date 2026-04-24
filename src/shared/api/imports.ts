import { invoke } from "./core";

export interface ImportWarning {
  songName: string;
  missingAudio: boolean;
  missingCover: boolean;
  missingChart: boolean;
}

export interface ImportResult {
  importedCount: number;
  skippedCount: number;
  errors: string[];
  warnings: ImportWarning[];
}

export interface SongPackInfo {
  name: string;
  path: string;
  songCount: number;
  sizeMb: number;
  /** Whether this is the undeletable root pack (maps to .root directory) */
  isRoot?: boolean;
}

export interface CreateSongRequest {
  packName?: string;
  title?: string;
  artist?: string;
  subtitle?: string;
  genre?: string;
  musicSourcePath?: string;
  coverSourcePath?: string;
  /** Optional background image; defaults to banner when omitted */
  backgroundSourcePath?: string;
  /** Global offset in seconds (SM #OFFSET); default 0 */
  offset?: number;
  /** Initial BPM at beat 0; default 120 */
  bpm?: number;
  /** Preview start in seconds; default 0 */
  sampleStart?: number;
  /** Preview length in seconds; default 12 */
  sampleLength?: number;
  /** Create an empty chart in the .sm file */
  createChart?: boolean;
  /** Steps type for the initial chart (e.g. 'dance-single') */
  stepsType?: string;
  /** Difficulty label (e.g. 'Easy') */
  difficulty?: string;
  /** Numeric meter/level */
  meter?: number;
}

export interface CreateSongResult {
  songPath: string;
  chartPath: string;
  usedDefaultMusic: boolean;
  usedDefaultCover: boolean;
}

export interface PrepareImportResult {
  songDir: string;
  folderName: string;
  hasAudio: boolean;
  hasCover: boolean;
  hasChart: boolean;
  packName: string;
}

export interface InspectImportSourceResult {
  folderName: string;
  hasAudio: boolean;
  hasCover: boolean;
  hasChart: boolean;
  title: string;
  artist: string;
  subtitle: string;
  genre: string;
  bpm: number;
  offset: number;
  musicSourcePath: string;
  coverSourcePath: string;
  backgroundSourcePath: string;
  chartSourcePath: string;
}

export async function importSongPack(sourcePath: string): Promise<ImportResult> {
  return invoke<ImportResult>("import_song_pack", { sourcePath });
}

export async function importSingleSong(
  sourcePath: string,
  packName: string,
): Promise<ImportResult> {
  return invoke<ImportResult>("import_single_song", { sourcePath, packName });
}

export async function prepareSongImport(
  sourcePath: string,
  packName: string,
): Promise<PrepareImportResult> {
  return invoke<PrepareImportResult>("prepare_song_import", { sourcePath, packName });
}

export async function inspectSongImportSource(
  sourcePath: string,
): Promise<InspectImportSourceResult> {
  return invoke<InspectImportSourceResult>("inspect_song_import_source", { sourcePath });
}

export async function createChartForImported(
  songDir: string,
  title: string,
  artist: string,
  subtitle: string,
  genre: string,
  bpm: number,
  offset: number,
  stepsType: string,
  difficulty: string,
  meter: number,
  createChart: boolean,
  musicSourcePath: string,
  coverSourcePath: string,
  backgroundSourcePath: string,
  chartSourcePath: string,
): Promise<string> {
  return invoke<string>("create_chart_for_imported", {
    songDir,
    title,
    artist,
    subtitle,
    genre,
    bpm,
    offset,
    stepsType,
    difficulty,
    meter,
    createChart,
    musicSourcePath,
    coverSourcePath,
    backgroundSourcePath,
    chartSourcePath,
  });
}

export async function createSong(req: CreateSongRequest): Promise<CreateSongResult> {
  return invoke<CreateSongResult>("create_song", { req });
}

export async function listSongPacks(): Promise<SongPackInfo[]> {
  return invoke<SongPackInfo[]>("list_song_packs");
}

export async function createEmptyPack(packName: string): Promise<void> {
  return invoke("create_empty_pack", { packName });
}

export async function deleteSongPack(packName: string): Promise<void> {
  return invoke("delete_song_pack", { packName });
}

export async function deleteSong(songPath: string): Promise<void> {
  return invoke("delete_song", { songPath });
}

export async function getSongAssetPath(
  songPath: string,
  assetType: string,
): Promise<string> {
  return invoke<string>("get_song_asset_path", { songPath, assetType });
}

export async function readFileBase64(path: string): Promise<string> {
  return invoke<string>("read_file_base64", { path });
}
