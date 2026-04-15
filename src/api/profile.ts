import { invoke } from "./core";

export interface ProfileInfo {
  id: string;
  displayName: string;
  totalPlayCount: number;
  totalDancePoints: number;
}

export interface HighScoreInfo {
  grade: string;
  dpPercent: number;
  score: number;
  maxCombo: number;
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  w5: number;
  miss: number;
  held: number;
  letGo: number;
  minesHit: number;
  playedAt: string;
  fullCombo: boolean;
}

export interface SaveScoreRequest {
  profileId: string;
  songPath: string;
  stepsType: string;
  difficulty: string;
  meter: number;
  grade: string;
  dpPercent: number;
  score: number;
  maxCombo: number;
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  w5: number;
  miss: number;
  held: number;
  letGo: number;
  minesHit: number;
  modifiers: string;
}

export async function getProfiles(): Promise<ProfileInfo[]> {
  return invoke<ProfileInfo[]>("get_profiles");
}

export async function createProfile(name: string): Promise<ProfileInfo> {
  return invoke<ProfileInfo>("create_profile", { name });
}

export async function saveScore(req: SaveScoreRequest): Promise<void> {
  return invoke("save_score", { req });
}

const DEFAULT_TOP_SCORES_LIMIT = 10;

export async function getTopScores(
  profileId: string,
  songPath: string,
  stepsType: string,
  difficulty: string,
  limit: number = DEFAULT_TOP_SCORES_LIMIT,
): Promise<HighScoreInfo[]> {
  return invoke<HighScoreInfo[]>("get_top_scores", {
    profileId,
    songPath,
    stepsType,
    difficulty,
    limit,
  });
}

export async function clearChartTopScores(
  profileId: string,
  songPath: string,
  stepsType: string,
  difficulty: string,
): Promise<void> {
  return invoke("clear_chart_top_scores", {
    profileId,
    songPath,
    stepsType,
    difficulty,
  });
}

export async function getRecentScores(
  profileId: string,
  limit?: number,
): Promise<HighScoreInfo[]> {
  return invoke<HighScoreInfo[]>("get_recent_scores", { profileId, limit });
}

export async function toggleFavorite(songPath: string): Promise<boolean> {
  return invoke<boolean>("toggle_favorite", { songPath });
}

export async function isFavorite(songPath: string): Promise<boolean> {
  return invoke<boolean>("is_favorite", { songPath });
}

export async function getFavorites(): Promise<string[]> {
  return invoke<string[]>("get_favorites", {});
}

export async function cleanupOrphanedFavorites(): Promise<number> {
  return invoke<number>("cleanup_orphaned_favorites", {});
}
