import type { RouteLocationNormalizedLoaded } from "vue-router";
import { useSessionStore } from "@/shared/stores/session";
import { devDebug } from "@/shared/lib/devLog";
import * as api from "@/shared/api";
import type { EditorState } from "../useEditorState";
import { defaultQuantizeFromTimeSignatures } from "../quantizeFromTimeSignature";

type SessionStore = ReturnType<typeof useSessionStore>;

export interface EditorChartLoadingDeps {
  s: EditorState;
  session: SessionStore;
  route: Pick<RouteLocationNormalizedLoaded, "query">;
  resetEditorWhenNoCharts: () => void;
  refreshEditorChartBaseline: () => void;
  refreshEditorMetaBaseline: () => void;
  pushUndo: () => void;
}

export function createEditorChartLoading(deps: EditorChartLoadingDeps) {
  const { s, session, route, resetEditorWhenNoCharts, refreshEditorChartBaseline, refreshEditorMetaBaseline, pushUndo } =
    deps;

  async function loadChartNotes(expectedSongPath?: string) {
    const song = session.currentSong;
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
      if (session.currentSong?.path !== currentSongPath) return;

      s.noteRows.value = await api.getChartNotes(currentSongPath, s.activeChartIndex.value);

      try {
        const timingData = await api.getTimingData(currentSongPath, s.activeChartIndex.value);
        if (timingData.bpms.length > 0) {
          s.bpmChanges.value = timingData.bpms.sort((a, b) => a.beat - b.beat);
          s.bpm.value = s.bpmChanges.value[0].bpm;
        } else {
          const rawBpm = song.displayBpm || "120";
          const parsed = parseFloat(rawBpm.split("-")[0]);
          s.bpm.value = isNaN(parsed) ? 120 : parsed;
          s.bpmChanges.value = [{ beat: 0, bpm: s.bpm.value }];
        }

        s.timeSignatures.value =
          timingData.timeSignatures.length > 0
            ? timingData.timeSignatures.sort((a, b) => a.beat - b.beat)
            : [{ beat: 0, numerator: 4, denominator: 4 }];
        s.tickcounts.value =
          timingData.tickcounts.length > 0
            ? timingData.tickcounts.sort((a, b) => a.beat - b.beat)
            : [{ beat: 0, ticksPerBeat: 4 }];
        s.comboChanges.value =
          timingData.combos.length > 0
            ? timingData.combos.sort((a, b) => a.beat - b.beat)
            : [{ beat: 0, combo: 1, missCombo: 1 }];
        s.speedChanges.value =
          timingData.speeds.length > 0
            ? timingData.speeds.sort((a, b) => a.beat - b.beat)
            : [{ beat: 0, ratio: 1.0, delay: 0, unit: 0 }];
        s.scrollChanges.value =
          timingData.scrolls.length > 0
            ? timingData.scrolls.sort((a, b) => a.beat - b.beat)
            : [{ beat: 0, ratio: 1.0 }];
        s.labelChanges.value =
          timingData.labels.length > 0
            ? timingData.labels.sort((a, b) => a.beat - b.beat)
            : [{ beat: 0, label: "Song Start" }];
      } catch (e: unknown) {
        console.warn("[Editor] Failed to load timing data:", e);
        const rawBpm = song.displayBpm || "120";
        const parsed = parseFloat(rawBpm.split("-")[0]);
        s.bpm.value = isNaN(parsed) ? 120 : parsed;
        s.bpmChanges.value = [{ beat: 0, bpm: s.bpm.value }];
        s.timeSignatures.value = [{ beat: 0, numerator: 4, denominator: 4 }];
        s.tickcounts.value = [{ beat: 0, ticksPerBeat: 4 }];
        s.comboChanges.value = [{ beat: 0, combo: 1, missCombo: 1 }];
        s.speedChanges.value = [{ beat: 0, ratio: 1.0, delay: 0, unit: 0 }];
        s.scrollChanges.value = [{ beat: 0, ratio: 1.0 }];
        s.labelChanges.value = [{ beat: 0, label: "Song Start" }];
      }

      s.quantize.value = defaultQuantizeFromTimeSignatures(s.timeSignatures.value);

      if (session.currentSong?.path !== currentSongPath) return;
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
    const song = session.currentSong;
    if (!song) return;

    if (expectedSongPath && song.path !== expectedSongPath) return;
    const currentSongPath = song.path;

    try {
      if (session.currentSong?.path !== currentSongPath) return;
      const meta = await api.getSongMetadata(currentSongPath);
      if (session.currentSong?.path !== currentSongPath) return;
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
      if (session.currentSong?.path !== currentSongPath) return;
      s.metaTitle.value = song.title || "";
      s.metaArtist.value = song.artist || "";
      refreshEditorMetaBaseline();
    }
  }

  async function loadAllCharts(expectedSongPath?: string) {
    const song = session.currentSong;
    if (!song) return;

    if (expectedSongPath && song.path !== expectedSongPath) {
      devDebug("Editor", "Song changed during load, ignoring stale load");
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

      if (session.currentSong?.path !== currentSongPath) {
        devDebug("Editor", "Song changed during chart load, ignoring");
        return;
      }

      if (s.allCharts.value.length === 0) {
        s.activeChartIndex.value = 0;
        resetEditorWhenNoCharts();
        s.showNewChartModal.value = route.query.newChart === "1";
      } else {
        s.activeChartIndex.value = Math.min(session.currentChartIndex, s.allCharts.value.length - 1);
        s.syncEditChartPropertiesFromActive();
        await loadChartNotes(currentSongPath);
        s.showNewChartModal.value = route.query.newChart === "1";
      }

      if (session.currentSong?.path !== currentSongPath) {
        devDebug("Editor", "Song changed after chart load, ignoring");
        return;
      }
    } catch {
      s.allCharts.value = [];
      resetEditorWhenNoCharts();
    }

    if (session.currentSong?.path !== currentSongPath) return;
    await loadMetadata(currentSongPath);
    if (session.currentSong?.path !== currentSongPath) return;
    s.undoStack.value = [];
    s.redoStack.value = [];
    pushUndo();
    s.afterChartNotesLoaded.value?.();
  }

  async function loadWaveformData(expectedSongPath?: string) {
    const song = session.currentSong;
    if (!song) return;

    if (expectedSongPath && song.path !== expectedSongPath) return;
    const currentSongPath = song.path;

    const yieldToMain = (): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

    s.waveformMinMax.value = new Float32Array(0);
    s.waveformDuration.value = 0;
    try {
      const musicPath = await api.getSongMusicPath(currentSongPath);
      if (session.currentSong?.path !== currentSongPath) return;

      const dataUrl = await api.readFileBase64(musicPath);
      if (session.currentSong?.path !== currentSongPath) return;

      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
        if ((i & 0xfffff) === 0xfffff && i > 0) {
          if (session.currentSong?.path !== currentSongPath) return;
          await yieldToMain();
        }
      }
      if (session.currentSong?.path !== currentSongPath) return;

      const audioCtx = new AudioContext();
      try {
        const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0));
        if (session.currentSong?.path !== currentSongPath) return;

        const numChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const mono = new Float32Array(length);
        const channelData: Float32Array[] = [];
        for (let ch = 0; ch < numChannels; ch++) {
          channelData.push(audioBuffer.getChannelData(ch));
        }
        const yieldEveryMono = 131072;
        for (let j = 0; j < length; j++) {
          let sum = 0;
          for (let ch = 0; ch < numChannels; ch++) {
            sum += channelData[ch]?.[j] ?? 0;
          }
          mono[j] = numChannels > 1 ? sum / numChannels : sum;
          if (j > 0 && (j & (yieldEveryMono - 1)) === yieldEveryMono - 1) {
            if (session.currentSong?.path !== currentSongPath) return;
            await yieldToMain();
          }
        }
        const bucketCount = Math.min(65536, Math.max(12288, Math.ceil(length / 128)));
        const blockSize = Math.max(1, Math.floor(length / bucketCount));
        const mm = new Float32Array(bucketCount * 2);
        for (let i = 0; i < bucketCount; i++) {
          const start = i * blockSize;
          const end = Math.min(length, start + blockSize);
          let mn = 0;
          let mx = 0;
          if (start < end) {
            mn = mono[start] ?? 0;
            mx = mn;
            for (let j = start + 1; j < end; j++) {
              const v = mono[j] ?? 0;
              if (v < mn) mn = v;
              if (v > mx) mx = v;
            }
          }
          mm[i * 2] = mn;
          mm[i * 2 + 1] = mx;
          if (i > 0 && (i & 0x1ff) === 0x1ff) {
            if (session.currentSong?.path !== currentSongPath) return;
            await yieldToMain();
          }
        }
        s.waveformMinMax.value = mm;
        s.waveformDuration.value = audioBuffer.duration;
      } finally {
        await audioCtx.close();
      }
    } catch (err: unknown) {
      console.warn("[Editor] Failed to load waveform:", err);
      s.waveformMinMax.value = new Float32Array(0);
      s.waveformDuration.value = 0;
    }
  }

  return {
    loadAllCharts,
    loadChartNotes,
    loadMetadata,
    loadWaveformData,
  };
}
