import { audioSetVolume } from "@/shared/api/audio";
import { logDebug } from "@/shared/lib/devLog";

/** Push master/music levels (0–100) to the backend player. */
export function syncAudioVolume(musicPercent: number, masterPercent: number): void {
  void audioSetVolume(musicPercent / 100, masterPercent / 100).catch((e) =>
    logDebug("Optional", "services.tauri.syncAudioVolume", e),
  );
}
