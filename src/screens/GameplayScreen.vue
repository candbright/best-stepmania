<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import NoteField from "@/components/NoteField.vue";
import BackgroundVideo from "@/components/BackgroundVideo.vue";
import GameplayPauseMenu from "./gameplay/GameplayPauseMenu.vue";
import GameplayResultOverlay from "./gameplay/GameplayResultOverlay.vue";
import { useGameplaySession } from "./gameplay/useGameplaySession";

const {
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
  <div class="gp">
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
        :play-mode="game.playMode"
        :routine-p1-color-id="game.routineP1ColorId"
        :routine-p2-color-id="game.routineP2ColorId"
        :double-panel-gap-px="game.doublePanelGapPx"
        :target-fps="game.targetFps"
      />
    </div>

    <!-- ── HUD：双人时左右分列（仅 UI；谱面位置仍由 panelLayout 居中） ── -->
    <div
      class="hud-stack"
      :class="{
        'solo-p2-life': game.hasPlayer2 && !game.hasPlayer1,
        'hud-stack--dual': game.hasPlayer1 && game.hasPlayer2,
      }"
    >
      <template v-if="game.hasPlayer1 && game.hasPlayer2">
        <div class="hud-dual">
          <div class="hud-side hud-side--p1">
            <div class="hud-life-cluster hud-life-p1">
              <span class="hud-life-who">{{ t('playerOpt.player1') }}</span>
              <div class="hud-life-wrap hud-life-wrap--top">
                <div class="hud-life-track">
                  <div class="hud-life-fill" :style="{ width: lifePercent + '%' }" :class="lifeClass" />
                  <div class="hud-life-shine" />
                </div>
                <div class="hud-life-label">{{ lifePercent }}%</div>
              </div>
            </div>
            <div class="hud-side-meta">
              <div class="hud-song">
                <div class="hud-song-title">{{ game.currentSong?.title ?? '' }}</div>
                <div class="hud-song-sub">
                  {{ game.currentDifficulty }} <span class="hud-meter">{{ game.currentChart?.meter ?? '' }}</span>
                </div>
              </div>
              <div class="hud-score hud-score--p1">
                <div class="hud-score-val">{{ scoreDisplay.toLocaleString() }}</div>
                <div class="hud-score-label">{{ t('gameplay.scoreLabel') }}</div>
                <div class="hud-combo" v-if="comboDisplay > 0">{{ comboDisplay }}x</div>
              </div>
            </div>
          </div>

          <div class="hud-side hud-side--p2">
            <div class="hud-life-cluster hud-life-p2">
              <span class="hud-life-who">{{ t('playerOpt.player2') }}</span>
              <div class="hud-life-wrap hud-life-wrap--top">
                <div class="hud-life-track">
                  <div class="hud-life-fill" :style="{ width: p2LifePercent + '%' }" :class="p2LifeClass" />
                  <div class="hud-life-shine" />
                </div>
                <div class="hud-life-label">{{ p2LifePercent }}%</div>
              </div>
            </div>
            <div class="hud-side-meta">
              <div class="hud-song hud-p2">
                <div class="hud-song-sub">{{ p2Difficulty }} <span class="hud-meter">{{ p2Meter }}</span></div>
              </div>
              <div class="hud-score hud-score--p2">
                <div class="hud-score-val">{{ p2ScoreDisplay.toLocaleString() }}</div>
                <div class="hud-score-label">{{ t('gameplay.scoreLabel') }}</div>
                <div class="hud-combo" v-if="p2ComboDisplay > 0">{{ p2ComboDisplay }}x</div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="hud-solo">
          <div class="hud-side hud-side--p1">
            <div v-if="game.hasPlayer1" class="hud-life-cluster hud-life-p1">
              <span class="hud-life-who">{{ t('playerOpt.player1') }}</span>
              <div class="hud-life-wrap hud-life-wrap--top">
                <div class="hud-life-track">
                  <div class="hud-life-fill" :style="{ width: lifePercent + '%' }" :class="lifeClass" />
                  <div class="hud-life-shine" />
                </div>
                <div class="hud-life-label">{{ lifePercent }}%</div>
              </div>
            </div>

            <div v-if="game.hasPlayer2" class="hud-life-cluster hud-life-p1">
              <span class="hud-life-who">{{ t('playerOpt.player2') }}</span>
              <div class="hud-life-wrap hud-life-wrap--top">
                <div class="hud-life-track">
                  <div class="hud-life-fill" :style="{ width: p2LifePercent + '%' }" :class="p2LifeClass" />
                  <div class="hud-life-shine" />
                </div>
                <div class="hud-life-label">{{ p2LifePercent }}%</div>
              </div>
            </div>

            <div class="hud-side-meta">
              <div class="hud-song">
                <div class="hud-song-title">{{ game.currentSong?.title ?? '' }}</div>
                <div class="hud-song-sub">{{ game.currentDifficulty }} <span class="hud-meter">{{ game.currentChart?.meter ?? '' }}</span></div>
              </div>
              <div class="hud-score hud-score--p1">
                <div class="hud-score-val">{{ scoreDisplay.toLocaleString() }}</div>
                <div class="hud-score-label">{{ t('gameplay.scoreLabel') }}</div>
                <div class="hud-combo" v-if="comboDisplay > 0">{{ comboDisplay }}x</div>
              </div>
            </div>
          </div>

          <!-- Pause button: always available for touch/pointer users -->
          <button class="hud-pause-btn" @click="pauseGame" :aria-label="t('gameplay.paused')">⏸</button>
        </div>
      </template>
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
    </div>

    <!-- Judgment text overlay (DOM layer, centre of screen) -->
    <transition name="fade-quick">
      <div
        v-if="lastJudgmentText"
        class="judgment-overlay"
        :style="{ color: lastJudgmentColor }"
      >{{ lastJudgmentText }}</div>
    </transition>

    <!-- Offset indicator -->
    <transition name="fade-quick">
      <div v-if="offsetText" class="offset-display"
        :class="{ late: offsetText.startsWith('+'), early: offsetText.startsWith('-') }">
        {{ offsetText }}
      </div>
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

