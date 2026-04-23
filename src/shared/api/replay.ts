import { invoke } from "./core";
import type { ReplayPayload, SaveScoreWithReplayRequest } from "./profile";

export async function saveScoreWithReplay(req: SaveScoreWithReplayRequest): Promise<void> {
  return invoke("save_score_with_replay", { req });
}

export async function getReplayByScoreId(scoreId: string): Promise<ReplayPayload | null> {
  return invoke<ReplayPayload | null>("get_replay_by_score_id", { scoreId });
}
