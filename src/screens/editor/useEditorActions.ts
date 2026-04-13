// --- Editor Actions ---
// All user-facing actions: note editing, selection, clipboard, save, chart CRUD,
// metadata, BPM management, keyboard/mouse handlers.

import { useRouter, type RouteLocationNormalizedLoaded } from "vue-router";
import { useGameStore } from "@/stores/game";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { useI18n } from "@/i18n";
import * as api from "@/utils/api";
import { logOptionalRejection } from "@/utils/devLog";
import type { SaveChartNote } from "@/utils/api";
import type { ChartNoteInput, ChartNoteRow } from "@/engine/types";
import type { ShortcutId } from "@/engine/keyBindings";
import type { EditorState, EditorUndoSnapshot } from "./useEditorState";
import type { EditorCanvas } from "./useEditorCanvas";
import {
  BPM_BEAT_MATCH_EPS,
  COLUMN_WIDTH,
  EDITOR_QUANTIZE_LEVELS,
  EDITOR_ZOOM_MAX,
  EDITOR_ZOOM_MIN,
  EDITOR_ZOOM_STEP_KEY,
  HEADER_HEIGHT,
  MAX_UNDO_STACK,
  NOTE_TYPES,
  STEPS_TYPE_NUM_TRACKS,
} from "./constants";

type SelectionRect = { minRow: number; maxRow: number; minTrack: number; maxTrack: number };

function isPumpPadLayout(stepsType: string | undefined, numTracks: number): boolean {
  return !!stepsType?.startsWith("pump-") && (numTracks === 5 || numTracks === 10);
}

/** Pump L/R mirror: ↙↔↘, ↖↔↗, center fixed (per 5-lane panel). */
function mirrorPumpTrackH(track: number, numTracks: number): number {
  const map5 = [4, 3, 2, 1, 0];
  if (numTracks === 5) return map5[track] ?? track;
  if (numTracks === 10) {
    if (track < 5) return map5[track] ?? track;
    return 5 + (map5[track - 5] ?? track - 5);
  }
  return track;
}

/** Pump U/D mirror: ↙↔↖, ↘↔↗, center fixed (per 5-lane panel). */
function mirrorPumpTrackV(track: number, numTracks: number): number {
  const map5 = [1, 0, 2, 4, 3];
  if (numTracks === 5) return map5[track] ?? track;
  if (numTracks === 10) {
    if (track < 5) return map5[track] ?? track;
    return 5 + (map5[track - 5] ?? track - 5);
  }
  return track;
}
import { defaultQuantizeFromTimeSignatures } from "./quantizeFromTimeSignature";
import {
  clearEditorChartBackup,
  serializeEditorChartPersist,
  serializeEditorMetaPersist,
} from "@/utils/editorChartBackup";