.hud-stack {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.45rem 1.2rem 0.5rem;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.55) 0%, transparent 100%);
  pointer-events: none;
}
.hud-stack > * {
  pointer-events: auto;
}

.hud-dual {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
}
.hud-solo {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
}
.hud-solo .hud-life-cluster {
  width: 100%;
  max-width: min(42vw, 22rem);
  flex: 0 1 auto;
}
.hud-solo .hud-side-meta {
  max-width: min(42vw, 22rem);
}
.hud-side {
  flex: 0 1 min(48vw, 24rem);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}
.hud-side--p1 {
  align-items: flex-start;
}
.hud-side--p2 {
  align-items: flex-end;
  text-align: right;
}
.hud-stack--dual .hud-life-cluster {
  width: 100%;
  max-width: min(42vw, 22rem);
  flex: 0 1 auto;
}
.hud-side-meta {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 100%;
  max-width: min(42vw, 22rem);
}
.hud-side--p2 .hud-side-meta {
  align-items: flex-end;
}
.hud-stack--dual .hud-song {
  max-width: 100%;
}
.hud-score--p1 {
  text-align: left;
  align-self: flex-start;
}
.hud-score--p2 {
  text-align: right;
  align-self: flex-end;
}

.hud-life-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
}
.hud-stack.solo-p2-life .hud-life-row {
  justify-content: flex-end;
}

.hud-life-cluster {
  flex: 0 1 min(42vw, 20rem);
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 8rem;
}
.hud-life-p2 {
  flex-direction: row-reverse;
  text-align: right;
}
.hud-life-p2 .hud-life-label {
  text-align: left;
}
.hud-life-who {
  flex: 0 0 auto;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.38);
  text-transform: uppercase;
  max-width: 4.2rem;
  line-height: 1.15;
}
.hud-life-p1 .hud-life-who {
  color: color-mix(in srgb, var(--text-color) 55%, transparent);
}
.hud-life-p2 .hud-life-who {
  color: #80deea;
}

.hud-top {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0;
}
.hud-top-spacer {
  flex: 1;
  min-width: 0;
}
.hud-song {
  flex: 0 0 auto; max-width: 220px; overflow: hidden;
}
.hud-song-title {
  font-size: 0.82rem; font-weight: 700; color: color-mix(in srgb, var(--text-color) 75%, transparent);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  letter-spacing: 0.02em;
}
.hud-song-sub {
  font-size: 0.68rem; color: var(--text-subtle);
  text-transform: uppercase; letter-spacing: 0.08em;
}
.hud-meter {
  color: var(--accent-secondary); font-weight: 700; margin-left: 0.25em;
}
.hud-life-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.hud-life-wrap--top {
  flex: 1;
}
.hud-life-track {
  flex: 1; height: 5px; background: rgba(255,255,255,0.06);
  border-radius: 3px; overflow: hidden; position: relative;
}
.hud-life-fill {
  height: 100%; border-radius: 3px;
  transition: width 0.15s ease, background 0.3s ease;
}
.hud-life-fill.life-high {
  background: linear-gradient(90deg, #00e676, #69f0ae);
}
.hud-life-fill.life-mid {
  background: linear-gradient(90deg, #ffab00, #ffd740);
}
.hud-life-fill.life-low {
  background: linear-gradient(90deg, #ff1744, #ff5252);
  animation: lifePulse 0.5s ease infinite;
}
@keyframes lifePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
.hud-life-shine {
  position: absolute; top: 0; left: 0; right: 0; height: 50%;
  background: linear-gradient(to bottom, rgba(255,255,255,0.1), transparent);
  border-radius: 3px 3px 0 0; pointer-events: none;
}
.hud-life-label {
  font-size: 0.68rem; font-weight: 700; color: var(--text-muted);
  font-variant-numeric: tabular-nums; min-width: 2.2em; text-align: right;
}
.hud-score {
  flex: 0 0 auto; text-align: right;
}
.hud-score-val {
  font-size: 1.25rem; font-weight: 900; font-family: 'Orbitron', sans-serif;
  color: color-mix(in srgb, var(--text-color) 85%, transparent); font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.hud-score-label {
  font-size: 0.5rem; color: var(--text-subtle);
  letter-spacing: 0.25em; text-transform: uppercase;
}

.hud-p2 .hud-song-title {
  color: #80deea;
}

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

/* ── new HUD elements ─────────────────────────────── */
.hud-combo {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.7rem; font-weight: 700;
  color: var(--accent-color, #00e5ff);
  opacity: 0.9;
  margin-top: 0.1rem;
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
.hud-pause-btn {
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.55);
  font-size: 1rem;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  line-height: 1;
  pointer-events: auto;
}
.hud-pause-btn:hover { color: rgba(255,255,255,0.9); }

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
</style>
