import { useGameStore } from "@/shared/stores/game";
import * as api from "@/shared/api";
import { logOptionalRejection } from "@/shared/lib/devLog";
import type { SaveChartNote } from "@/shared/api";
import type { EditorState } from "../useEditorState";
import { STEPS_TYPE_NUM_TRACKS } from "../constants";

type GameStore = ReturnType<typeof useGameStore>;

export interface EditorChartCrudDeps {
  s: EditorState;
  game: GameStore;
  t: (key: string) => string;
  setSaveMessage: (msg: string, errorMs?: number, successMs?: number) => void;
  loadChartNotes: (expectedSongPath?: string) => Promise<void>;
  clearSelection: () => void;
}

export function createEditorChartCrud(deps: EditorChartCrudDeps) {
  const { s, game, t, setSaveMessage, loadChartNotes, clearSelection } = deps;

  async function switchChart(index: number) {
    if (index < 0 || index >= s.allCharts.value.length) return;
    if (index === s.activeChartIndex.value) return;
    s.activeChartIndex.value = index;
    s.syncEditChartPropertiesFromActive();
    clearSelection();
    s.holdStartRow.value = null;
    await loadChartNotes();
    s.afterChartNotesLoaded.value?.();
  }

  async function createNewChart() {
    const song = game.currentSong;
    if (!song) return;
    try {
      const newIndex = await api.createNewChart(
        song.path,
        s.newChartStepsType.value,
        s.newChartDifficulty.value,
        s.newChartMeter.value,
      );
      s.showNewChartModal.value = false;
      s.allCharts.value = await api.loadChart(song.path);
      s.activeChartIndex.value = newIndex;
      s.syncEditChartPropertiesFromActive();
      await loadChartNotes();
      s.afterChartNotesLoaded.value?.();
      const refreshedSongs = await api.getSongList(game.sortMode);
      game.songs = refreshedSongs;
      game.needsSongRefresh = true;
      const refreshedIdx = refreshedSongs.findIndex((ss) => ss.path === song.path);
      if (refreshedIdx >= 0) {
        await game.selectSong(refreshedIdx);
        game.selectChart(newIndex);
      }
      s.saveMessage.value = t("editor.chartCreated");
      setSaveMessage(t("editor.chartCreated"));
    } catch (e: unknown) {
      setSaveMessage(String(e));
    }
  }

  async function performDeleteCurrentChart() {
    const song = game.currentSong;
    if (!song || s.allCharts.value.length === 0) return;
    try {
      s.playing.value = false;
      await api.audioPause().catch((e) => logOptionalRejection("editor.deleteChart.pause", e));
      await api.deleteChart(song.path, s.activeChartIndex.value);
      s.allCharts.value = await api.loadChart(song.path);
      if (s.allCharts.value.length === 0) {
        s.activeChartIndex.value = 0;
      } else {
        s.activeChartIndex.value = Math.min(s.activeChartIndex.value, s.allCharts.value.length - 1);
      }
      await loadChartNotes();
      s.afterChartNotesLoaded.value?.();
      s.syncEditChartPropertiesFromActive();
      const refreshedSongs = await api.getSongList(game.sortMode);
      game.songs = refreshedSongs;
      game.needsSongRefresh = true;
      const refreshedIdx = refreshedSongs.findIndex((ss) => ss.path === song.path);
      if (refreshedIdx >= 0) {
        await game.selectSong(refreshedIdx);
        game.selectChart(
          s.allCharts.value.length > 0 ? Math.min(s.activeChartIndex.value, s.allCharts.value.length - 1) : 0,
        );
      }
      s.saveMessage.value = t("editor.chartDeleted");
      setSaveMessage(t("editor.chartDeleted"));
    } catch (e: unknown) {
      setSaveMessage(String(e));
    }
  }

  async function applyChartProperties() {
    const song = game.currentSong;
    if (!song || s.allCharts.value.length === 0) return;
    const chart = s.allCharts.value[s.activeChartIndex.value];
    if (!chart) return;

    const prevTracks = chart.numTracks;
    const nextTracks = STEPS_TYPE_NUM_TRACKS[s.editChartStepsType.value] ?? prevTracks;
    if (nextTracks !== prevTracks) {
      if (!window.confirm(t("editor.chartPropertiesConfirmResize"))) {
        return;
      }
    }

    try {
      s.chartPropertiesSaving.value = true;
      await api.updateChartProperties(
        song.path,
        s.activeChartIndex.value,
        s.editChartStepsType.value,
        s.editChartDifficulty.value,
        s.editChartMeter.value,
      );
      s.allCharts.value = await api.loadChart(song.path);
      s.syncEditChartPropertiesFromActive();
      await loadChartNotes();
      s.afterChartNotesLoaded.value?.();
      const refreshedSongs = await api.getSongList(game.sortMode);
      game.songs = refreshedSongs;
      game.needsSongRefresh = true;
      const refreshedIdx = refreshedSongs.findIndex((ss) => ss.path === song.path);
      if (refreshedIdx >= 0) {
        await game.selectSong(refreshedIdx);
        game.selectChart(s.activeChartIndex.value);
      }
      setSaveMessage(t("editor.chartPropertiesSaved"));
    } catch (e: unknown) {
      setSaveMessage(String(e));
    } finally {
      s.chartPropertiesSaving.value = false;
    }
  }

  function buildSaveNotesPayload(): SaveChartNote[] {
    const notes: SaveChartNote[] = [];
    for (const row of s.noteRows.value) {
      for (const note of row.notes) {
        const rl = note.routineLayer;
        const extra = rl === 1 || rl === 2 ? { routineLayer: rl as 1 | 2 } : {};
        notes.push({
          row: row.row,
          track: note.track,
          noteType: note.noteType,
          holdEndRow: note.holdEndRow,
          ...extra,
        });
      }
    }
    return notes;
  }

  async function duplicateCurrentChart() {
    const song = game.currentSong;
    if (!song || s.allCharts.value.length === 0) return;
    const sourceIndex = s.activeChartIndex.value;
    try {
      s.saving.value = true;
      const notes = buildSaveNotesPayload();
      await api.saveChart(song.path, sourceIndex, notes);
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
        sourceIndex,
      );
      const newIndex = await api.duplicateChart(song.path, sourceIndex);
      s.allCharts.value = await api.loadChart(song.path);
      s.activeChartIndex.value = newIndex;
      s.syncEditChartPropertiesFromActive();
      game.selectChart(newIndex);
      await loadChartNotes(song.path);
      s.afterChartNotesLoaded.value?.();
      const refreshedSongs = await api.getSongList(game.sortMode);
      game.songs = refreshedSongs;
      game.needsSongRefresh = true;
      setSaveMessage(t("editor.chartDuplicated"));
    } catch (e: unknown) {
      setSaveMessage(t("editor.saveError") + ": " + String(e));
    } finally {
      s.saving.value = false;
    }
  }

  return {
    switchChart,
    createNewChart,
    performDeleteCurrentChart,
    applyChartProperties,
    buildSaveNotesPayload,
    duplicateCurrentChart,
  };
}
