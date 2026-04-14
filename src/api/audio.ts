import { invoke, invokeWithRetry } from "./core";

export interface AudioInfo {
  duration: number;
  sampleRate: number;
}

export async function audioLoad(musicPath: string): Promise<AudioInfo> {
  return invokeWithRetry<AudioInfo>("audio_load", { musicPath });
}

export async function audioPlay(requestToken?: number): Promise<void> {
  return invoke("audio_play", { requestToken });
}

export async function audioPause(requestToken?: number): Promise<void> {
  return invoke("audio_pause", { requestToken });
}

export async function audioSeek(seconds: number, requestToken?: number): Promise<void> {
  return invoke("audio_seek", { seconds, requestToken });
}

export async function audioGetTime(): Promise<number> {
  return invoke<number>("audio_get_time");
}

export async function audioGetDuration(): Promise<number> {
  return invoke<number>("audio_get_duration");
}

export interface AudioPlaybackState {
  time: number;
  duration: number;
}

export async function audioGetPlaybackState(): Promise<AudioPlaybackState> {
  return invoke<AudioPlaybackState>("audio_get_playback_state");
}

export async function audioIsPlaying(): Promise<boolean> {
  return invokeWithRetry<boolean>("audio_is_playing");
}

export async function audioSetVolume(
  musicVolume?: number,
  masterVolume?: number,
): Promise<void> {
  return invoke("audio_set_volume", { musicVolume, masterVolume });
}

export async function audioSetRate(rate: number): Promise<void> {
  return invoke("audio_set_rate", { rate });
}

export async function audioStop(requestToken?: number): Promise<void> {
  return invoke("audio_stop", { requestToken });
}

export async function audioClearCache(): Promise<void> {
  return invoke("audio_clear_cache");
}

export async function audioPreview(
  musicPath: string,
  start: number,
  length: number,
  requestToken?: number,
): Promise<void> {
  return invoke("audio_preview", { musicPath, start, length, requestToken });
}

export async function audioPreload(musicPath: string): Promise<void> {
  return invoke("audio_preload", { musicPath });
}
