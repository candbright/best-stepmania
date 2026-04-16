import { audioSetVolume } from "@/api/audio";
import { logOptionalRejection } from "@/utils/devLog";

/** Push master/music levels (0–100) to the backend player. */
export function syncAudioVolume(musicPercent: number, masterPercent: number): void {
  void audioSetVolume(musicPercent / 100, masterPercent / 100).catch((e) =>
    logOptionalRejection("services.tauri.syncAudioVolume", e),
  );
}
