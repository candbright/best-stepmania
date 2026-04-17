import type { Router } from "vue-router";
import { useGameStore } from "@/shared/stores/game";
import { usePlayerStore } from "@/shared/stores/player";
import * as api from "@/shared/api";
import { logOptionalRejection } from "@/shared/lib/devLog";
import type { EditorCanvas } from "../useEditorCanvas";
import type { EditorState } from "../useEditorState";

type GameStore = ReturnType<typeof useGameStore>;
type PlayerStore = ReturnType<typeof usePlayerStore>;

export interface EditorPlaybackNavDeps {
  s: EditorState;
  canvas: EditorCanvas;
  router: Router;
  game: GameStore;
  player: PlayerStore;
}

export function createEditorPlaybackNav(deps: EditorPlaybackNavDeps) {
  const { s, canvas, router, game, player } = deps;

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

  function goBackNow() {
    if (s.playing.value) {
      s.playing.value = false;
      api.audioPause().catch((e) => logOptionalRejection("editor.goBack.pause", e));
    }
    api.audioSetRate(1.0).catch((e) => logOptionalRejection("editor.goBack.audioSetRate", e));
    player.cleanup();
    game.resumeFromEditor = true;
    router.push("/editor-select");
  }

  function goBack() {
    void game.runEditorBackGuard().then((ok) => {
      if (ok) goBackNow();
    });
  }

  function previewPlay() {
    if (!game.currentSong || s.allCharts.value.length === 0) return;
    if (s.playing.value) {
      s.playing.value = false;
      api.audioPause().catch((e) => logOptionalRejection("editor.previewPlay.pause", e));
    }
    game.selectChart(s.activeChartIndex.value);
    const chartIntegralSec = canvas.beatToTime(s.scrollBeat.value);
    game.previewFromSecond = chartIntegralSec - s.metaOffset.value;
    game.previewReturnToEditor = true;
    router.push("/player-options");
  }

  return {
    togglePlayback,
    goBackNow,
    goBack,
    previewPlay,
  };
}
