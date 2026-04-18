import * as api from "@/shared/api";
import { isTauri, openFileDialog, saveFileDialog } from "@/shared/lib/platform";
import type { EditorState } from "../useEditorState";
import { useSessionStore } from "@/shared/stores/session";
import { useLibraryStore } from "@/shared/stores/library";

type SessionStore = ReturnType<typeof useSessionStore>;
type LibraryStore = ReturnType<typeof useLibraryStore>;

function sanitizeFileBase(name: string): string {
  const t = name.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim();
  return t || "chart";
}

function joinPathDirFile(dir: string, file: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.replace(/[/\\]$/, "") + sep + file;
}

export interface EditorSmExchangeDeps {
  s: EditorState;
  session: SessionStore;
  library: LibraryStore;
  t: (key: string) => string;
  setSaveMessage: (msg: string, errorMs?: number, successMs?: number) => void;
  saveToFile: () => Promise<boolean>;
  loadChartNotes: (expectedSongPath?: string) => Promise<void>;
}

export function createEditorSmExchange(deps: EditorSmExchangeDeps) {
  const { s, session, library, t, setSaveMessage, saveToFile, loadChartNotes } = deps;

  async function exportCurrentChartAsSm(): Promise<void> {
    const song = session.currentSong;
    if (!song || s.allCharts.value.length === 0) return;
    if (!isTauri()) {
      setSaveMessage(t("editor.smExchangeDesktopOnly"));
      return;
    }
    const saved = await saveToFile();
    if (!saved) return;

    const chart = s.allCharts.value[s.activeChartIndex.value];
    const baseTitle = sanitizeFileBase(s.metaTitle.value || song.title || "chart");
    const diff = sanitizeFileBase(chart?.difficulty ?? "diff");
    const suggested = `${baseTitle}_${diff}_${chart?.meter ?? 0}.sm`;
    const defaultPath = joinPathDirFile(song.path, suggested);

    const outputPath = await saveFileDialog({
      title: t("editor.exportSmDialogTitle"),
      defaultPath,
      filters: [{ name: "StepMania", extensions: ["sm"] }],
    });
    if (!outputPath) return;

    try {
      s.saving.value = true;
      await api.exportChartAsSm(song.path, s.activeChartIndex.value, outputPath);
      setSaveMessage(t("editor.exportSmSuccess"));
    } catch (e: unknown) {
      setSaveMessage(t("editor.saveError") + ": " + String(e));
    } finally {
      s.saving.value = false;
    }
  }

  async function importSmAsNewChart(): Promise<void> {
    const song = session.currentSong;
    if (!song || s.allCharts.value.length === 0) return;
    if (!isTauri()) {
      setSaveMessage(t("editor.smExchangeDesktopOnly"));
      return;
    }

    const saved = await saveToFile();
    if (!saved) return;

    const smPath = await openFileDialog({
      title: t("editor.importSmDialogTitle"),
      filters: [{ name: "StepMania", extensions: ["sm"] }],
    });
    if (!smPath) return;

    const preservedActiveIdx = s.activeChartIndex.value;

    try {
      s.saving.value = true;
      await api.importSmAsNewChart(song.path, smPath);
      s.allCharts.value = await api.loadChart(song.path);
      const refreshedSongs = await api.getSongList(library.sortMode);
      library.songs = refreshedSongs;
      const row = refreshedSongs.find((ss) => ss.path === song.path);
      if (row) {
        session.charts = row.charts;
      }
      const clamped = Math.min(
        preservedActiveIdx,
        Math.max(0, s.allCharts.value.length - 1),
      );
      s.activeChartIndex.value = clamped;
      session.selectChart(clamped);
      session.needsSongRefresh = true;
      s.syncEditChartPropertiesFromActive();
      await loadChartNotes(song.path);
      s.afterChartNotesLoaded.value?.();
      setSaveMessage(t("editor.importSmSuccess"));
    } catch (e: unknown) {
      setSaveMessage(t("editor.saveError") + ": " + String(e));
    } finally {
      s.saving.value = false;
    }
  }

  return { exportCurrentChartAsSm, importSmAsNewChart };
}
