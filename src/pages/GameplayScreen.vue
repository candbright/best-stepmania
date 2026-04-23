<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { NoteField } from "@/widgets";
import { BackgroundVideo } from "@/shared/layout";
import GameplayPauseMenu from "./gameplay/GameplayPauseMenu.vue";
import GameplayResultOverlay from "./gameplay/GameplayResultOverlay.vue";
import GameplayHud from "./gameplay/GameplayHud.vue";
import { useGameplaySession } from "./gameplay/useGameplaySession";

const {
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
} = useGameplaySession();

onMounted(() => {
  mountGameplayListeners();
  void loadAndStart();
});

onUnmounted(() => {
  unmountGameplay();
});
</script>

<template>
  <div class="gp" :class="{ 'gp--pump-double': session.playMode === 'pump-double' }">
    <BackgroundVideo
      :video-path="bgVideoPath"
      :bg-image-path="bgImagePath"
      :playing="bgPlaying"
      :dim-level="0.5"
    />

    <!-- Note field fills the screen -->
    <div class="game-area">
      <NoteField
        ref="noteFieldRef"
        :engine="engine"
        :skin-config="skinConfig"
        :skin-config2="skinConfig2"
        :play-mode="session.playMode"
        :routine-p1-color-id="session.routineP1ColorId"
        :routine-p2-color-id="session.routineP2ColorId"
        :double-panel-gap-px="settings.doublePanelGapPx"
        :target-fps="settings.targetFps"
        :ui-scale="settings.uiScale"
      />
    </div>

    <GameplayHud
      :has-player1="session.hasPlayer1"
      :has-player2="session.hasPlayer2"
      :play-mode="session.playMode"
      :song-title="session.currentSong?.title ?? ''"
      :current-difficulty="session.currentDifficulty"
      :current-chart-meter="session.currentChart?.meter ?? ''"
      :life-percent="lifePercent"
      :life-class="lifeClass"
      :p2-life-percent="p2LifePercent"
      :p2-life-class="p2LifeClass"
      :score-display="scoreDisplay"
      :combo-display="comboDisplay"
      :p2-difficulty="p2Difficulty"
      :p2-meter="p2Meter"
      :p2-score-display="p2ScoreDisplay"
      :p2-combo-display="p2ComboDisplay"
      :p1-offset-display="p1OffsetDisplay"
      :p2-offset-display="p2OffsetDisplay"
      @pause="pauseGame"
    />
    <div v-if="session.replayMode" class="replay-badge">
      REPLAY MODE - {{ session.replayAutoplayUiLabel ?? "Watching" }}
    </div>

    <!-- Dev Performance Panel (F3 to toggle) -->
    <div v-if="showDevPanel" class="dev-perf-panel">
      <div>{{ t('gameplay.dev.fps') }}: {{ (1000 / Math.max(devPerf.frameMs, 0.1)).toFixed(0) }}</div>
      <div>{{ t('gameplay.dev.frame') }}: {{ devPerf.frameMs.toFixed(2) }}ms</div>
      <div>{{ t('gameplay.dev.quality') }}: {{ devPerf.qualityLevel }}</div>
      <div>{{ t('gameplay.dev.drift') }}: {{ devPerf.driftMs.toFixed(2) }}ms</div>
      <div>{{ t('gameplay.dev.audioSync') }}: {{ devPerf.audioSync ? t('gameplay.dev.on') : t('gameplay.dev.off') }}</div>
      <div>{{ t('gameplay.dev.particles') }}: {{ devPerf.particles }}</div>
      <div>{{ t('gameplay.dev.notes') }}: {{ devPerf.notes }}</div>
      <div v-if="devPerf.ipcTotal > 0">{{ t('gameplay.dev.ipcTotal') }}: {{ devPerf.ipcTotal }}</div>
      <div v-if="devPerf.ipcTop">{{ t('gameplay.dev.ipcTop') }}: {{ devPerf.ipcTop }}</div>
      <div>{{ t('gameplay.dev.songDuration') }}: {{ devPerf.songDuration.toFixed(2) }}s</div>
      <div>{{ t('gameplay.dev.finishRaw') }}: {{ t(devPerf.finishRawAudioEnded ? 'gameplay.dev.yes' : 'gameplay.dev.no') }} · {{ t('gameplay.dev.finishLatch') }}: {{ t(devPerf.finishLatchedPastSongEnd ? 'gameplay.dev.yes' : 'gameplay.dev.no') }} · {{ t('gameplay.dev.finishPlaybackEof') }}: {{ t(devPerf.finishPlaybackEndedLatch ? 'gameplay.dev.yes' : 'gameplay.dev.no') }}</div>
      <div>{{ t('gameplay.dev.finishSettle') }}: {{ devPerf.finishSettleLineSec.toFixed(2) }}s · {{ t('gameplay.dev.finishPending') }}: {{ t(devPerf.finishPendingScoreable ? 'gameplay.dev.yes' : 'gameplay.dev.no') }}/{{ t(devPerf.finishPendingHolds ? 'gameplay.dev.yes' : 'gameplay.dev.no') }}</div>
    </div>

    <!-- Judgment text overlay (DOM layer, centre of screen) -->
    <transition name="fade-quick">
      <div
        v-if="session.hasPlayer1 && session.hasPlayer2 && lastJudgmentText"
        class="judgment-overlay"
        :style="{ color: lastJudgmentColor }"
      >{{ lastJudgmentText }}</div>
    </transition>

    <!-- ── LOADING ── -->
    <transition name="fade">
      <div v-if="gameState === 'loading'" class="overlay-loading">
        <div class="loading-spinner">⟳</div>
        <div class="loading-label">{{ t('gameplay.loading') }}</div>
      </div>
    </transition>

    <!-- ── COUNTDOWN ── -->
    <transition name="fade">
      <div v-if="gameState === 'countdown'" class="overlay-countdown">
        <div class="cd-ring" />
        <div class="cd-num">{{ cdText || countdown }}</div>
      </div>
    </transition>

    <!-- ── RESULT OVERLAYS ── -->
    <GameplayResultOverlay
      :gameState="gameState"
      :savingScore="savingScore"
    />

    <!-- ── PAUSE ── -->
    <GameplayPauseMenu
      :show="showPauseMenu"
      @resume="resumeGame"
      @quit="quitGame"
      @quitToSelect="quitToSelectMusic"
    />
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@400;600;700&display=swap');

