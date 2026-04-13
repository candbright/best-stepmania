<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "@/stores/game";
import { useI18n } from "@/i18n";
import { displayPercentFromDpRatio } from "@/engine/types";
import { gradeTextGradientStyle } from "@/utils/gradeColors";

const router = useRouter();
const game = useGameStore();
const { t } = useI18n();

const results = computed(() => game.lastResults ?? {
  grade: "—", dpPercent: 0, maxCombo: 0,
  w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, miss: 0,
  held: 0, letGo: 0, minesHit: 0, fullCombo: false, offsets: [],
});

const totalNotes = computed(() =>
  results.value.w1 + results.value.w2 + results.value.w3 +
  results.value.w4 + results.value.w5 + results.value.miss,
);

const gradeStyle = computed(() => gradeTextGradientStyle(results.value.grade));

const percentDisplay = computed(() => displayPercentFromDpRatio(results.value.dpPercent).toFixed(2));

const offsetBins = computed(() => {
  const offsets = results.value.offsets ?? [];
  if (!Array.isArray(offsets) || offsets.length === 0) {
    return new Array(40).fill(0);
  }
  
  const bins = new Array(40).fill(0);
  const range = 0.18;
  const half = range / 2;
  
  for (const o of offsets) {
    if (!isFinite(o)) continue;  // 跳过无效数字
    const norm = (o + half) / range;
    if (!isFinite(norm)) continue;
    const idx = Math.min(39, Math.max(0, Math.floor(norm * 40)));
    bins[idx]++;
  }
  return bins;
});

const maxBin = computed(() => Math.max(1, ...offsetBins.value));

function difficultyLabel(diff?: string) {
  if (!diff) return "—";
  const key = `difficulty.${diff}`;
  const translated = t(key);
  return translated === key ? diff : translated;
}

const meanOffset = computed(() => {
  const offsets = results.value.offsets ?? [];
  if (offsets.length === 0) return 0;
  return offsets.reduce((a, b) => a + b, 0) / offsets.length;
});

function goToSelectMusic() {
  if (game.previewReturnToEditor) {
    game.editorWarmResume = true;
    game.previewReturnToEditor = false;
    game.previewFromSecond = null;
    router.push("/editor");
    return;
  }
  router.push("/select-music");
}
function goToPlayerOptions() { router.push("/player-options"); }
function retry() { router.push("/gameplay"); }
</script>