export function useEditorActions(
  s: EditorState,
  canvas: EditorCanvas,
  route: Pick<RouteLocationNormalizedLoaded, "query">,
) {
  const router = useRouter();
  const game = useGameStore();
  const player = usePlayerStore();
  const session = useSessionStore();
  const { t } = useI18n();
  let suppressNextClick = false;

  /**
   * Viewport → canvas CSS pixel space (same as drawEditor / getCanvasFieldX).
   * EditorScreen wraps the view in `transform: scale(uiScale)`; getBoundingClientRect is then
   * scaled on screen while clientWidth/height stay layout-sized — without this ratio, hits drift.
   */
  function pointerToCanvasCss(clientX: number, clientY: number): { x: number; y: number } {
    const el = s.canvasRef.value;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const rw = rect.width;
    const rh = rect.height;
    if (rw <= 0 || rh <= 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rw) * el.clientWidth,
      y: ((clientY - rect.top) / rh) * el.clientHeight,
    };
  }

  function routineLayerForNewNote(): { routineLayer: 1 | 2 } | Record<string, never> {
    if (s.activeChart.value?.stepsType !== "pump-routine") return {};
    return { routineLayer: s.editorRoutineLayer.value };
  }

  /** Clear note/timing editing state when the song has zero charts (file may still exist). */
  function resetEditorWhenNoCharts() {
    s.playing.value = false;
    api.audioPause().catch((e) => logOptionalRejection("editor.resetNoCharts.pause", e));
    s.noteRows.value = [];
    s.undoStack.value = [];
    s.redoStack.value = [];
    s.selectionStart.value = null;
    s.selectionEnd.value = null;
    s.selectionTrackStart.value = null;
    s.selectionTrackEnd.value = null;
    s.additionalSelections.value = [];
    s.clipboard.value = [];
    s.clipboardBpmChanges.value = [];
    s.holdStartRow.value = null;
    s.holdDragCurrentRow.value = null;
    s.isHoldDragging.value = false;
    s.isDragging.value = false;
    s.editingBpmChangeIndex.value = -1;
    s.NUM_TRACKS_ACTUAL.value = 5;

    const song = game.currentSong;
    const rawBpm = song?.displayBpm ?? "120";
    const parsed = parseFloat(String(rawBpm).split("-")[0] || "120");
    s.bpm.value = Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
    s.bpmChanges.value = [{ beat: 0, bpm: s.bpm.value }];
    s.timeSignatures.value = [{ beat: 0, numerator: 4, denominator: 4 }];
    s.tickcounts.value = [{ beat: 0, ticksPerBeat: 4 }];
    s.comboChanges.value = [{ beat: 0, combo: 1, missCombo: 1 }];
    s.speedChanges.value = [{ beat: 0, ratio: 1.0, delay: 0, unit: 0 }];
    s.scrollChanges.value = [{ beat: 0, ratio: 1.0 }];
    s.labelChanges.value = [{ beat: 0, label: "Song Start" }];
    s.quantize.value = defaultQuantizeFromTimeSignatures(s.timeSignatures.value);
    s.scrollBeat.value = 0;
    s.editorRoutineLayer.value = 1;
    refreshEditorChartBaseline();
    refreshEditorMetaBaseline();
  }

  // Single timer handle for save messages — cancels any previous pending clear
  // on each new message, preventing duplicate ghost callbacks after unmount.
  let _saveMessageTimer: ReturnType<typeof setTimeout> | null = null;
  function refreshEditorChartBaseline() {
    s.editorChartBaselineSerialized.value = serializeEditorChartPersist(s);
  }

  function refreshEditorMetaBaseline() {
    s.editorMetaBaselineSerialized.value = serializeEditorMetaPersist(s);
  }

  function setSaveMessage(msg: string, errorMs = 5000, successMs = 3000) {
    s.saveMessage.value = msg;
    if (_saveMessageTimer !== null) clearTimeout(_saveMessageTimer);
    const delay = msg.startsWith(String(t("editor.saved"))) || msg === String(t("editor.metaSaved"))
      || msg === String(t("editor.chartCreated")) || msg === String(t("editor.chartDeleted"))
      || msg === String(t("editor.chartPropertiesSaved"))
      ? successMs : errorMs;
    _saveMessageTimer = setTimeout(() => {
      _saveMessageTimer = null;
      s.saveMessage.value = "";
    }, delay);
  }

  // ====== Chart loading ======
  async function loadAllCharts(expectedSongPath?: string) {
    const song = game.currentSong;
    if (!song) return;
    
    // Verify we're loading the correct song
    if (expectedSongPath && song.path !== expectedSongPath) {
      console.warn("[Editor] Song changed during load, ignoring stale load");
      return;
    }
    
    const currentSongPath = song.path;
    
    try {
      const primed = session.editorPrimedCharts;
      if (primed && primed.path === currentSongPath) {
        s.allCharts.value = primed.charts;
        session.editorPrimedCharts = null;
      } else {
        s.allCharts.value = await api.loadChart(currentSongPath);
      }
      
      // Double-check song hasn't changed mid-load
      if (game.currentSong?.path !== currentSongPath) {
        console.warn("[Editor] Song changed during chart load, ignoring");
        return;
      }
      
      if (s.allCharts.value.length === 0) {
        s.activeChartIndex.value = 0;
        resetEditorWhenNoCharts();
        s.showNewChartModal.value = route.query.newChart === "1";
      } else {
        s.activeChartIndex.value = Math.min(game.currentChartIndex, s.allCharts.value.length - 1);
        s.syncEditChartPropertiesFromActive();
        await loadChartNotes(currentSongPath);
        s.showNewChartModal.value = route.query.newChart === "1";
      }
      
      // Final verification
      if (game.currentSong?.path !== currentSongPath) {
        console.warn("[Editor] Song changed after chart load, ignoring");
        return;
      }
      // Waveform is loaded as a background task after the editor is shown
      // (heavy sync work: atob + byte-copy loop blocks the main thread).
    } catch {
      s.allCharts.value = [];
      resetEditorWhenNoCharts();
    }

    if (game.currentSong?.path !== currentSongPath) return;
    await loadMetadata(currentSongPath);
    s.afterChartNotesLoaded.value?.();
  }

  async function loadChartNotes(expectedSongPath?: string) {
    const song = game.currentSong;
    if (!song) return;
    
    if (expectedSongPath && song.path !== expectedSongPath) return;
    const currentSongPath = song.path;

    if (s.allCharts.value.length === 0) {
      resetEditorWhenNoCharts();
      return;
    }
    
    const chart = s.allCharts.value[s.activeChartIndex.value];
    if (chart) {
      s.NUM_TRACKS_ACTUAL.value = chart.numTracks || 5;
    }
    
    try {
      if (game.currentSong?.path !== currentSongPath) return;
      
      // Load notes
      s.noteRows.value = await api.getChartNotes(currentSongPath, s.activeChartIndex.value);
      
      // Load BPM changes from chart or song timing
      try {
        const timingData = await api.getTimingData(currentSongPath, s.activeChartIndex.value);
        if (timingData.bpms.length > 0) {
          s.bpmChanges.value = timingData.bpms.sort((a, b) => a.beat - b.beat);
          s.bpm.value = s.bpmChanges.value[0].bpm;
        } else {
          // Fallback to display BPM from song
          const rawBpm = song.displayBpm || "120";
          const parsed = parseFloat(rawBpm.split("-")[0]);
          s.bpm.value = isNaN(parsed) ? 120 : parsed;
          s.bpmChanges.value = [{ beat: 0, bpm: s.bpm.value }];
        }
        
        // Load all timing segments
        s.timeSignatures.value = timingData.timeSignatures.length > 0
          ? timingData.timeSignatures.sort((a, b) => a.beat - b.beat)
          : [{ beat: 0, numerator: 4, denominator: 4 }];
        s.tickcounts.value = timingData.tickcounts.length > 0
          ? timingData.tickcounts.sort((a, b) => a.beat - b.beat)
          : [{ beat: 0, ticksPerBeat: 4 }];
        s.comboChanges.value = timingData.combos.length > 0
          ? timingData.combos.sort((a, b) => a.beat - b.beat)
          : [{ beat: 0, combo: 1, missCombo: 1 }];
        s.speedChanges.value = timingData.speeds.length > 0
          ? timingData.speeds.sort((a, b) => a.beat - b.beat)
          : [{ beat: 0, ratio: 1.0, delay: 0, unit: 0 }];
        s.scrollChanges.value = timingData.scrolls.length > 0
          ? timingData.scrolls.sort((a, b) => a.beat - b.beat)
          : [{ beat: 0, ratio: 1.0 }];
        s.labelChanges.value = timingData.labels.length > 0
          ? timingData.labels.sort((a, b) => a.beat - b.beat)
          : [{ beat: 0, label: "Song Start" }];
      } catch (e: unknown) {
        console.warn("[Editor] Failed to load timing data:", e);
        // Fallback to display BPM
        const rawBpm = song.displayBpm || "120";
        const parsed = parseFloat(rawBpm.split("-")[0]);
        s.bpm.value = isNaN(parsed) ? 120 : parsed;
        s.bpmChanges.value = [{ beat: 0, bpm: s.bpm.value }];
        // Reset other segments to defaults
        s.timeSignatures.value = [{ beat: 0, numerator: 4, denominator: 4 }];
        s.tickcounts.value = [{ beat: 0, ticksPerBeat: 4 }];
        s.comboChanges.value = [{ beat: 0, combo: 1, missCombo: 1 }];
        s.speedChanges.value = [{ beat: 0, ratio: 1.0, delay: 0, unit: 0 }];
        s.scrollChanges.value = [{ beat: 0, ratio: 1.0 }];
        s.labelChanges.value = [{ beat: 0, label: "Song Start" }];
      }

      s.quantize.value = defaultQuantizeFromTimeSignatures(s.timeSignatures.value);

      if (game.currentSong?.path !== currentSongPath) return;
      s.editorRoutineLayer.value = 1;
      s.undoStack.value = [];
      s.redoStack.value = [];
      pushUndo();
      s.scrollBeat.value = 0;
      refreshEditorChartBaseline();
    } catch {
      s.editorRoutineLayer.value = 1;
      s.noteRows.value = [];
      refreshEditorChartBaseline();
    }
  }

  async function loadMetadata(expectedSongPath?: string) {
    const song = game.currentSong;
    if (!song) return;
    
    if (expectedSongPath && song.path !== expectedSongPath) return;
    const currentSongPath = song.path;
    
    try {
      if (game.currentSong?.path !== currentSongPath) return;
      const meta = await api.getSongMetadata(currentSongPath);
      if (game.currentSong?.path !== currentSongPath) return;
      s.metaTitle.value = meta.title;
      s.metaSubtitle.value = meta.subtitle;
      s.metaArtist.value = meta.artist;
      s.metaGenre.value = meta.genre;
      s.metaMusic.value = meta.music;
      s.metaBanner.value = meta.banner;
      s.metaBackground.value = meta.background;
      s.metaOffset.value = meta.offset;
      s.metaSampleStart.value = meta.sampleStart;
      s.metaSampleLength.value = meta.sampleLength;
      refreshEditorMetaBaseline();
    } catch {
      if (game.currentSong?.path !== currentSongPath) return;
      s.metaTitle.value = song.title || "";
      s.metaArtist.value = song.artist || "";
      refreshEditorMetaBaseline();
    }
  }

  async function loadWaveformData(expectedSongPath?: string) {
    const song = game.currentSong;
    if (!song) return;
    
    if (expectedSongPath && song.path !== expectedSongPath) return;
    const currentSongPath = song.path;
    
    s.waveformPeaks.value = [];
    s.waveformDuration.value = 0;
    try {
      const musicPath = await api.getSongMusicPath(currentSongPath);
      if (game.currentSong?.path !== currentSongPath) return;
      
      const dataUrl = await api.readFileBase64(musicPath);
      if (game.currentSong?.path !== currentSongPath) return;
      
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const audioCtx = new AudioContext();
      try {
        const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0));
        if (game.currentSong?.path !== currentSongPath) return;
        
        const numChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const mono = new Float32Array(length);
        for (let ch = 0; ch < numChannels; ch++) {
          const chData = audioBuffer.getChannelData(ch);
          for (let j = 0; j < length; j++) mono[j] += chData[j];
        }
        if (numChannels > 1) {
          for (let j = 0; j < length; j++) mono[j] /= numChannels;
        }
        const samples = 4096;
        const blockSize = Math.max(1, Math.floor(length / samples));
        const peaks = new Array(samples).fill(0);
        for (let i = 0; i < samples; i++) {
          const start = i * blockSize;
          const end = Math.min(length, start + blockSize);
          let peak = 0;
          for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(mono[j] || 0));
          peaks[i] = peak;
        }
        s.waveformPeaks.value = peaks;
        s.waveformDuration.value = audioBuffer.duration;
      } finally {
        await audioCtx.close();
      }
    } catch (err: unknown) {
      console.warn("[Editor] Failed to load waveform:", err);
      s.waveformPeaks.value = [];
      s.waveformDuration.value = 0;
    }
  }

  // ====== Chart switching / CRUD ======
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
      setSaveMessage(String(t("editor.chartCreated")));
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
          s.allCharts.value.length > 0
            ? Math.min(s.activeChartIndex.value, s.allCharts.value.length - 1)
            : 0,
        );
      }
      s.saveMessage.value = t("editor.chartDeleted");
      setSaveMessage(String(t("editor.chartDeleted")));
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
      if (!window.confirm(String(t("editor.chartPropertiesConfirmResize")))) {
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
      setSaveMessage(String(t("editor.chartPropertiesSaved")));
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
        const extra =
          rl === 1 || rl === 2 ? { routineLayer: rl as 1 | 2 } : {};
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

  /** Save current editor state, clone this chart to a new slot, then switch to the copy. */
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
      setSaveMessage(String(t("editor.chartDuplicated")));
    } catch (e: unknown) {
      setSaveMessage(t("editor.saveError") + ": " + String(e));
    } finally {
      s.saving.value = false;
    }
  }

  // ====== BPM helpers ======
  function getBpmAtBeat(beat: number): number {
    let currentBpm = s.bpm.value;
    for (const change of s.bpmChanges.value) {
      if (change.beat <= beat) currentBpm = change.bpm;
      else break;
    }
    return currentBpm;
  }

  function addBpmChangeFromInput() {
    const beat = s.newBpmBeat.value;
    const bpmVal = s.newBpmValue.value;
    if (beat < 0 || bpmVal <= 0) return;
    const existing = s.bpmChanges.value.findIndex((c) => Math.abs(c.beat - beat) < BPM_BEAT_MATCH_EPS);
    if (existing >= 0) {
      s.bpmChanges.value[existing].bpm = bpmVal;
    } else {
      s.bpmChanges.value.push({ beat, bpm: bpmVal });
      s.bpmChanges.value.sort((a, b) => a.beat - b.beat);
    }
    if (Math.abs(beat) < BPM_BEAT_MATCH_EPS) s.bpm.value = bpmVal;
    pushUndo();
  }

  function updateBpmChange(index: number, newBpmVal: number) {
    if (newBpmVal <= 0 || isNaN(newBpmVal)) return;
    if (index >= 0 && index < s.bpmChanges.value.length) {
      const prevVal = s.bpmChanges.value[index].bpm;
      if (Math.abs(prevVal - newBpmVal) < 1e-4) return;
      s.bpmChanges.value[index].bpm = newBpmVal;
      if (index === 0) s.bpm.value = newBpmVal;
      pushUndo();
    }
  }

  function deleteBpmChange(index: number) {
    if (s.bpmChanges.value.length <= 1) return;
    if (index < 0 || index >= s.bpmChanges.value.length) return;
    const entry = s.bpmChanges.value[index];
    if (Math.abs(entry.beat) < BPM_BEAT_MATCH_EPS) return;
    const editing = s.editingBpmChangeIndex.value;
    if (editing === index) {
      s.editingBpmChangeIndex.value = -1;
    } else if (editing > index) {
      s.editingBpmChangeIndex.value = editing - 1;
    }
    s.bpmChanges.value.splice(index, 1);
    s.bpm.value = s.bpmChanges.value[0]?.bpm ?? s.bpm.value;
    pushUndo();
  }

  /** Open the inline BPM editor on the canvas for a given BPM change index */
  function startEditingBpmChange(index: number) {
    if (index < 0 || index >= s.bpmChanges.value.length) return;
    s.editingBpmChangeIndex.value = index;
    s.editingBpmInputValue.value = String(s.bpmChanges.value[index].bpm);
  }

  /** Commit the inline BPM edit and close the editor */
  function commitBpmEdit() {
    const idx = s.editingBpmChangeIndex.value;
    if (idx < 0 || idx >= s.bpmChanges.value.length) {
      s.editingBpmChangeIndex.value = -1;
      return;
    }
    const newVal = parseFloat(s.editingBpmInputValue.value);
    if (!isNaN(newVal) && newVal > 0) {
      updateBpmChange(idx, newVal);
    }
    s.editingBpmChangeIndex.value = -1;
  }

  /** Cancel the inline BPM edit */
  function cancelBpmEdit() {
    s.editingBpmChangeIndex.value = -1;
  }

  /** Add a new BPM change at the specified beat, using current BPM at that beat, then open inline editor */
  function addBpmChangeAtBeat(beat: number) {
    const currentBpm = getBpmAtBeat(beat);
    const existing = s.bpmChanges.value.findIndex((c) => Math.abs(c.beat - beat) < BPM_BEAT_MATCH_EPS);
    if (existing >= 0) {
      // Already exists — just open editor for it
      startEditingBpmChange(existing);
      return;
    }
    s.bpmChanges.value.push({ beat, bpm: currentBpm });
    s.bpmChanges.value.sort((a, b) => a.beat - b.beat);
    pushUndo();
    // Find the new index after sorting and open the inline editor
    const newIdx = s.bpmChanges.value.findIndex((c) => Math.abs(c.beat - beat) < BPM_BEAT_MATCH_EPS);
    if (newIdx >= 0) {
      startEditingBpmChange(newIdx);
    }
  }

  // ====== Scrollbar ======
  function handleScrollbarMouseDown(e: MouseEvent) {
    if (s.allCharts.value.length === 0) return;
    const scrollbar = e.currentTarget as HTMLElement;
    const rect = scrollbar.getBoundingClientRect();
    const setPos = (clientY: number) => {
      const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      s.scrollBeat.value = Math.max(0, ratio * s.totalBeats.value);
    };
    setPos(e.clientY);
    const onMove = (ev: MouseEvent) => { ev.preventDefault(); setPos(ev.clientY); };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ====== Undo / Redo ======
  /** Append current chart state after a mutation; clears redo. Stack entries are successive snapshots (last = current). */
  function pushUndo() {
    const snap: EditorUndoSnapshot = {
      notes: JSON.parse(JSON.stringify(s.noteRows.value)),
      bpms: JSON.parse(JSON.stringify(s.bpmChanges.value)),
    };
    s.undoStack.value.push(snap);
    if (s.undoStack.value.length > MAX_UNDO_STACK) s.undoStack.value.shift();
    s.redoStack.value = [];
  }

  function applyUndoSnapshot(snap: EditorUndoSnapshot) {
    s.noteRows.value = JSON.parse(JSON.stringify(snap.notes));
    s.bpmChanges.value = JSON.parse(JSON.stringify(snap.bpms));
    s.bpm.value = s.bpmChanges.value[0]?.bpm ?? s.bpm.value;
    s.editingBpmChangeIndex.value = -1;
  }

  function undo() {
    if (s.undoStack.value.length <= 1) return;
    const current = s.undoStack.value.pop();
    if (current) s.redoStack.value.push(JSON.parse(JSON.stringify(current)) as EditorUndoSnapshot);
    const prev = s.undoStack.value[s.undoStack.value.length - 1];
    applyUndoSnapshot(prev);
  }

  function redo() {
    const next = s.redoStack.value.pop();
    if (!next) return;
    applyUndoSnapshot(next);
    s.undoStack.value.push(JSON.parse(JSON.stringify(next)) as EditorUndoSnapshot);
  }

  /** Replace undo history after loading external state (e.g. crash backup). */
  function reseedUndoStackAfterHydrate() {
    s.undoStack.value = [];
    s.redoStack.value = [];
    pushUndo();
  }

  function cycleQuantize(delta: number) {
    const levels = EDITOR_QUANTIZE_LEVELS;
    const q = s.quantize.value;
    let idx = levels.indexOf(q as (typeof levels)[number]);
    if (idx < 0) {
      const fallback = levels.findIndex((v) => v >= q);
      idx = fallback >= 0 ? fallback : levels.length - 1;
    }
    const nidx = Math.max(0, Math.min(levels.length - 1, idx + delta));
    s.quantize.value = levels[nidx];
  }

  // ====== Note helpers ======
  function isEditableTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
  }

  function createLongNote(track: number, startRow: number, endRow: number, noteType: string) {
    if (startRow === endRow) return;
    const headRow = Math.min(startRow, endRow);
    const tailRow = Math.max(startRow, endRow);
    const headBeat = headRow / 48;
    const headSecond = (headBeat / s.bpm.value) * 60;

    const existing = s.noteRows.value.find((r) => r.row === headRow);
    const noteInfo = { track, noteType, holdEndRow: tailRow, ...routineLayerForNewNote() };

    if (existing) {
      existing.notes = existing.notes.filter((n) => n.track !== track);
      existing.notes.push(noteInfo);
    } else {
      s.noteRows.value.push({ row: headRow, beat: headBeat, second: headSecond, notes: [noteInfo] });
      s.noteRows.value.sort((a, b) => a.row - b.row);
    }
    pushUndo();
  }

  function clampWaveformPanelOffset(offset: number): number {
    const bounds = canvas.getWaveformPanelOffsetBounds();
    return Math.max(bounds.min, Math.min(bounds.max, offset));
  }

  // ====== Mouse handlers ======
  function handleCanvasClick(e: MouseEvent) {
    if (!s.canvasRef.value || s.playing.value) return;
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    // Block clicks that originated from waveform panel drag
    if (s.isWaveformPanelDragging.value) {
      s.isWaveformPanelDragging.value = false;
      s.waveformPanelDragState.value = 'idle';
      return;
    }
    if (e.shiftKey) return;
    const { x, y } = pointerToCanvasCss(e.clientX, e.clientY);

    // BPM delete (canvas, beside edit) — before edit so distinct rects never conflict
    const bpmDelIdx = canvas.getBpmDeleteButtonAt(x, y);
    if (bpmDelIdx >= 0) {
      deleteBpmChange(bpmDelIdx);
      return;
    }

    // Check if click hit a BPM edit button
    const bpmIdx = canvas.getBpmEditButtonAt(x, y);
    if (bpmIdx >= 0) {
      startEditingBpmChange(bpmIdx);
      return;
    }

    // Check if click hit a "+" add-BPM button on a quantize grid line
    const addBeat = canvas.getBpmAddButtonAt(x, y);
    if (addBeat >= 0) {
      addBpmChangeAtBeat(addBeat);
      return;
    }

    // Close BPM inline editor if clicking elsewhere
    if (s.editingBpmChangeIndex.value >= 0) {
      commitBpmEdit();
    }

    const fieldX = canvas.getCanvasFieldX();
    const col = Math.floor((x - fieldX) / COLUMN_WIDTH);
    if (col < 0 || col >= s.NUM_TRACKS.value) return;

    // Block notes above the judgment line (y < HEADER_HEIGHT)
    if (y < HEADER_HEIGHT) return;

    const beat = canvas.snapBeat(canvas.yToBeat(y));
    if (beat < 0) return;
    const row = canvas.beatToRow(beat);

    const existingIdx = s.noteRows.value.findIndex((r) => r.row === row && r.notes.some((n) => n.track === col));

    if (existingIdx >= 0) {
      const r = s.noteRows.value[existingIdx];
      r.notes = r.notes.filter((n) => n.track !== col);
      if (r.notes.length === 0) s.noteRows.value.splice(existingIdx, 1);
    } else {
      const second = canvas.beatToTime(beat);
      const noteInfo = {
        track: col,
        noteType: s.currentNoteType.value,
        holdEndRow: null,
        ...routineLayerForNewNote(),
      };
      const existing = s.noteRows.value.find((r) => r.row === row);
      if (existing) {
        existing.notes.push(noteInfo);
      } else {
        s.noteRows.value.push({ row, beat, second, notes: [noteInfo] });
        s.noteRows.value.sort((a, b) => a.row - b.row);
      }
    }
    pushUndo();
  }

  function handleMouseDown(e: MouseEvent) {
    if (!s.canvasRef.value || s.playing.value || s.allCharts.value.length === 0) return;

    // Check if waveform panel drag is active (started in this session)
    if (s.isWaveformPanelDragging.value) {
      // Already dragging waveform panel - ignore this mousedown
      return;
    }

    // If waveform panel drag was canceled (mouse left panel), reset and ignore
    if (s.waveformPanelDragState.value === 'canceled') {
      s.waveformPanelDragState.value = 'idle';
      s.isWaveformPanelDragging.value = false;
      return;
    }

    const { x, y } = pointerToCanvasCss(e.clientX, e.clientY);
    const fieldX = canvas.getCanvasFieldX();
    const fieldW = s.FIELD_WIDTH.value;

    // Check if clicking on waveform panel area (start dragging)
    if (e.button === 0 && !e.shiftKey) {
      const h = s.canvasRef.value.clientHeight;
      if (canvas.isInWaveformPanel(x, y, fieldX, h)) {
        // Mark as waveform panel interaction immediately
        s.waveformPanelDragState.value = 'dragging';
        s.waveformPanelDragStartX.value = x;
        s.waveformPanelDragStartOffset.value = clampWaveformPanelOffset(s.waveformPanelOffsetX.value);
        s.waveformPanelOffsetX.value = s.waveformPanelDragStartOffset.value;
        s.isWaveformPanelDragging.value = true;
        return;
      }
    }

    if (e.button === 0 && !e.shiftKey) {
      // Check if click is in track field area
      if (x < fieldX || x >= fieldX + fieldW) return;
      const col = Math.floor((x - fieldX) / COLUMN_WIDTH);
      if (col < 0 || col >= s.NUM_TRACKS.value) return;
      const beat = canvas.snapBeat(canvas.yToBeat(y));
      // Block notes above the judgment line (y < HEADER_HEIGHT)
      if (y < HEADER_HEIGHT) return;
      const row = canvas.beatToRow(beat);
      s.holdStartRow.value = { row, track: col };
      s.holdDragCurrentRow.value = row;
      s.isHoldDragging.value = true;
      return;
    }

    if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      if (e.button === 2 && e.ctrlKey) {
        const prev = getSelectionRange();
        if (prev) {
          s.additionalSelections.value = [...s.additionalSelections.value, prev];
        }
      } else if (e.button === 2) {
        s.additionalSelections.value = [];
      }
      if (e.button === 0 && e.shiftKey) {
        s.additionalSelections.value = [];
      }
      s.isDragging.value = true;
      const beat = canvas.snapBeat(canvas.yToBeat(y));
      const row = canvas.beatToRow(beat);
      const col = Math.floor((x - fieldX) / COLUMN_WIDTH);
      s.selectionStart.value = row;
      s.selectionEnd.value = row;
      s.selectionTrackStart.value = Math.max(0, Math.min(col, s.NUM_TRACKS.value - 1));
      s.selectionTrackEnd.value = s.selectionTrackStart.value;
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!s.canvasRef.value || s.allCharts.value.length === 0) return;

    // Handle waveform panel dragging - always update position during drag, only cancel on mouseup
    if (s.waveformPanelDragState.value === 'dragging') {
      const { x } = pointerToCanvasCss(e.clientX, e.clientY);
      const deltaX = x - s.waveformPanelDragStartX.value;
      s.waveformPanelOffsetX.value = clampWaveformPanelOffset(s.waveformPanelDragStartOffset.value + deltaX);
      return;
    }

    if (s.isHoldDragging.value && s.holdStartRow.value) {
      const { y } = pointerToCanvasCss(e.clientX, e.clientY);
      // Clamp hold drag to below judgment line
      const clampedY = Math.max(y, HEADER_HEIGHT);
      const beat = canvas.snapBeat(canvas.yToBeat(clampedY));
      s.holdDragCurrentRow.value = canvas.beatToRow(beat);
      return;
    }
    if (!s.isDragging.value) return;
    const { x, y } = pointerToCanvasCss(e.clientX, e.clientY);
    const beat = canvas.snapBeat(canvas.yToBeat(y));
    const row = canvas.beatToRow(beat);
    const fieldX = canvas.getCanvasFieldX();
    const col = Math.floor((x - fieldX) / COLUMN_WIDTH);
    s.selectionEnd.value = row;
    s.selectionTrackEnd.value = Math.max(0, Math.min(col, s.NUM_TRACKS.value - 1));
  }

  function handleMouseUp(e: MouseEvent) {
    // Check if this mouseup is potentially from a waveform panel drag that ended in track area
    if (s.waveformPanelDragState.value === 'dragging' || s.isWaveformPanelDragging.value) {
      // Get final mouse position in canvas CSS coordinates
      const { x, y } = pointerToCanvasCss(e.clientX, e.clientY);
      const h = s.canvasRef.value?.clientHeight ?? 0;
      const fieldX = canvas.getCanvasFieldX();
      
      if (!canvas.isInWaveformPanel(x, y, fieldX, h)) {
        // Ended outside waveform panel - suppress
        s.waveformPanelDragState.value = 'idle';
        s.isWaveformPanelDragging.value = false;
        return;
      }
      
      // Ended in waveform panel - normal cleanup
      s.waveformPanelDragState.value = 'idle';
      s.isWaveformPanelDragging.value = false;
      return;
    }
    // If waveform panel drag was canceled, just reset
    if (s.waveformPanelDragState.value === 'canceled') {
      s.waveformPanelDragState.value = 'idle';
      s.isWaveformPanelDragging.value = false;
      return;
    }

    let createdLongNote = false;
    if (s.isHoldDragging.value && s.holdStartRow.value && s.holdDragCurrentRow.value !== null) {
      if (s.holdStartRow.value.row !== s.holdDragCurrentRow.value) {
        createLongNote(
          s.holdStartRow.value.track,
          s.holdStartRow.value.row,
          s.holdDragCurrentRow.value,
          s.currentNoteType.value === "Roll" ? "Roll" : "HoldHead",
        );
        createdLongNote = true;
      }
    }
    if (createdLongNote) suppressNextClick = true;
    s.isHoldDragging.value = false;
    s.holdStartRow.value = null;
    s.holdDragCurrentRow.value = null;
    s.isDragging.value = false;
  }

  function handleRightClick(e: MouseEvent) {
    e.preventDefault();
  }

  // ====== Selection ======
  function getSelectionRange(): SelectionRect | null {
    if (s.selectionStart.value === null || s.selectionEnd.value === null) return null;
    const minRow = Math.min(s.selectionStart.value, s.selectionEnd.value);
    const maxRow = Math.max(s.selectionStart.value, s.selectionEnd.value);
    let minTrack = 0;
    let maxTrack = s.NUM_TRACKS.value - 1;
    if (s.selectionTrackStart.value !== null && s.selectionTrackEnd.value !== null) {
      minTrack = Math.min(s.selectionTrackStart.value, s.selectionTrackEnd.value);
      maxTrack = Math.max(s.selectionTrackStart.value, s.selectionTrackEnd.value);
    }
    return { minRow, maxRow, minTrack, maxTrack };
  }

  function getAllSelectionRects(): SelectionRect[] {
    const rects: SelectionRect[] = [...s.additionalSelections.value];
    const p = getSelectionRange();
    if (p) rects.push(p);
    return rects;
  }

  function mergeSelectionRects(rects: SelectionRect[]): SelectionRect | null {
    if (rects.length === 0) return null;
    return {
      minRow: Math.min(...rects.map((r) => r.minRow)),
      maxRow: Math.max(...rects.map((r) => r.maxRow)),
      minTrack: Math.min(...rects.map((r) => r.minTrack)),
      maxTrack: Math.max(...rects.map((r) => r.maxTrack)),
    };
  }

  function noteInAnyRect(row: number, track: number, rects: SelectionRect[]): boolean {
    return rects.some(
      (range) =>
        row >= range.minRow &&
        row <= range.maxRow &&
        track >= range.minTrack &&
        track <= range.maxTrack,
    );
  }

  /** BPM marker row lies in the vertical span of any selection rect (tracks ignored). */
  function bpmChangeInSelectionRowBand(changeBeat: number, rects: SelectionRect[]): boolean {
    const row = Math.round(changeBeat * 48);
    return rects.some((r) => row >= r.minRow && row <= r.maxRow);
  }

  function collectBpmsInSelectionRects(rects: SelectionRect[]) {
    return s.bpmChanges.value
      .filter((c) => bpmChangeInSelectionRowBand(c.beat, rects))
      .map((c) => ({ beat: c.beat, bpm: c.bpm }));
  }

  /** Insert or replace a BPM change at the given beat (same epsilon as sidebar add). */
  function mergeBpmAtBeat(beat: number, bpmVal: number) {
    if (bpmVal <= 0 || isNaN(bpmVal)) return;
    const existing = s.bpmChanges.value.findIndex((c) => Math.abs(c.beat - beat) < BPM_BEAT_MATCH_EPS);
    if (existing >= 0) {
      s.bpmChanges.value[existing].bpm = bpmVal;
    } else {
      s.bpmChanges.value.push({ beat, bpm: bpmVal });
      s.bpmChanges.value.sort((a, b) => a.beat - b.beat);
    }
    s.bpm.value = s.bpmChanges.value[0]?.bpm ?? s.bpm.value;
  }

  function selectAll() {
    if (s.noteRows.value.length === 0) return;
    s.additionalSelections.value = [];
    s.selectionStart.value = s.noteRows.value[0].row;
    s.selectionEnd.value = s.noteRows.value[s.noteRows.value.length - 1].row;
    s.selectionTrackStart.value = 0;
    s.selectionTrackEnd.value = s.NUM_TRACKS.value - 1;
  }

  function clearSelection() {
    s.selectionStart.value = null;
    s.selectionEnd.value = null;
    s.selectionTrackStart.value = null;
    s.selectionTrackEnd.value = null;
    s.additionalSelections.value = [];
  }

  function deleteSelection() {
    const rects = getAllSelectionRects();
    if (rects.length === 0) return;

    let wouldDeleteNote = false;
    for (const r of s.noteRows.value) {
      if (r.notes.some((n) => noteInAnyRect(r.row, n.track, rects))) {
        wouldDeleteNote = true;
        break;
      }
    }
    const wouldDeleteBpm = s.bpmChanges.value.some(
      (c, idx) => idx > 0 && bpmChangeInSelectionRowBand(c.beat, rects),
    );
    if (!wouldDeleteNote && !wouldDeleteBpm) return;

    const nextRows: typeof s.noteRows.value = [];
    for (const r of s.noteRows.value) {
      const kept = r.notes.filter((n) => !noteInAnyRect(r.row, n.track, rects));
      if (kept.length > 0) {
        nextRows.push({ ...r, notes: kept });
      }
    }
    s.noteRows.value = nextRows;

    s.bpmChanges.value = s.bpmChanges.value.filter(
      (c, idx) => !bpmChangeInSelectionRowBand(c.beat, rects) || idx === 0,
    );
    s.bpm.value = s.bpmChanges.value[0]?.bpm ?? s.bpm.value;

    pushUndo();
    clearSelection();
  }

  function copySelection() {
    const rects = getAllSelectionRects();
    if (rects.length === 0) return;
    const selected = s.noteRows.value
      .map((r) => ({
        ...r,
        notes: r.notes.filter((n) => noteInAnyRect(r.row, n.track, rects)),
      }))
      .filter((r) => r.notes.length > 0);
    s.clipboard.value = JSON.parse(JSON.stringify(selected));
    s.clipboardBpmChanges.value = JSON.parse(JSON.stringify(collectBpmsInSelectionRects(rects)));
  }

  function cutSelection() {
    copySelection();
    deleteSelection();
  }

  function pasteSelection() {
    const hasNotes = s.clipboard.value.length > 0;
    const hasBpms = s.clipboardBpmChanges.value.length > 0;
    if (!hasNotes && !hasBpms) return;
    const baseRow = canvas.beatToRow(canvas.snapBeat(s.scrollBeat.value));
    const clipBase = hasNotes
      ? s.clipboard.value[0].row
      : Math.min(...s.clipboardBpmChanges.value.map((c) => Math.round(c.beat * 48)));
    const deltaRow = baseRow - clipBase;

    if (hasNotes) {
      for (const row of s.clipboard.value) {
        const newRow = row.row + deltaRow;
        const newBeat = newRow / 48;
        const newSecond = (newBeat / s.bpm.value) * 60;
        const existing = s.noteRows.value.find((r) => r.row === newRow);
        if (existing) {
          for (const n of row.notes) {
            existing.notes = existing.notes.filter((en) => en.track !== n.track);
            existing.notes.push({
              ...n,
              holdEndRow: n.holdEndRow !== null ? n.holdEndRow + deltaRow : null,
            });
          }
        } else {
          s.noteRows.value.push({
            row: newRow,
            beat: newBeat,
            second: newSecond,
            notes: row.notes.map((n) => ({
              ...n,
              holdEndRow: n.holdEndRow !== null ? n.holdEndRow + deltaRow : null,
            })),
          });
        }
      }
      s.noteRows.value.sort((a, b) => a.row - b.row);
    }

    if (hasBpms) {
      for (const c of s.clipboardBpmChanges.value) {
        const newRow = Math.round(c.beat * 48) + deltaRow;
        const newBeat = newRow / 48;
        mergeBpmAtBeat(newBeat, c.bpm);
      }
    }

    pushUndo();
  }

  // ====== Insert / remove one quantize grid (shift all notes) ======
  function quantizeGridStepBeats(): number {
    const q = s.quantize.value;
    return q > 0 ? 4 / q : 1;
  }

  function quantizeGridStepRows(): number {
    return Math.round(quantizeGridStepBeats() * 48);
  }

  function receptorThresholdRow(): number {
    const thrBeat = canvas.snapBeat(s.scrollBeat.value);
    return canvas.beatToRow(thrBeat);
  }

  /** True if note head is strictly above the drawn receptor (same test as `beatToY` vs receptor). */
  function noteHeadPastReceptorLine(beat: number): boolean {
    return beat < s.scrollBeat.value - 1e-9;
  }

  /**
   * Receptor lies strictly inside hold body (not on head row, not on tail row):
   * then add/delete beat only adjusts tail length. If the line coincides with the tail end, do nothing.
   */
  function holdCrossesThreshold(headRow: number, tailRow: number, thresholdRow: number): boolean {
    return headRow < thresholdRow && tailRow > thresholdRow;
  }

  /** True if delete-beat at receptor can run without negative head row or collapsed crossing hold. */
  function canDeleteBeatShiftNotesUp(): boolean {
    const d = quantizeGridStepRows();
    if (d <= 0) return false;
    const thresholdRow = receptorThresholdRow();
    for (const r of s.noteRows.value) {
      const h = r.row;
      // Past the drawn receptor (unsnapped scrollBeat); removed on delete, not shifted — unlike thresholdRow which is snapped for grid ops.
      if (noteHeadPastReceptorLine(r.beat)) continue;
      for (const n of r.notes) {
        const tail = n.holdEndRow;
        if (tail !== null) {
          if (holdCrossesThreshold(h, tail, thresholdRow)) {
            if (tail - d <= h) return false;
          } else if (h >= thresholdRow) {
            if (h - d < 0) return false;
          }
        } else if (h >= thresholdRow && h - d < 0) {
          return false;
        }
      }
    }
    return true;
  }

  function mergeNotesIntoRows(pieces: Array<{ row: number; note: ChartNoteInput }>): ChartNoteRow[] {
    const map = new Map<number, ChartNoteInput[]>();
    for (const { row, note } of pieces) {
      let arr = map.get(row);
      if (!arr) {
        arr = [];
        map.set(row, arr);
      }
      const i = arr.findIndex((x) => x.track === note.track);
      if (i >= 0) arr[i] = note;
      else arr.push(note);
    }
    const out: ChartNoteRow[] = [];
    for (const [row, notes] of map) {
      const beat = row / 48;
      out.push({ row, beat, second: canvas.beatToTime(beat), notes });
    }
    out.sort((a, b) => a.row - b.row);
    return out;
  }

  /**
   * direction +1: insert one quantize step at receptor — only notes at/under the line move down;
   *   if the line lies strictly inside a hold (not on the tail row), only the tail lengthens.
   * direction -1: reverse; crossing holds shorten. Receptor / scrollBeat is unchanged for both.
   */
  function shiftAllNotesByOneQuantizeStep(direction: 1 | -1) {
    if (s.playing.value) return;
    const d = quantizeGridStepRows();
    if (d <= 0) return;
    const deltaRows = direction * d;
    if (deltaRows < 0 && !canDeleteBeatShiftNotesUp()) return;

    const thresholdRow = receptorThresholdRow();
    const pieces: Array<{ row: number; note: ChartNoteInput }> = [];

    for (const r of s.noteRows.value) {
      const h = r.row;
      for (const n of r.notes) {
        // Delete beat: remove keys whose head is past the drawn receptor (matches canvas, not snap grid).
        if (deltaRows < 0 && noteHeadPastReceptorLine(r.beat)) continue;

        const tail = n.holdEndRow;
        const base: ChartNoteInput = {
          track: n.track,
          noteType: n.noteType,
          holdEndRow: n.holdEndRow,
          ...(n.routineLayer === 1 || n.routineLayer === 2 ? { routineLayer: n.routineLayer } : {}),
        };

        if (tail !== null) {
          if (holdCrossesThreshold(h, tail, thresholdRow)) {
            pieces.push({
              row: h,
              note: { ...base, holdEndRow: tail + deltaRows },
            });
          } else if (h >= thresholdRow) {
            pieces.push({
              row: h + deltaRows,
              note: { ...base, holdEndRow: tail + deltaRows },
            });
          } else {
            pieces.push({ row: h, note: { ...base } });
          }
        } else if (h >= thresholdRow) {
          pieces.push({
            row: h + deltaRows,
            note: { ...base, holdEndRow: null },
          });
        } else {
          pieces.push({ row: h, note: { ...base, holdEndRow: null } });
        }
      }
    }

    s.noteRows.value = mergeNotesIntoRows(pieces);
    pushUndo();
  }

  function addBeatShiftNotesDown() {
    if (s.allCharts.value.length === 0) return;
    shiftAllNotesByOneQuantizeStep(1);
  }

  function deleteBeatShiftNotesUp() {
    if (s.allCharts.value.length === 0) return;
    shiftAllNotesByOneQuantizeStep(-1);
  }

  // ====== Flip / Mirror ======
  /** Non-pump: mirror note rows in time within one axis-aligned rect (hold tails adjusted). */
  function applyTimeMirrorInRect(range: SelectionRect) {
    const center = range.minRow + range.maxRow;
    for (const r of s.noteRows.value) {
      if (r.row >= range.minRow && r.row <= range.maxRow) {
        const hasSelectedNotes = r.notes.some((n) => n.track >= range.minTrack && n.track <= range.maxTrack);
        if (hasSelectedNotes) {
          r.row = center - r.row;
          r.beat = r.row / 48;
          r.second = (r.beat / s.bpm.value) * 60;
          for (const n of r.notes) {
            if (n.track >= range.minTrack && n.track <= range.maxTrack && n.holdEndRow !== null) {
              n.holdEndRow = center - n.holdEndRow;
              if (n.holdEndRow < r.row) {
                const tmp = r.row;
                r.row = n.holdEndRow;
                n.holdEndRow = tmp;
                r.beat = r.row / 48;
                r.second = (r.beat / s.bpm.value) * 60;
              }
            }
          }
        }
      }
    }
    s.noteRows.value.sort((a, b) => a.row - b.row);
  }

  function flipHorizontal() {
    const rects = getAllSelectionRects();
    if (rects.length === 0) return;
    const steps = s.activeChart.value?.stepsType;
    const nT = s.NUM_TRACKS.value;
    if (isPumpPadLayout(steps, nT)) {
      for (const r of s.noteRows.value) {
        for (const n of r.notes) {
          if (noteInAnyRect(r.row, n.track, rects)) {
            n.track = mirrorPumpTrackH(n.track, nT);
          }
        }
      }
    } else {
      const range = mergeSelectionRects(rects);
      if (!range) return;
      for (const r of s.noteRows.value) {
        if (r.row >= range.minRow && r.row <= range.maxRow) {
          for (const n of r.notes) {
            if (n.track >= range.minTrack && n.track <= range.maxTrack) {
              n.track = range.minTrack + range.maxTrack - n.track;
            }
          }
        }
      }
    }
    pushUndo();
  }

  function flipVertical() {
    const rects = getAllSelectionRects();
    if (rects.length === 0) return;
    const steps = s.activeChart.value?.stepsType;
    const nT = s.NUM_TRACKS.value;
    if (isPumpPadLayout(steps, nT)) {
      for (const r of s.noteRows.value) {
        for (const n of r.notes) {
          if (noteInAnyRect(r.row, n.track, rects)) {
            n.track = mirrorPumpTrackV(n.track, nT);
          }
        }
      }
    } else {
      const merged = mergeSelectionRects(rects);
      if (!merged) return;
      applyTimeMirrorInRect(merged);
    }
    pushUndo();
  }

  /** L/R + U/D flip in one undo step (non-pump: track mirror then time mirror in merged rect; pump: composed lane maps). */
  function flipDiagonal() {
    const rects = getAllSelectionRects();
    if (rects.length === 0) return;
    const steps = s.activeChart.value?.stepsType;
    const nT = s.NUM_TRACKS.value;
    if (isPumpPadLayout(steps, nT)) {
      for (const r of s.noteRows.value) {
        for (const n of r.notes) {
          if (noteInAnyRect(r.row, n.track, rects)) {
            n.track = mirrorPumpTrackV(mirrorPumpTrackH(n.track, nT), nT);
          }
        }
      }
    } else {
      const range = mergeSelectionRects(rects);
      if (!range) return;
      for (const r of s.noteRows.value) {
        if (r.row >= range.minRow && r.row <= range.maxRow) {
          for (const n of r.notes) {
            if (n.track >= range.minTrack && n.track <= range.maxTrack) {
              n.track = range.minTrack + range.maxTrack - n.track;
            }
          }
        }
      }
      applyTimeMirrorInRect(range);
    }
    pushUndo();
  }

  // ====== Save ======
  async function saveToFile(): Promise<boolean> {
    const song = game.currentSong;
    if (!song || s.allCharts.value.length === 0) return false;
    const notes = buildSaveNotesPayload();
    try {
      s.saving.value = true;
      // Save notes
      await api.saveChart(song.path, s.activeChartIndex.value, notes);
      // Save all timing data
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
      game.needsSongRefresh = true;
      refreshEditorChartBaseline();
      refreshEditorMetaBaseline();
      clearEditorChartBackup(song.path, s.activeChartIndex.value);
      s.saveMessage.value = t("editor.saved");
      setSaveMessage(String(t("editor.saved")));
      return true;
    } catch (e: unknown) {
      setSaveMessage(t("editor.saveError") + ": " + String(e));
      return false;
    } finally {
      s.saving.value = false;
    }
  }

  async function saveMetadata(): Promise<boolean> {
    const song = game.currentSong;
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
        const idx = Math.min(
          Math.max(0, s.activeChartIndex.value),
          s.allCharts.value.length - 1,
        );
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
      setSaveMessage(String(t("editor.metaSaved")));
      return true;
    } catch (e: unknown) {
      setSaveMessage(String(e));
      return false;
    } finally {
      s.metaSaving.value = false;
    }
  }

  // ====== Scroll & keyboard ======
  function handleScroll(e: WheelEvent) {
    e.preventDefault();
    if (s.allCharts.value.length === 0) return;
    // Keep waveform panel within visible viewport after any layout/zoom changes.
    s.waveformPanelOffsetX.value = clampWaveformPanelOffset(s.waveformPanelOffsetX.value);
    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? -10 : 10;
      s.zoom.value = Math.max(EDITOR_ZOOM_MIN, Math.min(EDITOR_ZOOM_MAX, s.zoom.value + delta));
    } else {
      const q = s.quantize.value;
      const stepBeats = q > 0 ? 4 / q : 1;
      const dir = Math.sign(e.deltaY);
      if (dir === 0) return;
      s.scrollBeat.value = Math.max(0, s.scrollBeat.value + dir * stepBeats);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (s.showNewChartModal.value) return;
    if (isEditableTarget(e.target)) return;
    if (s.allCharts.value.length === 0) {
      if (game.shortcutMatches(e, "editor.back")) {
        if (s.holdStartRow.value !== null) {
          s.holdStartRow.value = null;
          e.preventDefault();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        goBack();
      }
      return;
    }
    if (game.shortcutMatches(e, "editor.redo")) {
      redo();
      e.preventDefault();
      return;
    }
    if (game.shortcutMatches(e, "editor.undo")) {
      if (s.undoStack.value.length > 1) undo();
      e.preventDefault();
      return;
    }
    if (game.shortcutMatches(e, "editor.save")) { void saveToFile(); e.preventDefault(); return; }
    if (game.shortcutMatches(e, "editor.copy")) { copySelection(); e.preventDefault(); return; }
    if (game.shortcutMatches(e, "editor.cut")) { cutSelection(); e.preventDefault(); return; }
    if (game.shortcutMatches(e, "editor.paste")) { pasteSelection(); e.preventDefault(); return; }
    if (game.shortcutMatches(e, "editor.selectAll")) { selectAll(); e.preventDefault(); return; }
    if (game.shortcutMatches(e, "editor.clearSelection")) {
      const hasSel = s.selectionStart.value !== null || s.additionalSelections.value.length > 0;
      if (hasSel) { clearSelection(); e.preventDefault(); return; }
      // Fall through to editor.back if no selection
    }
    if (game.shortcutMatches(e, "editor.delete")) { deleteSelection(); e.preventDefault(); return; }
    if (game.shortcutMatches(e, "editor.back")) {
      if (s.showNewChartModal.value) {
        s.showNewChartModal.value = false;
        e.preventDefault();
        return;
      }
      if (s.holdStartRow.value !== null) {
        s.holdStartRow.value = null;
        e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      goBack();
      return;
    }
    if (game.shortcutMatches(e, "editor.playPause")) { togglePlayback(); e.preventDefault(); return; }
    if (game.shortcutMatches(e, "editor.previewPlay")) { previewPlay(); e.preventDefault(); return; }
    if (game.shortcutMatches(e, "editor.addBeat")) { addBeatShiftNotesDown(); e.preventDefault(); return; }
    if (game.shortcutMatches(e, "editor.deleteBeat")) { if (canDeleteBeatShiftNotesUp()) { deleteBeatShiftNotesUp(); } e.preventDefault(); return; }
    if (game.shortcutMatches(e, "editor.scrollUp")) {
      s.scrollBeat.value = Math.max(0, s.scrollBeat.value - 1);
      e.preventDefault();
      return;
    }
    if (game.shortcutMatches(e, "editor.scrollDown")) {
      s.scrollBeat.value += 1;
      e.preventDefault();
      return;
    }
    if (game.shortcutMatches(e, "editor.zoomIn")) {
      s.zoom.value = Math.min(EDITOR_ZOOM_MAX, s.zoom.value + EDITOR_ZOOM_STEP_KEY);
      e.preventDefault();
      return;
    }
    if (game.shortcutMatches(e, "editor.zoomOut")) {
      s.zoom.value = Math.max(EDITOR_ZOOM_MIN, s.zoom.value - EDITOR_ZOOM_STEP_KEY);
      e.preventDefault();
      return;
    }
    if (game.shortcutMatches(e, "editor.quantizeUp")) {
      cycleQuantize(1);
      e.preventDefault();
      return;
    }
    if (game.shortcutMatches(e, "editor.quantizeDown")) {
      cycleQuantize(-1);
      e.preventDefault();
      return;
    }
    if (game.shortcutMatches(e, "editor.flipH")) { flipHorizontal(); e.preventDefault(); return; }
    if (game.shortcutMatches(e, "editor.flipV")) { flipVertical(); e.preventDefault(); return; }
    if (game.shortcutMatches(e, "editor.flipD")) { flipDiagonal(); e.preventDefault(); return; }

    if (s.activeChart.value?.stepsType === "pump-routine") {
      if (game.shortcutMatches(e, "editor.routineLayer1")) {
        s.editorRoutineLayer.value = 1;
        e.preventDefault();
        return;
      }
      if (game.shortcutMatches(e, "editor.routineLayer2")) {
        s.editorRoutineLayer.value = 2;
        e.preventDefault();
        return;
      }
    }

    for (let typeIdx = 0; typeIdx < NOTE_TYPES.length; typeIdx++) {
      const sid = `editor.noteType${typeIdx + 1}` as ShortcutId;
      if (game.shortcutMatches(e, sid)) {
        const nt = NOTE_TYPES[typeIdx];
        if (nt) s.currentNoteType.value = nt.id;
        e.preventDefault();
        return;
      }
    }
  }

  // ====== Playback ======
  function togglePlayback() {
    if (s.allCharts.value.length === 0) return;
    if (s.playing.value) {
      s.playing.value = false;
      api.audioPause().catch((e) => logOptionalRejection("editor.togglePlayback.pause", e));
    } else {
      s.playing.value = true;
      s.playStartBeat.value = s.scrollBeat.value;
      const chartTimeAtPlay = canvas.beatToTime(s.scrollBeat.value);
      s.playStartChartSec.value = chartTimeAtPlay;
      s.editorPlaybackWallStartMs.value = performance.now();

      // Compute the audio file position that corresponds to the current scroll beat.
      // Formula: audio_pos = beatToTime(beat) - offset
      // (positive offset → first beat is offset seconds after audio start)
      const offset = s.metaOffset.value;
      const seekPos = chartTimeAtPlay - offset;

      const playAfterMs = (ms: number) =>
        new Promise<void>((resolve) => {
          if (ms <= 1) {
            void api
              .audioPlay()
              .then(() => resolve())
              .catch((e) => {
                logOptionalRejection("editor.togglePlayback.play", e);
                resolve();
              });
            return;
          }
          setTimeout(() => {
            void api
              .audioPlay()
              .then(() => resolve())
              .catch((e) => {
                logOptionalRejection("editor.togglePlayback.play", e);
                resolve();
              });
          }, ms);
        });

      api.audioSetRate(s.editorRate.value)
        .then(() => {
          if (seekPos >= 0) {
            s.audioSeekBase.value = seekPos;
            return api.audioSeek(seekPos).then(() => playAfterMs(0));
          }
          s.audioSeekBase.value = 0;
          const delayMs = -seekPos * 1000;
          return api.audioSeek(0).then(() => playAfterMs(delayMs));
        })
        .catch((e) => logOptionalRejection("editor.togglePlayback.chain", e));
    }
  }

  // ====== Navigation ======
  function goBackNow() {
    if (s.playing.value) {
      s.playing.value = false;
      api.audioPause().catch((e) => logOptionalRejection("editor.goBack.pause", e));
    }
    api.audioSetRate(1.0).catch((e) => logOptionalRejection("editor.goBack.audioSetRate", e));
    player.cleanup(); // 清理当前播放状态
    game.resumeFromEditor = true;
    router.push("/editor-select");
  }

  function goBack() {
    void game.runEditorBackGuard().then((ok) => {
      if (ok) goBackNow();
    });
  }

  /**
   * Launch a full gameplay preview starting from the current scroll position.
   * The engine will start 2 seconds before the current beat so the player has
   * time to prepare before the first visible notes arrive.
   */
  function previewPlay() {
    if (!game.currentSong || s.allCharts.value.length === 0) return;
    // Stop editor playback
    if (s.playing.value) {
      s.playing.value = false;
      api.audioPause().catch((e) => logOptionalRejection("editor.previewPlay.pause", e));
    }
    // Sync active chart index to game store
    game.selectChart(s.activeChartIndex.value);
    // Convert current scroll beat → audio seconds using BPM changes
    // Align with sm-timing beat_to_second(beat) ≈ pure BPM integral minus song offset (no stops in editor).
    const chartIntegralSec = canvas.beatToTime(s.scrollBeat.value);
    game.previewFromSecond = chartIntegralSec - s.metaOffset.value;
    game.previewReturnToEditor = true;
    // Navigate to player options first
    router.push("/player-options");
  }

  return {
    // Chart loading
    loadAllCharts,
    switchChart,
    createNewChart,
    duplicateCurrentChart,
    performDeleteCurrentChart,
    applyChartProperties,
    // BPM
    getBpmAtBeat,
    addBpmChangeFromInput,
    updateBpmChange,
    deleteBpmChange,
    startEditingBpmChange,
    commitBpmEdit,
    cancelBpmEdit,
    // Scrollbar
    handleScrollbarMouseDown,
    // Undo
    undo,
    redo,
    reseedUndoStackAfterHydrate,
    // Mouse
    handleCanvasClick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleRightClick,
    // Selection
    selectAll,
    clearSelection,
    copySelection,
    cutSelection,
    pasteSelection,
    deleteSelection,
    flipHorizontal,
    flipVertical,
    flipDiagonal,
    addBeatShiftNotesDown,
    deleteBeatShiftNotesUp,
    canDeleteBeatShiftNotesUp,
    // Save
    saveToFile,
    saveMetadata,
    // Scroll / Keyboard
    handleScroll,
    handleKeyDown,
    // Playback
    togglePlayback,
    // Navigation
    goBack,
    goBackNow,
    previewPlay,
    // Background data (must be called explicitly after the loading overlay)
    loadWaveformData,
  };
}

export type EditorActions = ReturnType<typeof useEditorActions>;
