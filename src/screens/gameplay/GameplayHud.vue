<script setup lang="ts">
import { useI18n } from "@/i18n";
import HudSongTitle from "./HudSongTitle.vue";
import HudLifeCluster from "./HudLifeCluster.vue";
import HudSongMeta from "./HudSongMeta.vue";
import HudScorePanel from "./HudScorePanel.vue";

const { t } = useI18n();

defineProps<{
  hasPlayer1: boolean;
  hasPlayer2: boolean;
  playMode: string;
  songTitle: string;
  currentDifficulty: string;
  currentChartMeter: string | number;
  lifePercent: number;
  lifeClass: string;
  p2LifePercent: number;
  p2LifeClass: string;
  scoreDisplay: number;
  comboDisplay: number;
  p2Difficulty: string;
  p2Meter: string | number;
  p2ScoreDisplay: number;
  p2ComboDisplay: number;
  p1OffsetDisplay: string;
  p2OffsetDisplay: string;
}>();

const emit = defineEmits<{
  pause: [];
}>();
</script>

<template>
  <div
    class="hud-stack"
    :class="{
      'solo-p2-life': hasPlayer2 && !hasPlayer1,
      'hud-stack--dual': hasPlayer1 && hasPlayer2,
      'hud-stack--double': playMode === 'pump-double',
    }"
  >
    <HudSongTitle :title="songTitle" :large="playMode === 'pump-double'" />

    <template v-if="hasPlayer1 && hasPlayer2">
      <div class="hud-dual">
        <div class="hud-side hud-side--p1">
          <HudLifeCluster
            side="p1"
            :who-label="t('playerOpt.player1')"
            :life-percent="lifePercent"
            :life-class="lifeClass"
          />
          <div class="hud-side-meta">
            <HudSongMeta :difficulty="currentDifficulty" :meter="currentChartMeter" />
            <HudScorePanel
              side="p1"
              :score="scoreDisplay"
              :combo="comboDisplay"
              :score-label="t('gameplay.scoreLabel')"
              :offset-display="p1OffsetDisplay"
            />
          </div>
        </div>

        <div v-if="playMode !== 'pump-double'" class="hud-side hud-side--p2">
          <HudLifeCluster
            side="p2"
            :who-label="t('playerOpt.player2')"
            :life-percent="p2LifePercent"
            :life-class="p2LifeClass"
          />
          <div class="hud-side-meta">
            <HudSongMeta :difficulty="p2Difficulty" :meter="p2Meter" />
            <HudScorePanel
              side="p2"
              :score="p2ScoreDisplay"
              :combo="p2ComboDisplay"
              :score-label="t('gameplay.scoreLabel')"
              :offset-display="p2OffsetDisplay"
            />
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="hud-solo">
        <div class="hud-side hud-side--p1">
          <HudLifeCluster
            v-if="hasPlayer1"
            side="p1"
            :who-label="t('playerOpt.player1')"
            :life-percent="lifePercent"
            :life-class="lifeClass"
          />

          <HudLifeCluster
            v-if="hasPlayer2 && playMode !== 'pump-double'"
            side="p1"
            :who-label="t('playerOpt.player2')"
            :life-percent="p2LifePercent"
            :life-class="p2LifeClass"
          />

          <div class="hud-side-meta">
            <HudSongMeta :difficulty="currentDifficulty" :meter="currentChartMeter" />
            <HudScorePanel
              side="p1"
              :score="scoreDisplay"
              :combo="comboDisplay"
              :score-label="t('gameplay.scoreLabel')"
              :offset-display="p1OffsetDisplay"
            />
          </div>
        </div>

        <button
          type="button"
          class="hud-pause-btn"
          :aria-label="t('gameplay.paused')"
          @click="emit('pause')"
        >
          ⏸
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hud-stack {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.45rem 1.2rem 0.5rem;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.55) 0%, transparent 100%);
  pointer-events: none;
}
.hud-stack > * {
  pointer-events: auto;
}
.hud-stack--double :deep(.hud-song-center) {
  margin-bottom: 0.15rem;
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
.hud-solo :deep(.hud-life-cluster) {
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
.hud-stack--dual :deep(.hud-life-cluster) {
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

.hud-stack--double .hud-side--p2 {
  display: none;
}

.hud-pause-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.55);
  font-size: 1rem;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  line-height: 1;
  pointer-events: auto;
}
.hud-pause-btn:hover {
  color: rgba(255, 255, 255, 0.9);
}
</style>
