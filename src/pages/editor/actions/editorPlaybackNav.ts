import type { Router } from "vue-router";
import { useSessionStore } from "@/shared/stores/session";
import { usePlayerStore } from "@/shared/stores/player";
import * as api from "@/shared/api";
import { logDebug, logInfo } from "@/shared/lib/devLog";
import type { EditorCanvas } from "../useEditorCanvas";
import type { EditorState } from "../useEditorState";

type SessionStore = ReturnType<typeof useSessionStore>;
type PlayerStore = ReturnType<typeof usePlayerStore>;

export interface EditorPlaybackNavDeps {
  s: EditorState;
  canvas: EditorCanvas;
  router: Router;
  session: SessionStore;
  player: PlayerStore;
}

export function createEditorPlaybackNav(deps: EditorPlaybackNavDeps) {
  const { s, canvas, router, session, player } = deps;

  function togglePlayback() {
    if (s.allCharts.value.length === 0) return;
    if (s.playing.value) {
      s.playing.value = false;
      api.audioPause().catch((e) => logDebug("Optional", "editor.togglePlayback.pause", e));
    } else {
      s.playing.value = true;
      s.playStartBeat.value = s.scrollBeat.value;
      const chartTimeAtPlay = canvas.beatToTime(s.scrollBeat.value);
      s.playStartChartSec.value = chartTimeAtPlay;
      s.editorPlaybackWallStartMs.value = performance.now();

      const offset = s.metaOffset.value;
      const seekPos = chartTimeAtPlay - offset;

      const playAfterMs = (ms: number) =>
        new Promise<void>((resolve) => {
          if (ms <= 1) {
            void api
              .audioPlay()
              .then(() => resolve())
              .catch((e) => {
                logDebug("Optional", "editor.togglePlayback.play", e);
                resolve();
              });
            return;
          }
          setTimeout(() => {
            void api
              .audioPlay()
              .then(() => resolve())
              .catch((e) => {
                logDebug("Optional", "editor.togglePlayback.play", e);
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
        .catch((e) => logDebug("Optional", "editor.togglePlayback.chain", e));
    }
  }

  function goBackNow() {
    if (s.playing.value) {
      s.playing.value = false;
      api.audioPause().catch((e) => logDebug("Optional", "editor.goBack.pause", e));
    }
    api.audioSetRate(1.0).catch((e) => logDebug("Optional", "editor.goBack.audioSetRate", e));
    player.cleanup();
    session.resumeFromEditor = true;
    router.push("/editor-select");
  }

  function goBack() {
    void session.runEditorBackGuard().then((ok) => {
      if (ok) goBackNow();
    });
  }

  function previewPlay() {
    if (!session.currentSong || s.allCharts.value.length === 0) return;
    if (s.playing.value) {
      s.playing.value = false;
      api.audioPause().catch((e) => logDebug("Optional", "editor.previewPlay.pause", e));
    }
    session.selectChart(s.activeChartIndex.value);
    const scrollBeat = s.scrollBeat.value;
    const chartIntegralSec = canvas.beatToTime(scrollBeat);
    const metaOffset = s.metaOffset.value;
    const previewSec = chartIntegralSec - metaOffset;
    logInfo("Editor", "previewPlay", {
      activeChartIndex: s.activeChartIndex.value,
      scrollBeat,
      chartIntegralSec,
      metaOffset,
      previewSec,
    });
    session.previewFromSecond = previewSec;
    session.editorPreviewAnchorSecond = previewSec;
    session.previewReturnToEditor = true;
    router.push("/player-options");
  }

  return {
    togglePlayback,
    goBackNow,
    goBack,
    previewPlay,
  };
}
