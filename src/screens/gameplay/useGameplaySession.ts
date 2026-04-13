import { ref, shallowRef, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "@/stores/game";
import { GameEngine } from "@/engine/GameEngine";
import { createTauriAudioPort } from "@/engine";
import { keyMapLookupTrack, resolveGameplayKeyMap10 } from "@/engine/keyBindings";
import { JUDGMENT_COLORS, getJudgmentName } from "@/engine/judgmentDisplay";
import type { JudgmentEvent, GameConfig, ChartNoteRow, NoteFieldExposed } from "@/engine/types";
import * as api from "@/utils/api";
import type { TimingDataResponse } from "@/api/editor";
import type { ChartTimingSlice } from "@/engine/chartTiming";
import { useNoteSkin } from "@/stores/noteskin";
import {
  playJudgment,
  playMineHit,
  playCountdown,
  playCountdownGo,
  setGameplaySfxVolume,
  playBeatLine,
  setGameplaySfxEnabled,
  setRhythmSfxGain,
  setRhythmSfxStyle,
} from "@/utils/sfx";
import { devWarn, logOptionalRejection } from "@/utils/devLog";
import { useI18n } from "@/i18n";
import { playModeAndCoopForStepsType } from "@/utils/chartPlayMode";

export function useGameplaySession() {
const router = useRouter();
const game = useGameStore();
const { t } = useI18n();

const noteFieldRef = shallowRef<NoteFieldExposed | null>(null);
const gameState = ref<string>("loading");
const countdown = ref(3);
const cdText = ref("");
const showPauseMenu = ref(false);
const lastJudgmentText = ref("");
const lastJudgmentColor = ref("");
const offsetText = ref("");
const lifePercent = ref(50);
const scoreDisplay = ref(0);
const comboDisplay = ref(0);
const savingScore = ref(false);
const devPerf = ref({
  qualityLevel: "high",
  frameMs: 0,
  particles: 0,
  driftMs: 0,
  simSecond: 0,
  audioSync: false,
  notes: 0,
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

const p1Config: GameConfig = {
  audioOffset: game.audioOffsetMs,
  judgmentStyle: (game.judgmentStyle === "itg" ? "itg" : "ddr") as "ddr" | "itg",
  showOffset: game.showOffset,
  lifeType: (game.lifeType as "bar" | "battery" | "survival") || "bar",
  autoPlay: game.autoPlay,
  numTracks,
  playbackRate: game.playbackRate ?? 1,
  batteryLives: game.batteryLives ?? 3,
  showParticles: game.showParticles,
  coopMode: game.coopMode,
  playerConfigs: [
    { ...game.player1Config },
    { ...game.player2Config },
  ],
};

// Single audio port and engine for both players
const sharedAudioPort = createTauriAudioPort();
const engine = new GameEngine(p1Config, sharedAudioPort);

// ── P2 HUD state ──────────────────────────────
const p2LifePercent = ref(50);
const p2ScoreDisplay = ref(0);
const p2ComboDisplay = ref(0);
const p2Difficulty = ref("");
const p2Meter = ref("");

const { loadSkin } = useNoteSkin();
const skinConfig = ref<Awaited<ReturnType<typeof loadSkin>> | null>(null);
const skinConfig2 = ref<Awaited<ReturnType<typeof loadSkin>> | null>(null);

async function loadSkinForGame() {
  try {
    skinConfig.value = await loadSkin(game.player1Config.noteskin);
    const p2Noteskin = game.player2Config?.noteskin ?? game.player1Config.noteskin;
    skinConfig2.value = await loadSkin(p2Noteskin);
  } catch {
    skinConfig.value = null;
    skinConfig2.value = null;
  }
}

watch(() => [game.player1Config.noteskin, game.player2Config?.noteskin] as const, loadSkinForGame, { immediate: true });

function onJudgment(evt: JudgmentEvent) {
  const name = getJudgmentName(evt.judgment, p1Config.judgmentStyle);
  const color = JUDGMENT_COLORS[evt.judgment];
  lastJudgmentText.value = name;
  lastJudgmentColor.value = color;

  if (p1Config.showOffset && evt.judgment !== "Miss") {
    const ms = Math.round(evt.offset * 1000);
    offsetText.value = (ms > 0 ? "+" : "") + ms + "ms";
    setTimeout(() => { offsetText.value = ""; }, 800);
  }

  playJudgment(evt.judgment);
  noteFieldRef.value?.showJudgment(name, color, evt.track);
  updateHUD();
  if (game.hasPlayer1 && game.hasPlayer2) updateHUD2();
}

function onMiss(evt: JudgmentEvent) {
  onJudgment(evt);
}

function updateHUD() {
  if (!engine.judgment) return;
  const s = engine.judgment.score;
  comboDisplay.value = s.combo;
  lifePercent.value = Math.round(s.life * 100);
  scoreDisplay.value = Math.max(0, Math.round(engine.judgment.dpPercent() * 100 * 100));
}

function updateHUD2() {
  if (!engine.judgment) return;
  const s = engine.judgment.player2Score;
  p2ComboDisplay.value = s.combo;
  p2LifePercent.value = Math.round(s.life * 100);
  const dp = s.maxPossibleDp > 0 ? s.dancePoints / s.maxPossibleDp : 1;
  p2ScoreDisplay.value = Math.max(0, Math.round(dp * 100 * 100));
}

function buildResultsObject() {
  const j = engine.judgment;
  if (!j) {
    throw new Error("buildResultsObject: judgment is not initialized");
  }
  const s = j.score;
  return {
    grade: j.grade(),
    dpPercent: j.dpPercent(),
    maxCombo: s.maxCombo,
    w1: s.w1, w2: s.w2, w3: s.w3, w4: s.w4, w5: s.w5, miss: s.miss,
    held: s.held, letGo: s.letGo, minesHit: s.minesHit,
    fullCombo: j.isFullCombo(),
    offsets: j.events.map((e) => e.offset),
  };
}

async function saveScoreToProfile() {
  if (game.autoPlay) return;
  if (!game.profileId || !game.currentSong || !game.currentChart) return;
  if (!engine.judgment) return;

  const results = buildResultsObject();
  const modCfg = game.hasPlayer1 ? game.player1Config : game.player2Config;
  const modParts: string[] = [];
  modParts.push(modCfg.speedMod);
  if (modCfg.reverse) modParts.push("Reverse");
  if (modCfg.mirror) modParts.push("Mirror");
  if (modCfg.sudden) modParts.push("Sudden");
  if (modCfg.hidden) modParts.push("Hidden");
  if (modCfg.rotate) modParts.push("Rotate");

  try {
    savingScore.value = true;
    await api.saveScore({
      profileId: game.profileId,
      songPath: game.currentSong.path,
      stepsType: game.currentChart.stepsType,
      difficulty: game.currentChart.difficulty,
      meter: game.currentChart.meter,
      grade: results.grade,
      dpPercent: results.dpPercent,
      score: Math.max(0, Math.round(results.dpPercent * 10000)),
      maxCombo: results.maxCombo,
      w1: results.w1, w2: results.w2, w3: results.w3,
      w4: results.w4, w5: results.w5, miss: results.miss,
      held: results.held, letGo: results.letGo, minesHit: results.minesHit,
      modifiers: modParts.join(", "),
    });
    game.lastScoreSaved = true;
  } catch (err: unknown) {
    console.error("Failed to save score:", err);
    game.lastScoreSaved = false;
  } finally {
    savingScore.value = false;
  }
}

engine.callbacks = {
  onJudgment,
  onMiss,
  onComboBreak: () => { comboDisplay.value = 0; },
  onMineHit: () => { playMineHit(); updateHUD(); },
  onBeatLineApproach: (beat: number) => { playBeatLine(); void beat; },
  onFinish: async () => {
    gameState.value = "finished";
    game.lastResults = buildResultsObject();
    game.lastResults2 = game.hasPlayer1 && game.hasPlayer2 ? buildResultsObject2() : null;
    await saveScoreToProfile();
    if (game.hasPlayer1 && game.hasPlayer2) await saveScoreToProfile2();
    resultNavTimer.value = setTimeout(() => router.push("/evaluation"), 1500);
  },
  onFail: async () => {
    gameState.value = "failed";
    game.lastResults = buildResultsObject();
    game.lastResults2 = game.hasPlayer1 && game.hasPlayer2 ? buildResultsObject2() : null;
    await saveScoreToProfile();
    if (game.hasPlayer1 && game.hasPlayer2) await saveScoreToProfile2();
    resultNavTimer.value = setTimeout(() => router.push("/evaluation"), 2000);
  },
};

// P2 results helper (uses main engine's player2Score)
function buildResultsObject2() {
  const j = engine.judgment;
  if (!j) {
    throw new Error("buildResultsObject2: judgment is not initialized");
  }
  const s = j.player2Score;
  return {
    grade: j.gradeForPlayer(2),
    dpPercent: j.dpPercentForPlayer(2),
    maxCombo: s.maxCombo,
    w1: s.w1, w2: s.w2, w3: s.w3, w4: s.w4, w5: s.w5, miss: s.miss,
    held: s.held, letGo: s.letGo, minesHit: s.minesHit,
    fullCombo: s.miss === 0 && s.w5 === 0,
    offsets: j.events.filter(e => e.player === 2).map(e => e.offset),
  };
}

async function saveScoreToProfile2() {
  if (game.autoPlay) return;
  if (!game.profileId || !game.currentSong) return;
  if (!engine.judgment) return;
  const results = buildResultsObject2();
  // P2 chart: use charts[p2ChartIndex]
  const p2Chart = game.charts[game.p2ChartIndex];
  if (!p2Chart) return;
  try {
    await api.saveScore({
      profileId: game.profileId,
      songPath: game.currentSong.path,
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
    console.error("[Gameplay] Failed to save P2 score:", err);
  }
}

// P2 score save is triggered by the main engine's onFinish/onFail callbacks

async function loadAndStart() {
  const song = game.currentSong;
  const primaryListIdx = game.hasPlayer1 ? game.p1ChartIndex : game.p2ChartIndex;
  const primaryChart = game.charts[primaryListIdx];
  let chartForLoad = primaryChart ?? game.currentChart;
  let chartIdx = chartForLoad?.chartIndex ?? primaryListIdx;
  if (!song) {
    router.push("/select-music");
    return;
  }

  // Clear save badge from any previous run before loading the new chart.
  game.lastScoreSaved = null;
  game.lastResults2 = null;

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
    engine.config.coopMode = game.coopMode;
    engine.config.playerConfigs[0] = { ...game.player1Config };
    engine.config.playerConfigs[1] = { ...game.player2Config };

    const p2Chart = game.hasPlayer2 ? game.charts[game.p2ChartIndex] : null;
    const p2ChartIdx = p2Chart?.chartIndex ?? game.p2ChartIndex;

    // Only replace a mistaken narrow (single-lane) pick with a merged routine chart — not e.g. dance-double.
    if (game.playMode === "pump-routine" && chartForLoad && !isRoutineMergedStepsType(chartForLoad.stepsType)) {
      const wrongType = chartForLoad.stepsType;
      const wrongMapped = playModeAndCoopForStepsType(wrongType)?.playMode;
      if (wrongMapped === "pump-single") {
        const fix = game.charts.find((c) => isRoutineMergedStepsType(c.stepsType));
        if (fix) {
          chartForLoad = fix;
          chartIdx = fix.chartIndex;
          devWarn(
            `[Gameplay] pump-routine 模式下列表索引曾指向 ${wrongType}，已改用合并型协作谱面 chartIndex=${chartIdx}`,
          );
        }
      }
    }

    if (game.playMode === "pump-double" && chartForLoad && !isPumpDoubleSingleChartStepsType(chartForLoad.stepsType)) {
      const wrongType = chartForLoad.stepsType;
      const fix = game.charts.find((c) => c.stepsType === "pump-double");
      if (fix) {
        chartForLoad = fix;
        chartIdx = fix.chartIndex;
        devWarn(
          `[Gameplay] pump-double 模式下列表索引曾指向 ${wrongType}，已改用 pump-double 谱面 chartIndex=${chartIdx}`,
        );
      }
    }

    const mergedFromSingleWideChart =
      isRoutineMergedStepsType(chartForLoad?.stepsType) ||
      isPumpDoubleSingleChartStepsType(chartForLoad?.stepsType);

    // Update P2 HUD info
    if (game.hasPlayer2 && p2Chart) {
      p2Difficulty.value = p2Chart.difficulty ?? "";
      p2Meter.value = String(p2Chart.meter ?? "");
    }

    const fetchPromises: Promise<unknown>[] = [];
    if (mergedFromSingleWideChart) {
      fetchPromises.push(
        api.getChartNotes(song.path, chartIdx),
        api.getBpmChanges(song.path, chartIdx),
      );
    } else {
      if (game.hasPlayer1) {
        fetchPromises.push(
          api.getChartNotes(song.path, chartIdx),
          api.getBpmChanges(song.path, chartIdx),
        );
      }
      if (game.hasPlayer2) {
        fetchPromises.push(
          api.getChartNotes(song.path, p2ChartIdx),
          api.getBpmChanges(song.path, p2ChartIdx),
        );
      }
    }
    const fetchResults = await Promise.all(fetchPromises);

    let resultIdx = 0;
    let p1NoteRows: ChartNoteRow[] = [];
    let timingData: TimingDataResponse = DEFAULT_GAMEPLAY_TIMING;
    let p2NoteRows: ChartNoteRow[] = [];

    if (mergedFromSingleWideChart) {
      p1NoteRows = fetchResults[resultIdx++] as ChartNoteRow[];
      timingData = fetchResults[resultIdx++] as TimingDataResponse;
    } else {
      if (game.hasPlayer1) {
        p1NoteRows = fetchResults[resultIdx++] as ChartNoteRow[];
        timingData = fetchResults[resultIdx++] as TimingDataResponse;
      }
      if (game.hasPlayer2) {
        p2NoteRows = fetchResults[resultIdx++] as ChartNoteRow[];
        const p2Timing = fetchResults[resultIdx++] as TimingDataResponse;
        if (!game.hasPlayer1) timingData = p2Timing;
      }
    }

    devWarn(
      `[Gameplay] singleWideChart=${mergedFromSingleWideChart} P1 rows: ${p1NoteRows.length}, P2 rows: ${p2NoteRows.length}`,
    );

    if (p1NoteRows.length === 0 && p2NoteRows.length === 0) {
      devWarn("[Gameplay] No notes found, returning to select-music");
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
    devWarn(
      `[Gameplay] Merged rows: ${mergedRows.length}, valid=${chartValid}, first note at: ${mergedRows[0]?.second ?? "none"}`,
    );
    if (!chartValid) {
      console.error("[Gameplay] Invalid merged chart data");
      router.push("/select-music");
      return;
    }

    // 设置 BPM 变化数据 + 完整时间轴（与 Rust `beat_to_second` / `note.second` 一致）
    engine.bpmChanges = timingData.bpms;
    engine.baseBpm = timingData.bpms.length > 0 ? timingData.bpms[0].bpm : 120;
    engine.setChartTiming(timingResponseToChartSlice(timingData));

    const musicPath = await api.getSongMusicPath(song.path);
    const audioOk = await engine.loadAudio(musicPath);
    devWarn(`[Gameplay] Audio load: ${audioOk ? "OK" : "FAILED"}, duration=${engine.songDuration}s`);
    // Load merged chart into single engine (10 tracks, double mode)
    engine.loadChart(mergedRows, audioOk ? engine.songDuration : 180);
    devWarn(`[Gameplay] Merged chart loaded: ${engine.notes.length} notes, engine.state=${engine.state}, lastNoteSecond=${engine.getDebugState().lastNoteSecond}`);

    setGameplaySfxVolume((game.effectVolume ?? 90) / 100);
    setGameplaySfxEnabled(game.rhythmSfxEnabled ?? true);
    setRhythmSfxGain((game.rhythmSfxVolume ?? 100) / 100);
    setRhythmSfxStyle(game.rhythmSfxStyle ?? "bright");
    // 同步音量到音频引擎
    await api.audioSetVolume(
      (game.musicVolume ?? 70) / 100,
      (game.masterVolume ?? 80) / 100,
    );
    // 设置播放速率
    await api.audioSetRate(p1Config.playbackRate);

    // Check preview mode (started from editor at a specific beat)
    const previewSec = game.previewFromSecond;
    const isEditorPreview = previewSec !== null && game.previewReturnToEditor;
    game.previewFromSecond = null; // consume once
    if (!isEditorPreview) game.previewReturnToEditor = false;

    if (previewSec !== null) {
      // Preview: skip countdown, start audio from (previewSec - 2s) with no scoring
      gameState.value = "playing";
      bgPlaying.value = true;
      await engine.startPlayingFrom(previewSec, 2.0);
    } else {
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
        }
      }, 700);
    }
  } catch (err: unknown) {
    console.error("[Gameplay] Failed to load chart:", err);
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
  if (game.shortcutMatches(e, "gameplay.devPanel")) {
    e.preventDefault();
    showDevPanel.value = !showDevPanel.value;
    return;
  }
  if (game.shortcutMatches(e, "gameplay.pause")) {
    e.preventDefault();
    e.stopPropagation();

    if (showPauseMenu.value) {
      resumeGame();
    } else if (gameState.value === "playing" || gameState.value === "countdown") {
      pauseGame();
    }
    return;
  }

  const keyMap = resolveGameplayKeyMap10(game.gameplayPumpDoubleLanes);
  const col = keyMapLookupTrack(keyMap, e.code, e.key);
  if (col !== undefined) {
    engine.pressKey(col);
    e.preventDefault();
  }
}

function handleKeyUp(e: KeyboardEvent) {
  const keyMap = resolveGameplayKeyMap10(game.gameplayPumpDoubleLanes);
  const col = keyMapLookupTrack(keyMap, e.code, e.key);
  if (col !== undefined) {
    engine.releaseKey(col);
  }
}

function pauseGame() {
  engine.pause();
  bgPlaying.value = false;
  gameState.value = "paused";
  showPauseMenu.value = true;
}

function resumeGame() {
  showPauseMenu.value = false;
  engine.resume();
  bgPlaying.value = true;
  gameState.value = "playing";
}

function quitGame() {
  engine.cleanup();
  if (countdownInterval.value) clearInterval(countdownInterval.value);
  if (resultNavTimer.value) { clearTimeout(resultNavTimer.value); resultNavTimer.value = null; }
  const backToEditor = game.previewReturnToEditor;
  if (backToEditor) {
    game.editorWarmResume = true;
  }
  game.previewReturnToEditor = false;
  game.previewFromSecond = null;
  router.push(backToEditor ? "/editor" : "/player-options");
}

function quitToSelectMusic() {
  engine.cleanup();
  if (countdownInterval.value) clearInterval(countdownInterval.value);
  if (resultNavTimer.value) { clearTimeout(resultNavTimer.value); resultNavTimer.value = null; }
  if (game.previewReturnToEditor) {
    game.editorWarmResume = true;
    game.previewReturnToEditor = false;
    game.previewFromSecond = null;
    router.push("/editor");
    return;
  }
  router.push("/select-music");
}

function updateDevPerfPanel() {
  const fieldPerf = noteFieldRef.value?.getPerfState?.();
  const enginePerf = engine.getDebugState();
  if (!fieldPerf || !enginePerf) return;

  devPerf.value = {
    qualityLevel: fieldPerf.qualityLevel,
    frameMs: fieldPerf.frameMs,
    particles: fieldPerf.particles,
    driftMs: enginePerf.driftMs,
    simSecond: enginePerf.simulatedSecond,
    audioSync: enginePerf.useAudioSync,
    notes: enginePerf.notesCount,
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
    engine.cleanup();
    void api.audioSetRate(1.0).catch((e) => logOptionalRejection("gameplay.unmount.audioSetRate", e));
  }

  return {
    game,
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