<template>
  <div class="evaluation-screen">
    <div class="left-panel">
      <div class="song-info">
        <h3>{{ game.currentSong?.title ?? "—" }}</h3>
        <p>{{ game.currentSong?.artist ?? "" }}</p>
        <p class="diff">{{ difficultyLabel(game.currentDifficulty) }} {{ game.currentChart?.meter ?? "" }}</p>
      </div>

      <div class="grade-area">
        <h1 class="grade" :style="gradeStyle">
          {{ results.grade }}
        </h1>
        <p class="percent">{{ percentDisplay }}%</p>
        <div v-if="results.fullCombo" class="fc-badge">{{ t('eval.fullCombo') }}</div>
      </div>

      <div class="combo-info">
        <div class="combo-stat">
          <span class="combo-val">{{ results.maxCombo }}</span>
          <span class="combo-lbl">{{ t('eval.maxCombo') }}</span>
        </div>
        <div class="combo-stat">
          <span class="combo-val">{{ totalNotes }}</span>
          <span class="combo-lbl">{{ t('eval.totalNotes') }}</span>
        </div>
      </div>

      <div v-if="game.lastScoreSaved === true" class="saved-badge">
        {{ t('eval.scoreSaved') }}
      </div>
    </div>

    <div class="right-panel">
      <div class="judgment-table">
        <div class="j-row"><span class="j-label marvelous">{{ t('judgment.marvelous') }}</span><span class="j-val">{{ results.w1 }}</span></div>
        <div class="j-row"><span class="j-label perfect">{{ t('judgment.perfect') }}</span><span class="j-val">{{ results.w2 }}</span></div>
        <div class="j-row"><span class="j-label great">{{ t('judgment.great') }}</span><span class="j-val">{{ results.w3 }}</span></div>
        <div class="j-row"><span class="j-label good">{{ t('judgment.good') }}</span><span class="j-val">{{ results.w4 }}</span></div>
        <div class="j-row"><span class="j-label boo">{{ t('judgment.boo') }}</span><span class="j-val">{{ results.w5 }}</span></div>
        <div class="j-row"><span class="j-label miss">{{ t('judgment.miss') }}</span><span class="j-val">{{ results.miss }}</span></div>
        <div class="j-divider" />
        <div class="j-row"><span class="j-label">{{ t('eval.holdsHeld') }}</span><span class="j-val">{{ results.held }}</span></div>
        <div class="j-row"><span class="j-label">{{ t('eval.holdsDropped') }}</span><span class="j-val">{{ results.letGo }}</span></div>
        <div class="j-row"><span class="j-label">{{ t('eval.minesHit') }}</span><span class="j-val">{{ results.minesHit }}</span></div>
      </div>

      <div class="offset-chart">
        <h4>{{ t('eval.timingOffset') }}</h4>
        <div class="chart-bars">
          <div v-for="(count, i) in offsetBins" :key="i"
               class="bar"
               :class="{ center: i === 20, filled: i !== 20 && count > 0, empty: i !== 20 && count === 0 }"
               :style="{ height: (count / maxBin * 60 + 2) + 'px' }" />
        </div>
        <div class="chart-labels">
          <span>{{ t('eval.early') }}</span>
          <span class="mean-offset">{{ meanOffset >= 0 ? '+' : '' }}{{ (meanOffset * 1000).toFixed(1) }}ms</span>
          <span>{{ t('eval.late') }}</span>
        </div>
      </div>

      <div class="actions">
        <button class="btn accent" @click="retry">{{ t('eval.retry') }}</button>
        <button class="btn secondary" @click="goToPlayerOptions">{{ t('eval.playerOptions') }}</button>
        <button class="btn primary" @click="goToSelectMusic">{{ t('eval.selectMusic') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.evaluation-screen { width: 100%; height: 100%; display: flex; background: linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%); }
.left-panel { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2rem; gap: 1.5rem; background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent); }
.song-info { text-align: center; padding: 0.9rem 1.2rem; border: 1px solid var(--border-color); border-radius: 16px; background: rgba(255,255,255,0.03); }
.song-info h3 { font-size: 1.1rem; }
.song-info p { font-size: 0.8rem; color: rgba(255,255,255,0.4); }
.diff { color: var(--primary-color-hover) !important; font-weight: 600; }
.grade-area { text-align: center; }
.grade { font-size: 6rem; font-weight: 900; line-height: 1; }
.percent { font-size: 1.5rem; font-weight: 600; color: rgba(255,255,255,0.7); margin-top: 0.25rem; }
.fc-badge { display: inline-block; margin-top: 0.5rem; padding: 0.3rem 1rem; background: #00e676; color: #000; border-radius: 999px; font-weight: 800; font-size: 0.85rem; letter-spacing: 0.1em; }
.saved-badge {
  display: inline-block; padding: 0.3rem 0.8rem;
  background: rgba(0,230,118,0.1); border: 1px solid rgba(0,230,118,0.3);
  color: #00e676; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
  letter-spacing: 0.05em;
}
.combo-info { display: flex; gap: 2rem; }
.combo-stat { display: flex; flex-direction: column; align-items: center; padding: 0.8rem 1rem; min-width: 120px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); }
.combo-val { font-size: 1.5rem; font-weight: 800; }
.combo-lbl { font-size: 0.65rem; letter-spacing: 0.15em; color: rgba(255,255,255,0.3); }
.right-panel { width: 380px; display: flex; flex-direction: column; justify-content: center; padding: 2rem; gap: 1.5rem; border-left: 1px solid var(--border-color); background: rgba(0,0,0,0.12); }
.judgment-table { display: flex; flex-direction: column; gap: 4px; }
.j-row { display: flex; justify-content: space-between; padding: 0.35rem 0.75rem; border-radius: 4px; background: var(--section-bg); }
.j-label { font-size: 0.85rem; }
.j-val { font-size: 0.85rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.j-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 4px 0; }
.j-label.marvelous { color: #00e5ff; }
.j-label.perfect { color: #ffea00; }
.j-label.great { color: #00e676; }
.j-label.good { color: #ff9100; }
.j-label.boo { color: #ff5252; }
.j-label.miss { color: #616161; }
.offset-chart h4 { font-size: 0.65rem; letter-spacing: 0.15em; color: rgba(255,255,255,0.3); margin-bottom: 0.5rem; }
.chart-bars { display: flex; align-items: flex-end; gap: 1px; height: 70px; }
.bar { width: 100%; border-radius: 1px 1px 0 0; min-width: 2px; transition: height 0.3s; }
.bar.empty { background: color-mix(in srgb, var(--text-color) 5%, transparent); }
.bar.filled { background: color-mix(in srgb, var(--primary-color) 58%, transparent); }
.bar.center { background: color-mix(in srgb, var(--text-color) 88%, transparent); }
.chart-labels { display: flex; justify-content: space-between; font-size: 0.6rem; color: rgba(255,255,255,0.2); margin-top: 4px; }
.mean-offset { color: rgba(255,255,255,0.5); font-variant-numeric: tabular-nums; }
.actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.45rem;
  width: 100%;
}
.btn {
  flex: 1 1 0;
  min-width: 0;
  min-height: 42px;
  padding: 0.5rem 0.35rem;
  font-size: clamp(0.58rem, 1.65vw, 0.76rem);
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--section-bg);
  color: var(--text-muted);
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0,0,0,0.14);
}
.btn.primary { background: linear-gradient(135deg, var(--accent-secondary), var(--primary-color)); border: none; color: var(--text-on-primary); }
.btn.accent { background: linear-gradient(135deg, #00e676, #00bfa5); border: none; color: #000; font-weight: 800; }
.btn.secondary { background: linear-gradient(135deg, var(--primary-color), var(--primary-color-hover)); border: none; color: var(--text-on-primary); }
.btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
@media (max-width: 860px) {
  .evaluation-screen { flex-direction: column; }
  .right-panel { width: 100%; border-left: none; border-top: 1px solid var(--border-color); }
  .actions { gap: 0.35rem; }
  .btn {
    min-height: 40px;
    padding: 0.45rem 0.28rem;
    font-size: clamp(0.52rem, 2.8vw, 0.68rem);
  }
}
</style>
