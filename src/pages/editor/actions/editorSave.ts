import { useSessionStore } from "@/shared/stores/session";
import * as api from "@/shared/api";
import type { SaveChartNote } from "@/shared/api";
import { clearEditorChartBackup } from "@/pages/editor/editorChartBackup";
import type { EditorState } from "../useEditorState";

type SessionStore = ReturnType<typeof useSessionStore>;

export interface EditorSaveDeps {
  s: EditorState;
  session: SessionStore;
  t: (key: string) => string;
  setSaveMessage: (msg: string, errorMs?: number, successMs?: number) => void;
  buildSaveNotesPayload: () => SaveChartNote[];
  refreshEditorChartBaseline: () => void;
  refreshEditorMetaBaseline: () => void;
}

export function createEditorSave(deps: EditorSaveDeps) {
  const { s, session, t, setSaveMessage, buildSaveNotesPayload, refreshEditorChartBaseline, refreshEditorMetaBaseline } =
    deps;

  async function saveToFile(): Promise<boolean> {
    const song = session.currentSong;
    if (!song || s.allCharts.value.length === 0) return false;
    const notes = buildSaveNotesPayload();
    try {
      s.saving.value = true;
      await api.saveChart(song.path, s.activeChartIndex.value, notes);
      await api.saveTimingData(
        song.path,
        {
          bpms: s.bpmChanges.value,
          timeSignatures: s.timeSignatures.value,
          tickcounts: s.tickcounts.value,
          combos: s.comboChanges.value,
          speeds: s.speedChanges.value,
          scrolls: s.scrollChanges.value,
          labels: s.labelChanges.value,
          offset: s.metaOffset.value,
        },
        s.activeChartIndex.value,
      );
      s.allCharts.value = await api.loadChart(song.path);
      session.needsSongRefresh = true;
      refreshEditorChartBaseline();
      refreshEditorMetaBaseline();
      clearEditorChartBackup(song.path, s.activeChartIndex.value);
      s.saveMessage.value = t("editor.saved");
      setSaveMessage(t("editor.saved"));
      return true;
    } catch (e: unknown) {
      setSaveMessage(t("editor.saveError") + ": " + String(e));
      return false;
    } finally {
      s.saving.value = false;
    }
  }

  async function saveMetadata(): Promise<boolean> {
    const song = session.currentSong;
    if (!song) return false;
    s.metaSaving.value = true;
    try {
      await api.updateSongMetadata(song.path, {
        title: s.metaTitle.value || undefined,
        subtitle: s.metaSubtitle.value || undefined,
        artist: s.metaArtist.value || undefined,
        genre: s.metaGenre.value || undefined,
        music: s.metaMusic.value || undefined,
        banner: s.metaBanner.value || undefined,
        background: s.metaBackground.value || undefined,
        offset: s.metaOffset.value,
        sampleStart: s.metaSampleStart.value,
        sampleLength: s.metaSampleLength.value,
      });
      if (s.allCharts.value.length > 0) {
        const idx = Math.min(Math.max(0, s.activeChartIndex.value), s.allCharts.value.length - 1);
        await api.saveTimingData(
          song.path,
          {
            bpms: s.bpmChanges.value,
            offset: s.metaOffset.value,
          },
          idx,
        );
      }
      refreshEditorMetaBaseline();
      s.saveMessage.value = t("editor.metaSaved");
      setSaveMessage(t("editor.metaSaved"));
      return true;
    } catch (e: unknown) {
      setSaveMessage(String(e));
      return false;
    } finally {
      s.metaSaving.value = false;
    }
  }

  return { saveToFile, saveMetadata };
}