.gp {
  width: 100%; height: 100%; position: relative;
  background: #08080f; overflow: hidden;
  font-family: 'Rajdhani', sans-serif;
}
.game-area { position: absolute; inset: 0; }

.offset-display {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, 50px);
  font-size: 0.75rem; font-weight: 600; font-variant-numeric: tabular-nums;
  z-index: 15; pointer-events: none;
  animation: fadeOut 0.8s ease forwards;
}
.offset-display.early { color: #40c4ff; }
.offset-display.late { color: #ff6e40; }
@keyframes fadeOut { 0% { opacity: 1; } 100% { opacity: 0; } }

/* ── COUNTDOWN overlay ── */
.overlay-loading {
  position: absolute; inset: 0; z-index: 40;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  background: var(--overlay-bg, rgba(0, 0, 0, 0.75));
  pointer-events: none;
}
.loading-spinner {
  font-size: 3rem;
  color: var(--primary-color, rgba(255, 255, 255, 0.7));
  animation: spin 1.2s linear infinite;
  margin-bottom: 0.75rem;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.loading-label {
  font-family: 'Orbitron', sans-serif;
  font-size: 1rem;
  letter-spacing: 0.2em;
  color: var(--text-muted);
}

.overlay-countdown {
  position: absolute; inset: 0; z-index: 30;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.cd-ring {
  position: absolute;
  width: 200px; height: 200px;
  border-radius: 50%;
  border: 3px solid color-mix(in srgb, var(--accent-secondary) 60%, transparent);
  animation: cdRingExpand 0.7s ease-out forwards;
}
.cd-num {
  position: relative; z-index: 1;
  font-family: 'Orbitron', sans-serif;
  font-size: 7rem; font-weight: 900;
  color: var(--text-color);
  text-shadow: 0 0 60px color-mix(in srgb, var(--accent-secondary) 60%, transparent), 0 0 20px color-mix(in srgb, var(--text-color) 40%, transparent);
  animation: cdNumPop 0.7s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
@keyframes cdRingExpand {
  0%   { transform: scale(0.6); opacity: 1; }
  100% { transform: scale(2.2); opacity: 0; }
}
@keyframes cdNumPop {
  0%   { transform: scale(2); opacity: 0; }
  35%  { transform: scale(0.95); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.countdown-overlay {
  position: absolute; inset: 0; z-index: 30;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.5);
}
.countdown-number {
  font-size: 6rem; font-weight: 900; color: var(--text-color);
  animation: countPulse 0.7s ease infinite;
}
@keyframes countPulse { 0% { transform: scale(1.2); opacity: 0.5; } 50% { transform: scale(1); opacity: 1; } 100% { transform: scale(0.9); opacity: 0.5; } }

.finish-overlay {
  position: absolute; inset: 0; z-index: 30;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}
.finish-text {
  font-size: 2.5rem; font-weight: 900; color: #00e676;
  text-shadow: 0 0 40px rgba(0,230,118,0.5);
  animation: finishPulse 1s ease infinite;
}
.saving-hint {
  font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-top: 0.5rem;
}
@keyframes finishPulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }

.fail-overlay {
  position: absolute; inset: 0; z-index: 30;
  display: flex; align-items: center; justify-content: center;
  background: rgba(180, 0, 0, 0.3);
}
.fail-text {
  font-size: 3rem; font-weight: 900; color: #ff1744;
  text-shadow: 0 0 40px rgba(255,23,68,0.5);
  animation: failPulse 1s ease infinite;
}
@keyframes failPulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }

.pause-overlay {
  position: absolute; inset: 0; z-index: 40;
  background: rgba(0,0,0,0.7); display: flex;
  align-items: center; justify-content: center;
}

.judgment-overlay {
  position: absolute;
  left: 50%; top: 42%;
  transform: translate(-50%, -50%);
  z-index: 25;
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(1.1rem, 3vw, 1.8rem);
  font-weight: 900;
  text-shadow: 0 0 20px currentColor;
  pointer-events: none;
  white-space: nowrap;
}
.gp--pump-double .judgment-overlay {
  top: 36%;
}

.dev-perf-panel {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 45;
  min-width: 170px;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-color) 78%, #000);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--text-color) 90%, transparent);
}
.replay-badge {
  position: absolute;
  right: 12px;
  top: 12px;
  z-index: 44;
  padding: 0.28rem 0.7rem;
  border-radius: 999px;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  border: 1px solid color-mix(in srgb, #00e5ff 70%, var(--border-color));
  background: color-mix(in srgb, #00e5ff 15%, var(--bg-color));
}
</style>
