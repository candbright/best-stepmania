import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";

/** Subscribe to backend `audio-playback` events (thin wrapper for FSD / import hygiene). */
export async function listenAudioPlayback<T>(handler: EventCallback<T>): Promise<UnlistenFn> {
  return listen<T>("audio-playback", handler);
}
