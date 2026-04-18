import type { AudioPort } from "../ports";
import * as api from "@/shared/api";

export function createTauriAudioPort(): AudioPort {
  return {
    async load(musicPath: string) {
      return api.audioLoad(musicPath);
    },
    async play() {
      return api.audioPlay();
    },
    async pause() {
      return api.audioPause();
    },
    async seek(seconds: number) {
      return api.audioSeek(seconds);
    },
    async getTime() {
      return api.audioGetTime();
    },
    async getPlaybackState() {
      return api.audioGetPlaybackState();
    },
    async stop() {
      return api.audioStop();
    },
  };
}
