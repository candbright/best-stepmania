import * as api from "@/shared/api";
import { logOptionalRejection } from "@/shared/lib/devLog";
import { usePlayerStore } from "@/shared/stores/player";
import { useSessionStore } from "@/shared/stores/session";

/**
 * Run editor IPC prep on the **current** screen (song select), then navigate to `/editor`.
 * Sets `editorPrimedCharts` + `editorEntryAudioPrimed` for EditorScreen to skip redundant decode/load.
 */
export async function primeEditorEntryResources(
  setMessage: (msg: string) => void,
  t: (key: string) => string,
  signal?: AbortSignal,
): Promise<void> {
  const player = usePlayerStore();
  const session = useSessionStore();
  session.clearEditorEntryPrime();

  setMessage(t("loadingPhase.preparing"));
  await player.stopForGame();
  if (signal?.aborted) {
    throw new DOMException("aborted", "AbortError");
  }
  await api.audioStop().catch((e) => logOptionalRejection("editorEntryPrefetch.audioStop", e));
  await api.audioSetRate(1.0).catch((e) => logOptionalRejection("editorEntryPrefetch.audioSetRate", e));

  setMessage(t("loadingPhase.audio"));
  await player.waitForLoadComplete(10000, signal);
  if (signal?.aborted) {
    throw new DOMException("aborted", "AbortError");
  }
  if (player.status === "loading") {
    throw new Error("Audio load timeout");
  }

  const song = session.currentSong;
  if (!song) {
    throw new Error("No song selected");
  }

  setMessage(t("loadingPhase.editorCharts"));
  const charts = await api.loadChart(song.path);
  if (signal?.aborted) {
    throw new DOMException("aborted", "AbortError");
  }
  session.editorPrimedCharts = { path: song.path, charts };

  setMessage(t("loadingPhase.editorAudio"));
  const musicPath = await api.getSongMusicPath(song.path);
  await api.audioLoad(musicPath);
  session.editorEntryAudioPrimed = true;
}
