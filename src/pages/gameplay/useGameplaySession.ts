import { ref, shallowRef, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "@/shared/stores/session";
import { useSettingsStore } from "@/shared/stores/settings";
import { mergeShortcutBindings, eventMatchesBinding, type ShortcutId } from "@/shared/lib/engine/keyBindings";
import { GameEngine } from "@/shared/lib/engine/GameEngine";
import { createTauriAudioPort } from "@/shared/lib/engine";
import { keyMapLookupTrack, resolveGameplayKeyMap10 } from "@/shared/lib/engine/keyBindings";
import { JUDGMENT_COLORS, getJudgmentName } from "@/shared/lib/engine/judgmentDisplay";
import type {
  JudgmentEvent,
  GameConfig,
  ChartNoteRow,
  NoteFieldExposed,
  ReplayInputEvent,
} from "@/shared/lib/engine/types";
import * as api from "@/shared/api";
import { getIpcInvokeSnapshot } from "@/shared/api";
import type { TimingDataResponse } from "@/shared/api/editor";
import type { ChartTimingSlice } from "@/shared/lib/engine/chartTiming";
import { useNoteSkin } from "@/shared/stores/noteskin";
import {
  applyGameplayRhythmSfxSettings,
  playBeatLine,
  playCountdown,
  playCountdownGo,
  playJudgment,
} from "@/shared/lib/sfx";
import { logDebug, logError, logInfo } from "@/shared/lib/devLog";
import { useI18n } from "@/shared/i18n";
import { playModeAndCoopForStepsType } from "@/shared/lib/chartPlayMode";
import { APP_VERSION } from "@/shared/constants/appMeta";

export function useGameplaySession() {
const router = useRouter();
const session = useSessionStore();
const settings = useSettingsStore();
const { t } = useI18n();

function shortcutMatches(e: KeyboardEvent, id: ShortcutId): boolean {
  const binding = mergeShortcutBindings(settings.shortcutOverrides)[id];
  return eventMatchesBinding(e, binding);
}

const noteFieldRef = shallowRef<NoteFieldExposed | null>(null);
const gameState = ref<string>("loading");
const countdown = ref(3);
const cdText = ref("");
const showPauseMenu = ref(false);
/** True when launched from editor preview; suppress non-rhythm gameplay SFX. */
const editorPreviewMode = ref(false);
const lastJudgmentText = ref("");
const lastJudgmentColor = ref("");
/** Cancellable handle for the judgment-text clear timer — prevents rapid-fire notes clearing each other's text early. */
let lastJudgmentTimer: ReturnType<typeof setTimeout> | null = null;
const offsetText = ref("");
const p1OffsetDisplay = ref("");
const p2OffsetDisplay = ref("");
const lifePercent = ref(100);
const scoreDisplay = ref(0);
const comboDisplay = ref(0);
const savingScore = ref(false);
/** Stops duplicate `save_score` IPC if the engine fires finish/fail handlers more than once in one run. */
let scoreWriteClaimedForRun = false;
let scoreWrite2ClaimedForRun = false;
const replayEvents = ref<ReplayInputEvent[]>([]);
let replayLastEventMs = 0;
const REPLAY_SAMPLE_INTERVAL_MS = 10;
const replaySampleTimer = ref<ReturnType<typeof setInterval> | null>(null);
const devPerf = ref({
  qualityLevel: "high",
  frameMs: 0,
  particles: 0,
  driftMs: 0,
  simSecond: 0,
  audioSync: false,
  notes: 0,
  ipcTotal: 0,
  ipcTop: "",
  songDuration: 0,
  finishRawAudioEnded: false,
  finishLatchedPastSongEnd: false,
  finishPlaybackEndedLatch: false,
  finishSettleLineSec: 0,
  finishPendingScoreable: false,
  finishPendingHolds: false,
});
const devPanelTimer = ref<ReturnType<typeof setInterval> | null>(null);
const showDevPanel = ref(false);
const countdownInterval = ref<ReturnType<typeof setInterval> | null>(null);
// Navigation timer — tracks the delayed push to /evaluation or /select-music
// so it can be cancelled if the player quits before it fires.
const resultNavTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const bgVideoPath = ref<string | undefined>();
const bgImagePath = ref<string | undefined>();
const bgPlaying = ref(false);

// Always 10-key layout: P1 uses tracks 0-4, P2 uses tracks 5-9
const numTracks = 10;

const DEFAULT_GAMEPLAY_TIMING: TimingDataResponse = {
  bpms: [{ beat: 0, bpm: 120 }],
  stops: [],
  delays: [],
  timeSignatures: [],
  tickcounts: [],
  combos: [],
  speeds: [],
  scrolls: [],
  labels: [],
  offset: 0,
};

function timingResponseToChartSlice(r: TimingDataResponse): ChartTimingSlice {
  return {
    bpms: r.bpms,
    stops: r.stops.map(([beat, duration]) => ({ beat, duration })),
    delays: r.delays.map(([beat, duration]) => ({ beat, duration })),
    offset: r.offset,
  };
}

/** One chart block with '&' (parser merges P1/P2 lanes). */
function isRoutineMergedStepsType(stepsType: string | undefined): boolean {
  return stepsType === "pump-routine" || stepsType === "dance-routine";
}

/** One 10-lane chart: single player, both pads — each note row is 10 digits (not two 5-lane charts). */
function isPumpDoubleSingleChartStepsType(stepsType: string | undefined): boolean {
  return stepsType === "pump-double";
}

function computeRequireBothFailedForGameOver(): boolean {
  if (!(session.hasPlayer1 && session.hasPlayer2)) return false;
  return session.playMode === "pump-single" || session.playMode === "pump-routine";
}

function isPerPlayerDualSession(): boolean {
  return (
    session.hasPlayer1 &&
    session.hasPlayer2 &&
    (session.playMode === "pump-single" || session.playMode === "pump-routine")
  );
}

const p1Config: GameConfig = {
  audioOffset: settings.audioOffsetMs,
  judgmentStyle: (settings.judgmentStyle === "itg" ? "itg" : "ddr") as "ddr" | "itg",
  showOffset: settings.showOffset,
  lifeType: (settings.lifeType as "bar" | "battery" | "survival") || "bar",
  autoPlay: settings.autoPlay,
  expertModeEnabled: settings.expertModeEnabled ?? false,
  numTracks,
  playbackRate: settings.playbackRate ?? 1,
  batteryLives: settings.batteryLives ?? 3,
  showParticles: settings.showParticles,
  coopMode: settings.coopMode,
  sessionPlayMode: session.playMode,
  playerConfigs: [
    { ...settings.player1Config },
    { ...settings.player2Config },
  ],
  requireBothFailedForGameOver: computeRequireBothFailedForGameOver(),
};

// Single audio port and engine for both players
const sharedAudioPort = createTauriAudioPort();
const engine = new GameEngine(p1Config, sharedAudioPort);

// ── P2 HUD state ──────────────────────────────
const p2LifePercent = ref(100);
const p2ScoreDisplay = ref(0);
const p2ComboDisplay = ref(0);
const p2Difficulty = ref("");
const p2Meter = ref("");

const { loadSkin } = useNoteSkin();
const skinConfig = ref<Awaited<ReturnType<typeof loadSkin>> | null>(null);
const skinConfig2 = ref<Awaited<ReturnType<typeof loadSkin>> | null>(null);

async function loadSkinForGame() {
  try {
    skinConfig.value = await loadSkin(settings.player1Config.noteskin);
    const p2Noteskin =
      session.playMode === "pump-double"
        ? settings.player1Config.noteskin
        : (settings.player2Config?.noteskin ?? settings.player1Config.noteskin);
    skinConfig2.value = await loadSkin(p2Noteskin);
  } catch {
    skinConfig.value = null;
    skinConfig2.value = null;
  }
}

watch(() => [settings.player1Config.noteskin, settings.player2Config?.noteskin] as const, loadSkinForGame, { immediate: true });

watch(gameState, (to, from) => {
  logDebug("Gameplay", "gameState", { from, to });
});

function shouldShowCenterJudgment(): boolean {
  return !(session.playMode === "pump-double" || (session.hasPlayer1 && session.hasPlayer2));
}

function onJudgment(evt: JudgmentEvent) {
  playJudgment(evt.judgment);
  logDebug("Gameplay", "judgment", {
    judgment: evt.judgment,
    player: evt.player,
    track: evt.track,
    noteRow: evt.noteRow,
    chartTime: evt.time,
    offsetSec: evt.offset,
    offsetMs: Math.round(evt.offset * 1000),
  });
  const name = getJudgmentName(evt.judgment, p1Config.judgmentStyle);
  const color = JUDGMENT_COLORS[evt.judgment];
  if (shouldShowCenterJudgment()) {
    lastJudgmentText.value = name;
    lastJudgmentColor.value = color;
    if (lastJudgmentTimer !== null) clearTimeout(lastJudgmentTimer);
    lastJudgmentTimer = setTimeout(() => { lastJudgmentText.value = ""; lastJudgmentTimer = null; }, 600);
  } else {
    lastJudgmentText.value = "";
  }

  if (p1Config.showOffset && evt.judgment !== "Miss") {
    const ms = Math.round(evt.offset * 1000);
    const text = (ms > 0 ? "+" : "") + ms + "ms";
    if (evt.player === 1) {
      p1OffsetDisplay.value = text;
      setTimeout(() => { p1OffsetDisplay.value = ""; }, 800);
    } else {
      p2OffsetDisplay.value = text;
      setTimeout(() => { p2OffsetDisplay.value = ""; }, 800);
    }
  }

  noteFieldRef.value?.showJudgment(name, color, evt.track);
  updateHUD();
  if (session.playMode !== "pump-double" && isPerPlayerDualSession()) updateHUD2();
}

function onMiss(evt: JudgmentEvent) {
  onJudgment(evt);
}

function updateHUD() {
  if (!engine.judgment) return;
  const j = engine.judgment;
  const primary = !session.hasPlayer1 && session.hasPlayer2 ? j.player2Score : j.player1Score;
  comboDisplay.value = primary.combo;
  lifePercent.value = Math.round(primary.life * 100);
  const dp = !session.hasPlayer1 && session.hasPlayer2 ? j.dpPercentForPlayer(2) : j.dpPercentForPlayer(1);
  scoreDisplay.value = Math.max(0, Math.round(dp * 100 * 100));
}

function updateHUD2() {
  if (!engine.judgment) return;
  const j = engine.judgment;
  const s = j.player2Score;
  p2ComboDisplay.value = s.combo;
  p2LifePercent.value = Math.round(s.life * 100);
  const dp = j.dpPercentForPlayer(2);
  p2ScoreDisplay.value = Math.max(0, Math.round(dp * 100 * 100));
}

function buildResultsForPlayer(player: 1 | 2) {
  const j = engine.judgment;
  if (!j) {
    throw new Error("buildResultsForPlayer: judgment is not initialized");
  }
  const s = player === 1 ? j.player1Score : j.player2Score;
  const dp = j.dpPercentForPlayer(player);
  return {
    grade: j.gradeForPlayer(player),
    dpPercent: dp,
    score: Math.max(0, Math.round(dp * 10000)),
    maxCombo: s.maxCombo,
    w1: s.w1, w2: s.w2, w3: s.w3, w4: s.w4, w5: s.w5, miss: s.miss,
    held: s.held, letGo: s.letGo, minesHit: s.minesHit,
    fullCombo: s.miss === 0,
    offsets: j.events.filter((e) => e.player === player).map((e) => e.offset),
  };
}

function buildResultsObject() {
  const j = engine.judgment;
  if (!j) {
    throw new Error("buildResultsObject: judgment is not initialized");
  }
  // P2-only session (rare edge case when P1 slot not taken).
  if (!session.hasPlayer1 && session.hasPlayer2) {
    return buildResultsForPlayer(2);
  }
  // pump-double is a single-player mode — all notes belong to P1.
  // pump-single / pump-routine co-op with two players — results also keyed to P1
  // (P2 results go through buildResultsObject2 / saveScoreToProfile2).
  // Fall through only for genuine single-player P1 without a second player slot.
  return buildResultsForPlayer(1);
}

function currentChartFingerprint(songPath: string, stepsType: string, difficulty: string, meter: number): string {
  return `${songPath}::${stepsType}::${difficulty}::${meter}`;
}

function resetReplayRecorder() {
  replayEvents.value = [];
  replayLastEventMs = 0;
}

function currentKeyMask(): number {
  let mask = 0;
  for (let i = 0; i < numTracks; i++) {
    if (engine.keysDown[i]) {
      mask |= 1 << i;
    }
  }
  return mask;
}

function appendReplayEvent(keyMask: number) {
  if (session.replayMode) return;
  if (gameState.value !== "playing") return;
  const elapsedMs = Math.max(0, Math.round(engine.getChartPlayheadSeconds() * 1000));
  const deltaMs = Math.max(0, elapsedMs - replayLastEventMs);
  replayLastEventMs = elapsedMs;
  replayEvents.value.push({ deltaMs, track: 0, action: 3, keyMask });
}

function startReplaySampling() {
  if (session.replayMode || replaySampleTimer.value) return;
  appendReplayEvent(currentKeyMask());
  replaySampleTimer.value = setInterval(() => {
    appendReplayEvent(currentKeyMask());
  }, REPLAY_SAMPLE_INTERVAL_MS);
}

function stopReplaySampling() {
  if (replaySampleTimer.value) {
    clearInterval(replaySampleTimer.value);
    replaySampleTimer.value = null;
  }
  if (!session.replayMode && gameState.value === "playing") {
    appendReplayEvent(currentKeyMask());
  }
}

function validateReplayPayload(expectedFingerprint: string): string | null {
  const payload = session.replayPayload;
  if (!payload) return "missing-replay";
  if (payload.chartFingerprint !== expectedFingerprint) return "chart-mismatch";
  if (payload.engineVersion !== APP_VERSION) return "engine-version-mismatch";
  for (const evt of payload.events) {
    if (evt.track !== 0) return "invalid-track";
    if (evt.action !== 3) return "invalid-action";
    if (typeof evt.keyMask !== "number" || evt.keyMask < 0) {
      return "invalid-key-mask";
    }
  }
  return null;
}

async function saveScoreToProfile() {
  if (settings.autoPlay || session.replayMode) return;
  if (!session.profileId || !session.currentSong) return;
  if (!engine.judgment) return;

  const results = buildResultsObject();
  const mainChartIndex = session.hasPlayer1 ? session.p1ChartIndex : session.p2ChartIndex;
  const chartForSave = session.charts[mainChartIndex] ?? session.currentChart;
  if (!chartForSave) return;
  const modCfg = session.hasPlayer1 ? settings.player1Config : settings.player2Config;
  const modParts: string[] = [];
  modParts.push(modCfg.speedMod);
  if (modCfg.reverse) modParts.push("Reverse");
  if (modCfg.mirror) modParts.push("Mirror");
  if (modCfg.sudden) modParts.push("Sudden");
  if (modCfg.hidden) modParts.push("Hidden");
  if (modCfg.rotate) modParts.push("Rotate");

  if (scoreWriteClaimedForRun) return;
  scoreWriteClaimedForRun = true;
  try {
    savingScore.value = true;
    const scoreReq = {
      profileId: session.profileId,
      songPath: session.currentSong.path,
      stepsType: chartForSave.stepsType,
      difficulty: chartForSave.difficulty,
      meter: chartForSave.meter,
      grade: results.grade,
      dpPercent: results.dpPercent,
      score: Math.max(0, Math.round(results.dpPercent * 10000)),
      maxCombo: results.maxCombo,
      w1: results.w1, w2: results.w2, w3: results.w3,
      w4: results.w4, w5: results.w5, miss: results.miss,
      held: results.held, letGo: results.letGo, minesHit: results.minesHit,
      modifiers: modParts.join(", "),
    };
    const replayReq = {
      replayVersion: 1,
      engineVersion: APP_VERSION,
      chartFingerprint: currentChartFingerprint(
        session.currentSong.path,
        chartForSave.stepsType,
        chartForSave.difficulty,
        chartForSave.meter,
      ),
      startedAtChartSecond: 0,
      playbackRate: settings.playbackRate ?? 1,
      modifiers: modParts.join(", "),
      seed: null,
      events: replayEvents.value,
      durationMs: Math.max(0, replayLastEventMs),
    };
    await api.saveScoreWithReplay({ score: scoreReq, replay: replayReq });
    session.lastScoreSaved = true;
  } catch (err: unknown) {
    logError("Gameplay", "Failed to save score:", err);
    session.lastScoreSaved = false;
  } finally {
    savingScore.value = false;
  }
}

engine.callbacks = {
  onJudgment,
  onMiss,
  onComboBreak: () => {
    updateHUD();
    if (session.playMode !== "pump-double" && isPerPlayerDualSession()) updateHUD2();
  },
  onMineHit: (track: number) => {
    logDebug("Gameplay", "mineHit", { track, chartTime: engine.currentSecond });
    noteFieldRef.value?.showJudgment("Mine", "#ff1744", track);
    updateHUD();
    if (session.playMode !== "pump-double" && isPerPlayerDualSession()) updateHUD2();
  },
  onBeatLineApproach: (beat: number) => {
    void beat;
    playBeatLine();
  },
  onRhythmLanesApproach: (tracks, scale) => {
    // Gameplay rhythm SFX should follow key judgments, not pre-hit lane approach ticks.
    void tracks;
    void scale;
  },
  onFinish: async () => {
    stopReplaySampling();
    if (resultNavTimer.value) {
      clearTimeout(resultNavTimer.value);
      resultNavTimer.value = null;
    }
    gameState.value = "finished";
    try {
      const results = buildResultsObject();
      const finishEngine = engine.getDebugState();
      logDebug("Gameplay", "onFinish", {
        grade: results.grade,
        dpPercent: results.dpPercent,
        maxCombo: results.maxCombo,
        comboP1: engine.judgment?.player1Score.combo ?? 0,
        comboP2: engine.judgment?.player2Score.combo ?? 0,
        tallies: {
          w1: results.w1,
          w2: results.w2,
          w3: results.w3,
          w4: results.w4,
          w5: results.w5,
          miss: results.miss,
          held: results.held,
          letGo: results.letGo,
          minesHit: results.minesHit,
        },
        engine: finishEngine,
      });
      logInfo("Gameplay", "onFinish", {
        editorPreview: editorPreviewMode.value,
        editorAnchorSecond: session.editorPreviewAnchorSecond,
        grade: results.grade,
        dpPercent: results.dpPercent,
        engine: finishEngine,
      });
      session.lastResults = results;
      const dualPerPlayerResults = isPerPlayerDualSession();
      session.lastResults2 = dualPerPlayerResults ? buildResultsObject2() : null;
      await saveScoreToProfile();
      if (dualPerPlayerResults) await saveScoreToProfile2();
    } catch (err: unknown) {
      logError("Gameplay", "onFinish failed:", err);
    }
    resultNavTimer.value = setTimeout(() => router.push("/evaluation"), 1500);
  },
  onFail: async () => {
    stopReplaySampling();
    if (resultNavTimer.value) {
      clearTimeout(resultNavTimer.value);
      resultNavTimer.value = null;
    }
    gameState.value = "failed";
    try {
      const results = buildResultsObject();
      const j = engine.judgment;
      logDebug("Gameplay", "onFail", {
        grade: results.grade,
        dpPercent: results.dpPercent,
        lifeP1: j?.player1Score.life,
        lifeP2: j?.player2Score.life,
        failedP1: j?.player1Score.failed,
        failedP2: j?.player2Score.failed,
        engine: engine.getDebugState(),
      });
      session.lastResults = results;
      const dualPerPlayerResults = isPerPlayerDualSession();
      session.lastResults2 = dualPerPlayerResults ? buildResultsObject2() : null;
      await saveScoreToProfile();
      if (dualPerPlayerResults) await saveScoreToProfile2();
    } catch (err: unknown) {
      logError("Gameplay", "onFail failed:", err);
    }
    resultNavTimer.value = setTimeout(() => router.push("/evaluation"), 2000);
  },
  onHoldScoreTick: () => {
    updateHUD();
    if (session.playMode !== "pump-double" && isPerPlayerDualSession()) updateHUD2();
  },
};

function buildResultsObject2() {
  return buildResultsForPlayer(2);
}

async function saveScoreToProfile2() {
  if (settings.autoPlay) return;
  if (!session.profileId || !session.currentSong) return;
  if (!engine.judgment) return;
  const results = buildResultsObject2();
  // P2 chart: use charts[p2ChartIndex]
  const p2Chart = session.charts[session.p2ChartIndex];
  if (!p2Chart) return;
  if (scoreWrite2ClaimedForRun) return;
  scoreWrite2ClaimedForRun = true;
  try {
    await api.saveScore({
      profileId: session.profileId,
      songPath: session.currentSong.path,
      stepsType: p2Chart.stepsType,
      difficulty: p2Chart.difficulty,
      meter: p2Chart.meter,
      grade: results.grade,
      dpPercent: results.dpPercent,
      score: Math.max(0, Math.round(results.dpPercent * 10000)),
      maxCombo: results.maxCombo,
      w1: results.w1, w2: results.w2, w3: results.w3,
      w4: results.w4, w5: results.w5, miss: results.miss,
      held: results.held, letGo: results.letGo, minesHit: results.minesHit,
      modifiers: "",
    });
  } catch (err: unknown) {
    logError("Gameplay", "Failed to save P2 score:", err);
  }
}

// P2 score save is triggered by the main engine's onFinish/onFail callbacks

async function loadAndStart() {
  const song = session.currentSong;
  const primaryListIdx = session.hasPlayer1 ? session.p1ChartIndex : session.p2ChartIndex;
  const primaryChart = session.charts[primaryListIdx];
  let chartForLoad = primaryChart ?? session.currentChart;
  let chartIdx = chartForLoad?.chartIndex ?? primaryListIdx;
  logDebug("Gameplay", "loadAndStart:begin", {
    songPath: song?.path,
    playMode: session.playMode,
    hasP1: session.hasPlayer1,
    hasP2: session.hasPlayer2,
    p1ChartIndex: session.p1ChartIndex,
    p2ChartIndex: session.p2ChartIndex,
    chartIdx,
    stepsType: chartForLoad?.stepsType,
    previewFromSecond: session.previewFromSecond,
    previewReturnToEditor: session.previewReturnToEditor,
  });
  if (!song) {
    router.push("/select-music");
    return;
  }

  // Clear save badge from any previous run before loading the new chart.
  session.lastScoreSaved = null;
  session.lastResults2 = null;
  scoreWriteClaimedForRun = false;
  scoreWrite2ClaimedForRun = false;
  resetReplayRecorder();

  // 先停止任何正在播放的预览音频，确保音频引擎干净
  try { await api.audioStop(); } catch { /* ignore */ }

  // 加载背景图
  try {
    const bgPath = await api.getSongAssetPath(song.path, "background");
    bgImagePath.value = await api.readFileBase64(bgPath);
  } catch {
    bgImagePath.value = undefined;
  }

  try {
    const offMs = settings.audioOffsetMs;
    engine.config.audioOffset = Number.isFinite(offMs) ? offMs : 0;
    engine.config.lifeType =
      settings.lifeType === "battery" || settings.lifeType === "survival" ? settings.lifeType : "bar";
    engine.config.batteryLives = Math.max(1, Math.min(99, settings.batteryLives ?? 3));
    engine.config.autoPlay = settings.autoPlay;
    engine.config.expertModeEnabled = settings.expertModeEnabled ?? false;
    engine.config.playbackRate = settings.playbackRate ?? 1;
    engine.config.judgmentStyle = settings.judgmentStyle === "itg" ? "itg" : "ddr";
    engine.config.showOffset = settings.showOffset;
    engine.config.showParticles = settings.showParticles;

    engine.config.coopMode = settings.coopMode;
    engine.config.sessionPlayMode = session.playMode;
    engine.config.requireBothFailedForGameOver = computeRequireBothFailedForGameOver();
    engine.config.playerConfigs[0] = { ...settings.player1Config };
    engine.config.playerConfigs[1] =
      session.playMode === "pump-double"
        ? { ...settings.player1Config }
        : { ...settings.player2Config };

    const p2Chart = session.hasPlayer2 ? session.charts[session.p2ChartIndex] : null;
    const p2ChartIdx = p2Chart?.chartIndex ?? session.p2ChartIndex;

    // Only replace a mistaken narrow (single-lane) pick with a merged routine chart — not e.g. dance-double.
    if (session.playMode === "pump-routine" && chartForLoad && !isRoutineMergedStepsType(chartForLoad.stepsType)) {
      const wrongType = chartForLoad.stepsType;
      const wrongMapped = playModeAndCoopForStepsType(wrongType)?.playMode;
      if (wrongMapped === "pump-single") {
        const fix = session.charts.find((c) => isRoutineMergedStepsType(c.stepsType));
        if (fix) {
          chartForLoad = fix;
          chartIdx = fix.chartIndex;
          logInfo(
            "Gameplay",
            `pump-routine 模式下列表索引曾指向 ${wrongType}，已改用合并型协作谱面 chartIndex=${chartIdx}`,
          );
        }
      }
    }

    if (session.playMode === "pump-double" && chartForLoad && !isPumpDoubleSingleChartStepsType(chartForLoad.stepsType)) {
      const wrongType = chartForLoad.stepsType;
      const fix = session.charts.find((c) => c.stepsType === "pump-double");
      if (fix) {
        chartForLoad = fix;
        chartIdx = fix.chartIndex;
        logInfo(
          "Gameplay",
          `pump-double 模式下列表索引曾指向 ${wrongType}，已改用 pump-double 谱面 chartIndex=${chartIdx}`,
        );
      }
    }

    const mergedFromSingleWideChart =
      isRoutineMergedStepsType(chartForLoad?.stepsType) ||
      isPumpDoubleSingleChartStepsType(chartForLoad?.stepsType);
    if (session.replayMode && chartForLoad) {
      const replayError = validateReplayPayload(
        currentChartFingerprint(song.path, chartForLoad.stepsType, chartForLoad.difficulty, chartForLoad.meter),
      );
      if (replayError) {
        logError("Gameplay", "Replay validation failed", { replayError });
        session.clearReplayContext(replayError);
        router.push("/select-music");
        return;
      }
    }

    // Update P2 HUD info
    if (session.hasPlayer2 && p2Chart) {
      p2Difficulty.value = p2Chart.difficulty ?? "";
      p2Meter.value = String(p2Chart.meter ?? "");
    }

    const chartIndices: number[] = [];
    if (mergedFromSingleWideChart) {
      chartIndices.push(chartIdx);
    } else {
      if (session.hasPlayer1) chartIndices.push(chartIdx);
      if (session.hasPlayer2) chartIndices.push(p2ChartIdx);
    }
    const bundles = await api.getChartPlayPayload(song.path, chartIndices);

    let bundleIdx = 0;
    let p1NoteRows: ChartNoteRow[] = [];
    let timingData: TimingDataResponse = DEFAULT_GAMEPLAY_TIMING;
    let p2NoteRows: ChartNoteRow[] = [];

    if (mergedFromSingleWideChart) {
      const b = bundles[0];
      p1NoteRows = b?.notes ?? [];
      timingData = b?.timing ?? DEFAULT_GAMEPLAY_TIMING;
    } else {
      if (session.hasPlayer1) {
        const b = bundles[bundleIdx];
        p1NoteRows = b?.notes ?? [];
        timingData = b?.timing ?? DEFAULT_GAMEPLAY_TIMING;
        bundleIdx += 1;
      }
      if (session.hasPlayer2) {
        const b = bundles[bundleIdx];
        p2NoteRows = b?.notes ?? [];
        const p2Timing = b?.timing;
        if (!session.hasPlayer1 && p2Timing) timingData = p2Timing;
        bundleIdx += 1;
      }
    }

    logInfo(
      "Gameplay",
      `singleWideChart=${mergedFromSingleWideChart} P1 rows: ${p1NoteRows.length}, P2 rows: ${p2NoteRows.length}`,
    );

    if (p1NoteRows.length === 0 && p2NoteRows.length === 0) {
      logInfo("Gameplay", "No notes found, returning to select-music");
      router.push("/select-music");
      return;
    }

    let mergedRows: ChartNoteRow[];
    if (mergedFromSingleWideChart) {
      mergedRows = p1NoteRows.map((row) => ({
        ...row,
        notes: row.notes.filter((n) => n.track >= 0 && n.track < numTracks),
      }));
      mergedRows.sort((a, b) => a.second - b.second || a.row - b.row);
    } else {
      mergedRows = [];
      for (const row of p1NoteRows) {
        mergedRows.push({
          row: row.row,
          beat: row.beat,
          second: row.second,
          notes: row.notes.filter((n) => n.track < 5),
        });
      }
      for (const row of p2NoteRows) {
        const offsetNotes = row.notes
          .filter((n) => n.track < 5)
          .map((n) => ({ ...n, track: n.track + 5 }));
        const existing = mergedRows.find(
          (r) => Math.abs(r.second - row.second) < 0.0001 && r.row === row.row,
        );
        if (existing) {
          existing.notes.push(...offsetNotes);
        } else {
          mergedRows.push({
            row: row.row,
            beat: row.beat,
            second: row.second,
            notes: offsetNotes,
          });
        }
      }
      mergedRows.sort((a, b) => a.second - b.second || a.row - b.row);
    }

    // Validate merged chart (10 tracks)
    const chartValid = validateChartNotes(mergedRows, 10);
    logInfo(
      "Gameplay",
      `Merged rows: ${mergedRows.length}, valid=${chartValid}, first note at: ${mergedRows[0]?.second ?? "none"}`,
    );
    if (!chartValid) {
      logError("Gameplay", "Invalid merged chart data");
      router.push("/select-music");
      return;
    }

    // 设置 BPM 变化数据 + 完整时间轴（与 Rust `beat_to_second` / `note.second` 一致）
    engine.bpmChanges = timingData.bpms;
    engine.baseBpm = timingData.bpms.length > 0 ? timingData.bpms[0].bpm : 120;
    engine.setChartTiming(timingResponseToChartSlice(timingData));

    const musicPath = await api.getSongMusicPath(song.path);
    const audioOk = await engine.loadAudio(musicPath);
    logInfo("Gameplay", `Audio load: ${audioOk ? "OK" : "FAILED"}, duration=${engine.songDuration}s`);
    // Load merged chart into single engine (10 tracks, double mode)
    engine.loadChart(mergedRows, audioOk ? engine.songDuration : 180);
    if (session.replayMode && session.replayPayload) {
      engine.setReplayInput(session.replayPayload.events, session.replayPayload.startedAtChartSecond);
    } else {
      engine.clearReplayInput();
    }
    logInfo(
      "Gameplay",
      `Merged chart loaded: ${engine.notes.length} notes, engine.state=${engine.state}, lastNoteSecond=${engine.getDebugState().lastNoteSecond}`,
    );

    updateHUD();
    if (isPerPlayerDualSession()) updateHUD2();

    applyGameplayRhythmSfxSettings({
      effectVolume: settings.effectVolume ?? 90,
      metronomeSfxEnabled: settings.metronomeSfxEnabled ?? true,
      metronomeSfxVolume: settings.metronomeSfxVolume ?? 100,
      metronomeSfxStyle: settings.metronomeSfxStyle ?? "bright",
      rhythmSfxEnabled: settings.rhythmSfxEnabled ?? true,
      rhythmSfxVolume: settings.rhythmSfxVolume ?? 100,
      rhythmSfxStyle: settings.rhythmSfxStyle ?? "bright",
    });
    // 同步音量到音频引擎
    await api.audioSetVolume(
      (settings.musicVolume ?? 70) / 100,
      (settings.masterVolume ?? 80) / 100,
    );
    // 设置播放速率
    await api.audioSetRate(p1Config.playbackRate);

    // Check preview mode (started from editor at a specific beat)
    const previewSec = session.previewFromSecond;
    const isEditorPreview = previewSec !== null && session.previewReturnToEditor;
    editorPreviewMode.value = isEditorPreview;
    if (isEditorPreview && previewSec !== null) {
      session.editorPreviewAnchorSecond = previewSec;
    }
    session.previewFromSecond = null; // consume once
    if (!isEditorPreview) {
      session.previewReturnToEditor = false;
      session.editorPreviewAnchorSecond = null;
    }

    if (isEditorPreview) {
      // Preview: skip countdown, start audio from (previewSec - 2s) with no scoring
      const leadInSec = 2.0;
      const dbg = engine.getDebugState();
      const firstRowSec = mergedRows[0]?.second;
      logDebug("Gameplay", "start:editorPreview", { previewSec, leadInSec });
      logInfo("Gameplay", "editorPreview:start", {
        previewSec,
        leadInSec,
        chartTimingOffset: timingData.offset,
        stopsCount: timingData.stops.length,
        delaysCount: timingData.delays.length,
        firstRowSecond: firstRowSec,
        lastNoteSecond: dbg.lastNoteSecond,
        songDuration: dbg.songDuration,
        previewPastLastNote: previewSec! > dbg.lastNoteSecond + 1e-3,
        audioOffsetMs: settings.audioOffsetMs,
        playbackRate: p1Config.playbackRate,
      });
      gameState.value = "playing";
      bgPlaying.value = true;
      await engine.startPlayingFrom(previewSec!, leadInSec);
      startReplaySampling();
      logInfo("Gameplay", "editorPreview:afterStartPlayingFrom", engine.getDebugState());
    } else {
      logDebug("Gameplay", "start:countdown", {
        audioOffsetMs: settings.audioOffsetMs,
        playbackRate: p1Config.playbackRate,
        autoPlay: p1Config.autoPlay,
      });
      // Normal gameplay: 3-2-1-GO countdown
      gameState.value = "countdown";
      countdown.value = 3;
      playCountdown();
      countdownInterval.value = setInterval(() => {
        countdown.value--;
        if (countdown.value === 0) {
          cdText.value = t("gameplay.countdownGo");
          playCountdownGo();
        } else if (countdown.value === -1) {
          if (countdownInterval.value) clearInterval(countdownInterval.value);
          cdText.value = "";
          gameState.value = "playing";
          bgPlaying.value = true;
          engine.startPlaying();
          startReplaySampling();
        }
      }, 700);
    }
  } catch (err: unknown) {
    logError("Gameplay", "Failed to load chart:", err);
    logDebug("Gameplay", "loadAndStart:error", { err });
    // 显示加载失败状态，不静默失败
    gameState.value = "failed";
    resultNavTimer.value = setTimeout(() => router.push("/select-music"), 2000);
  }
}

function validateChartNotes(noteRows: ChartNoteRow[], numTracks: number): boolean {
  if (!Array.isArray(noteRows) || noteRows.length === 0) return false;

  let lastSecond = -1;
  let hasValidNotes = false;
  for (const row of noteRows) {
    if (!isFinite(row.second) || row.second < lastSecond) return false;
    lastSecond = row.second;

    if (!Array.isArray(row.notes)) return false;
    if (row.notes.length === 0) continue; // 跳过空行但继续检查后续行
    hasValidNotes = true;
    for (const note of row.notes) {
      if (note.track < 0 || note.track >= numTracks) return false;
    }
  }
  // 确保至少有一行包含有效音符
  return hasValidNotes;
}

function handleKeyDown(e: KeyboardEvent) {
  if (session.replayMode) return;
  if (shortcutMatches(e, "gameplay.devPanel")) {
    e.preventDefault();
    showDevPanel.value = !showDevPanel.value;
    return;
  }
  if (shortcutMatches(e, "gameplay.pause")) {
    e.preventDefault();
    e.stopPropagation();

    if (showPauseMenu.value) {
      resumeGame();
    } else if (gameState.value === "playing" || gameState.value === "countdown") {
      pauseGame();
    }
    return;
  }

  // Rhythm game key events must not auto-repeat: a held key should only register
  // the initial press so the timing cursor is not mis-advanced by browser repeat events.
  if (e.repeat) return;

  const keyMap = resolveGameplayKeyMap10(settings.gameplayPumpDoubleLanes);
  const col = keyMapLookupTrack(keyMap, e.code, e.key);
  if (col !== undefined) {
    if (showDevPanel.value) {
      logDebug("Gameplay", "input:keydown", {
        code: e.code,
        key: e.key,
        track: col,
        gameState: gameState.value,
        chartTime: engine.currentSecond,
      });
    }
    engine.pressKey(col);
    e.preventDefault();
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (session.replayMode) return;
  const keyMap = resolveGameplayKeyMap10(settings.gameplayPumpDoubleLanes);
  const col = keyMapLookupTrack(keyMap, e.code, e.key);
  if (col !== undefined) {
    if (showDevPanel.value) {
      logDebug("Gameplay", "input:keyup", {
        code: e.code,
        key: e.key,
        track: col,
        gameState: gameState.value,
        chartTime: engine.currentSecond,
      });
    }
    engine.releaseKey(col);
  }
}

function pauseGame() {
  logDebug("Gameplay", "pause", { chartTime: engine.currentSecond, engineState: engine.state });
  engine.pause();
  bgPlaying.value = false;
  gameState.value = "paused";
  showPauseMenu.value = true;
  stopReplaySampling();
}

function resumeGame() {
  logDebug("Gameplay", "resume", { chartTime: engine.currentSecond, engineState: engine.state });
  showPauseMenu.value = false;
  engine.resume();
  bgPlaying.value = true;
  gameState.value = "playing";
  startReplaySampling();
}

function quitGame() {
  logDebug("Gameplay", "quit", { to: session.previewReturnToEditor ? "editor" : "player-options" });
  engine.cleanup();
  stopReplaySampling();
  if (countdownInterval.value) clearInterval(countdownInterval.value);
  if (resultNavTimer.value) { clearTimeout(resultNavTimer.value); resultNavTimer.value = null; }
  const backToEditor = session.previewReturnToEditor;
  if (backToEditor) {
    session.editorWarmResume = true;
  }
  session.previewReturnToEditor = false;
  session.previewFromSecond = null;
  session.editorPreviewAnchorSecond = null;
  session.clearReplayContext();
  router.push(backToEditor ? "/editor" : "/player-options");
}

function quitToSelectMusic() {
  logDebug("Gameplay", "quitToSelectMusic", {
    previewReturnToEditor: session.previewReturnToEditor,
  });
  engine.cleanup();
  stopReplaySampling();
  if (countdownInterval.value) clearInterval(countdownInterval.value);
  if (resultNavTimer.value) { clearTimeout(resultNavTimer.value); resultNavTimer.value = null; }
  if (session.previewReturnToEditor) {
    session.editorWarmResume = true;
    session.previewReturnToEditor = false;
    session.previewFromSecond = null;
    session.editorPreviewAnchorSecond = null;
    session.clearReplayContext();
    router.push("/editor");
    return;
  }
  session.clearReplayContext();
  router.push("/select-music");
}

function updateDevPerfPanel() {
  const fieldPerf = noteFieldRef.value?.getPerfState?.();
  const enginePerf = engine.getDebugState();
  if (!fieldPerf || !enginePerf) return;

  let ipcTotal = 0;
  let ipcTop = "";
  if (import.meta.env.DEV) {
    const snap = getIpcInvokeSnapshot();
    ipcTotal = snap.total;
    ipcTop = Object.entries(snap.byCommand)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
  }

  devPerf.value = {
    qualityLevel: fieldPerf.qualityLevel,
    frameMs: fieldPerf.frameMs,
    particles: fieldPerf.particles,
    driftMs: enginePerf.driftMs,
    simSecond: enginePerf.simulatedSecond,
    audioSync: enginePerf.useAudioSync,
    notes: enginePerf.notesCount,
    ipcTotal,
    ipcTop,
    songDuration: enginePerf.songDuration,
    finishRawAudioEnded: enginePerf.finishRawAudioEnded,
    finishLatchedPastSongEnd: enginePerf.finishLatchedPastSongEnd,
    finishPlaybackEndedLatch: enginePerf.finishPlaybackEndedLatch,
    finishSettleLineSec: enginePerf.finishSettleLineSec,
    finishPendingScoreable: enginePerf.finishPendingScoreable,
    finishPendingHolds: enginePerf.finishPendingHolds,
  };
}

const lifeClass = computed(() => {
  if (lifePercent.value > 60) return "life-high";
  if (lifePercent.value > 30) return "life-mid";
  return "life-low";
});

const p2LifeClass = computed(() => {
  if (p2LifePercent.value > 60) return "life-high";
  if (p2LifePercent.value > 30) return "life-mid";
  return "life-low";
});


  function mountGameplayListeners() {
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp);
    devPanelTimer.value = setInterval(updateDevPerfPanel, 200);
  }

  function unmountGameplay() {
    window.removeEventListener("keydown", handleKeyDown, true);
    window.removeEventListener("keyup", handleKeyUp);
    if (countdownInterval.value) clearInterval(countdownInterval.value);
    if (resultNavTimer.value) clearTimeout(resultNavTimer.value);
    if (devPanelTimer.value) clearInterval(devPanelTimer.value);
    stopReplaySampling();
    engine.cleanup();
    session.clearReplayContext();
    void api.audioSetRate(1.0).catch((e) => logDebug("Optional", "gameplay.unmount.audioSetRate", e));
  }

  return {
    session,
    settings,
    t,
    engine,
    noteFieldRef,
    skinConfig,
    skinConfig2,
    gameState,
    countdown,
    cdText,
    showPauseMenu,
    offsetText,
    lifePercent,
    scoreDisplay,
    comboDisplay,
    lastJudgmentText,
    lastJudgmentColor,
    savingScore,
    devPerf,
    showDevPanel,
    bgVideoPath,
    bgImagePath,
    bgPlaying,
    p2LifePercent,
    p2ScoreDisplay,
    p2ComboDisplay,
    p2Difficulty,
    p2Meter,
    p1OffsetDisplay,
    p2OffsetDisplay,
    lifeClass,
    p2LifeClass,
    loadAndStart,
    mountGameplayListeners,
    unmountGameplay,
    pauseGame,
    resumeGame,
    quitGame,
    quitToSelectMusic,
  };
}
