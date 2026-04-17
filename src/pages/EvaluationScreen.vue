<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "@/shared/stores/game";
import { useI18n } from "@/shared/i18n";
import { displayPercentFromDpRatio } from "@/shared/lib/engine/types";
import { gradeTextGradientStyle } from "@/shared/constants/gradeColors";

const router = useRouter();
const game = useGameStore();
const { t } = useI18n();

const results = computed(() => game.lastResults ?? {
  grade: "—", dpPercent: 0, score: 0, maxCombo: 0,
  w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, miss: 0,
  held: 0, letGo: 0, minesHit: 0, fullCombo: false, offsets: [],
});
const results2 = computed(() => game.lastResults2);
const showDualResults = computed(() => !!results2.value);

const totalNotes = computed(() =>
  results.value.w1 + results.value.w2 + results.value.w3 +
  results.value.w4 + results.value.w5 + results.value.miss,
);

const totalNotes2 = computed(() => {
  const r = results2.value;
  if (!r) return 0;
  return r.w1 + r.w2 + r.w3 + r.w4 + r.w5 + r.miss;
});

const gradeStyle = computed(() => gradeTextGradientStyle(results.value.grade));
const gradeStyle2 = computed(() =>
  results2.value ? gradeTextGradientStyle(results2.value.grade) : {},
);

/** 结算页：单板双人可分别选难度，与「当前列表索引」对齐（不只用 currentChart）。 */
const evalChartP1 = computed(() => {
  const list = game.charts;
  const i = game.p1ChartIndex;
  if (list.length > 0 && i >= 0 && i < list.length) return list[i] ?? null;
  return game.currentChart;
});
const evalChartP2 = computed(() => {
  const list = game.charts;
  const i = game.p2ChartIndex;
  if (list.length > 0 && i >= 0 && i < list.length) return list[i] ?? null;
  return null;
});

const percentDisplay = computed(() => displayPercentFromDpRatio(results.value.dpPercent).toFixed(2));
const percentDisplay2 = computed(() =>
  results2.value ? displayPercentFromDpRatio(results2.value.dpPercent).toFixed(2) : "0.00",
);

/** 与存档一致；旧会话无 `score` 时由 dpPercent 推算 */
function displayScore(r: { score?: number; dpPercent: number }): string {
  const n =
    typeof r.score === "number" && Number.isFinite(r.score)
      ? r.score
      : Math.max(0, Math.round(r.dpPercent * 10000));
  return n.toLocaleString();
}

const offsetBins = computed(() => {
  const offsets = results.value.offsets ?? [];
  if (!Array.isArray(offsets) || offsets.length === 0) {
    return new Array(40).fill(0);
  }

  const bins = new Array(40).fill(0);
  const range = 0.18;
  const half = range / 2;

  for (const o of offsets) {
    if (!isFinite(o)) continue;
    const norm = (o + half) / range;
    if (!isFinite(norm)) continue;
    const idx = Math.min(39, Math.max(0, Math.floor(norm * 40)));
    bins[idx]++;
  }
  return bins;
});

const maxBin = computed(() => Math.max(1, ...offsetBins.value));
const offsetBins2 = computed(() => {
  const offsets = results2.value?.offsets ?? [];
  if (!Array.isArray(offsets) || offsets.length === 0) return new Array(40).fill(0);
  const bins = new Array(40).fill(0);
  const range = 0.18;
  const half = range / 2;
  for (const o of offsets) {
    if (!isFinite(o)) continue;
    const norm = (o + half) / range;
    if (!isFinite(norm)) continue;
    const idx = Math.min(39, Math.max(0, Math.floor(norm * 40)));
    bins[idx]++;
  }
  return bins;
});
const maxBin2 = computed(() => Math.max(1, ...offsetBins2.value));
const meanOffset2 = computed(() => {
  const offsets = results2.value?.offsets ?? [];
  if (offsets.length === 0) return 0;
  return offsets.reduce((a, b) => a + b, 0) / offsets.length;
});

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

function goToPlayerOptions() {
  // 结算页退出统一进入“游玩”玩家设置，避免沿用编辑器预览返回链路。
  game.previewReturnToEditor = false;
  game.previewFromSecond = null;
  router.push("/player-options");
}
function goToSelectMusic() { goToPlayerOptions(); }
function retry() { router.push("/gameplay"); }
</script>

<template>
  <div class="evaluation-screen">
    <div class="hero-panel">
      <div class="song-info">
        <h3>{{ game.currentSong?.title ?? "—" }}</h3>
        <p>{{ game.currentSong?.artist ?? "" }}</p>
        <p v-if="!showDualResults" class="diff">
          {{ difficultyLabel(game.currentDifficulty) }} {{ game.currentChart?.meter ?? "" }}
        </p>
      </div>

      <div v-if="showDualResults && results2" class="dual-grade-row">
        <div class="player-grade-card">
          <span class="player-tag">{{ t('playerOpt.player1') }}</span>
          <p class="player-eval-diff">
            {{ difficultyLabel(evalChartP1?.difficulty) }} {{ evalChartP1?.meter ?? "—" }}
          </p>
          <h1 class="grade grade-dual" :style="gradeStyle">
            {{ results.grade }}
          </h1>
          <p class="percent">{{ percentDisplay }}%</p>
          <div class="eval-score-line">
            <span class="eval-score-lbl">{{ t('gameplay.scoreLabel') }}</span>
            <span class="eval-score-val">{{ displayScore(results) }}</span>
          </div>
          <div v-if="results.fullCombo" class="fc-badge">{{ t('eval.fullCombo') }}</div>
          <div class="mini-stats">
            <div class="mini-stat">
              <span class="mini-val">{{ results.maxCombo }}</span>
              <span class="mini-lbl">{{ t('eval.maxCombo') }}</span>
            </div>
            <div class="mini-stat">
              <span class="mini-val">{{ totalNotes }}</span>
              <span class="mini-lbl">{{ t('eval.totalNotes') }}</span>
            </div>
          </div>
        </div>
        <div class="player-grade-card">
          <span class="player-tag">{{ t('playerOpt.player2') }}</span>
          <p class="player-eval-diff">
            {{ difficultyLabel(evalChartP2?.difficulty) }} {{ evalChartP2?.meter ?? "—" }}
          </p>
          <h1 class="grade grade-dual" :style="gradeStyle2">
            {{ results2.grade }}
          </h1>
          <p class="percent">{{ percentDisplay2 }}%</p>
          <div class="eval-score-line">
            <span class="eval-score-lbl">{{ t('gameplay.scoreLabel') }}</span>
            <span class="eval-score-val">{{ displayScore(results2) }}</span>
          </div>
          <div v-if="results2.fullCombo" class="fc-badge">{{ t('eval.fullCombo') }}</div>
          <div class="mini-stats">
            <div class="mini-stat">
              <span class="mini-val">{{ results2.maxCombo }}</span>
              <span class="mini-lbl">{{ t('eval.maxCombo') }}</span>
            </div>
            <div class="mini-stat">
              <span class="mini-val">{{ totalNotes2 }}</span>
              <span class="mini-lbl">{{ t('eval.totalNotes') }}</span>
            </div>
          </div>
        </div>
      </div>

      <template v-else>
        <div class="grade-area">
          <h1 class="grade grade-single" :style="gradeStyle">
            {{ results.grade }}
          </h1>
          <p class="percent">{{ percentDisplay }}%</p>
          <div class="eval-score-line eval-score-line--single">
            <span class="eval-score-lbl">{{ t('gameplay.scoreLabel') }}</span>
            <span class="eval-score-val">{{ displayScore(results) }}</span>
          </div>
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
      </template>

      <div v-if="game.lastScoreSaved === true" class="saved-badge">
        {{ t('eval.scoreSaved') }}
      </div>
    </div>

    <div class="detail-panel">
      <div class="detail-scroll">
        <div class="judgment-grid" :class="{ 'is-dual': showDualResults }">
          <div class="judgment-table">
            <h4 class="player-result-title">
              {{ showDualResults ? t('playerOpt.player1') : t('eval.judgmentBreakdown') }}
            </h4>
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

          <div v-if="showDualResults && results2" class="judgment-table">
            <h4 class="player-result-title">{{ t('playerOpt.player2') }}</h4>
            <div class="j-row"><span class="j-label marvelous">{{ t('judgment.marvelous') }}</span><span class="j-val">{{ results2.w1 }}</span></div>
            <div class="j-row"><span class="j-label perfect">{{ t('judgment.perfect') }}</span><span class="j-val">{{ results2.w2 }}</span></div>
            <div class="j-row"><span class="j-label great">{{ t('judgment.great') }}</span><span class="j-val">{{ results2.w3 }}</span></div>
            <div class="j-row"><span class="j-label good">{{ t('judgment.good') }}</span><span class="j-val">{{ results2.w4 }}</span></div>
            <div class="j-row"><span class="j-label boo">{{ t('judgment.boo') }}</span><span class="j-val">{{ results2.w5 }}</span></div>
            <div class="j-row"><span class="j-label miss">{{ t('judgment.miss') }}</span><span class="j-val">{{ results2.miss }}</span></div>
            <div class="j-divider" />
            <div class="j-row"><span class="j-label">{{ t('eval.holdsHeld') }}</span><span class="j-val">{{ results2.held }}</span></div>
            <div class="j-row"><span class="j-label">{{ t('eval.holdsDropped') }}</span><span class="j-val">{{ results2.letGo }}</span></div>
            <div class="j-row"><span class="j-label">{{ t('eval.minesHit') }}</span><span class="j-val">{{ results2.minesHit }}</span></div>
          </div>
        </div>

        <div class="offset-grid" :class="{ 'is-dual': showDualResults }">
          <div class="offset-chart">
            <h4>{{ showDualResults ? `${t('playerOpt.player1')} · ${t('eval.timingOffset')}` : t('eval.timingOffset') }}</h4>
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
          <div v-if="showDualResults && results2" class="offset-chart">
            <h4>{{ t('playerOpt.player2') }} · {{ t('eval.timingOffset') }}</h4>
            <div class="chart-bars">
              <div v-for="(count, i) in offsetBins2" :key="'p2-' + i"
                   class="bar"
                   :class="{ center: i === 20, filled: i !== 20 && count > 0, empty: i !== 20 && count === 0 }"
                   :style="{ height: (count / maxBin2 * 60 + 2) + 'px' }" />
            </div>
            <div class="chart-labels">
              <span>{{ t('eval.early') }}</span>
              <span class="mean-offset">{{ meanOffset2 >= 0 ? '+' : '' }}{{ (meanOffset2 * 1000).toFixed(1) }}ms</span>
              <span>{{ t('eval.late') }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="actions">
        <button type="button" class="btn accent" @click="retry">{{ t('eval.retry') }}</button>
        <button type="button" class="btn secondary" @click="goToPlayerOptions">{{ t('eval.playerOptions') }}</button>
        <button type="button" class="btn primary" @click="goToSelectMusic">{{ t('eval.selectMusic') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.evaluation-screen {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 0;
  box-sizing: border-box;
  padding: clamp(0.75rem, 2vw, 1.25rem);
  background: linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
}

.hero-panel {
  flex: 1 1 52%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: clamp(1rem, 2.5vw, 2rem);
  gap: clamp(1rem, 2.2vw, 1.75rem);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent);
}

.song-info {
  text-align: center;
  padding: 0.85rem 1.15rem;
  max-width: min(100%, 28rem);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.song-info h3 { font-size: 1.1rem; margin: 0 0 0.35rem; }
.song-info p { font-size: 0.8rem; color: rgba(255, 255, 255, 0.4); margin: 0.15rem 0; }
.diff { color: var(--primary-color-hover) !important; font-weight: 600; }

.dual-grade-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: stretch;
  gap: clamp(0.75rem, 2vw, 1.25rem);
  width: 100%;
  max-width: 44rem;
}

.player-grade-card {
  flex: 1 1 200px;
  min-width: min(100%, 200px);
  max-width: 22rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: clamp(1rem, 2.2vw, 1.35rem) clamp(1rem, 2vw, 1.5rem);
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.14);
  box-sizing: border-box;
}

.player-tag {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.42);
  margin-bottom: 0.35rem;
}

.player-eval-diff {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--primary-color-hover) 88%, white);
  letter-spacing: 0.04em;
}

.grade-area { text-align: center; }
.grade { font-weight: 900; line-height: 1; margin: 0; }
.grade-single { font-size: clamp(3.5rem, 12vw, 6rem); }
.grade-dual { font-size: clamp(2.75rem, 8vw, 3.85rem); }

.percent { font-size: 1.35rem; font-weight: 600; color: rgba(255, 255, 255, 0.7); margin: 0.35rem 0 0; }

.eval-score-line {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}
.eval-score-line--single {
  margin-top: 0.65rem;
}
.eval-score-lbl {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: rgba(255, 255, 255, 0.38);
}
.eval-score-val {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.15rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--text-color) 88%, transparent);
  letter-spacing: 0.06em;
}

.fc-badge {
  display: inline-block;
  margin-top: 0.45rem;
  padding: 0.28rem 0.85rem;
  background: #00e676;
  color: #000;
  border-radius: 999px;
  font-weight: 800;
  font-size: 0.78rem;
  letter-spacing: 0.1em;
}

.mini-stats {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.85rem;
  width: 100%;
  justify-content: center;
}

.mini-stat {
  flex: 1;
  text-align: center;
  padding: 0.45rem 0.5rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.mini-val { display: block; font-size: 1.1rem; font-weight: 800; }
.mini-lbl { font-size: 0.58rem; letter-spacing: 0.12em; color: rgba(255, 255, 255, 0.32); }

.saved-badge {
  display: inline-block;
  padding: 0.3rem 0.8rem;
  background: rgba(0, 230, 118, 0.1);
  border: 1px solid rgba(0, 230, 118, 0.3);
  color: #00e676;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.combo-info { display: flex; gap: clamp(1rem, 3vw, 2rem); flex-wrap: wrap; justify-content: center; }

.combo-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.8rem 1rem;
  min-width: 120px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
}

.combo-val { font-size: 1.5rem; font-weight: 800; }
.combo-lbl { font-size: 0.65rem; letter-spacing: 0.15em; color: rgba(255, 255, 255, 0.3); }

.detail-panel {
  flex: 1 1 48%;
  min-width: 0;
  max-width: min(100%, 52rem);
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: clamp(1rem, 2.2vw, 1.75rem);
  gap: 1rem;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.16);
  box-sizing: border-box;
}

.detail-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: clamp(1rem, 2vw, 1.35rem);
  padding-right: 0.25rem;
}

.judgment-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(0.85rem, 1.8vw, 1.15rem);
}

.judgment-grid.is-dual {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.offset-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(0.85rem, 1.8vw, 1.15rem);
}

.offset-grid.is-dual {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.judgment-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.player-result-title {
  font-size: 0.62rem;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0 0.2rem;
}

.j-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.65rem;
  border-radius: 4px;
  background: var(--section-bg);
}

.j-label { font-size: 0.82rem; }
.j-val { font-size: 0.82rem; font-weight: 700; font-variant-numeric: tabular-nums; flex-shrink: 0; }

.j-divider { height: 1px; background: rgba(255, 255, 255, 0.06); margin: 4px 0; }

.j-label.marvelous { color: #00e5ff; }
.j-label.perfect { color: #ffea00; }
.j-label.great { color: #00e676; }
.j-label.good { color: #ff9100; }
.j-label.boo { color: #ff5252; }
.j-label.miss { color: #616161; }

.offset-chart { min-width: 0; }

.offset-chart h4 {
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.3);
  margin: 0 0 0.5rem;
  line-height: 1.35;
}

.chart-bars { display: flex; align-items: flex-end; gap: 1px; height: 70px; }

.bar {
  flex: 1 1 0;
  border-radius: 1px 1px 0 0;
  min-width: 0;
  transition: height 0.3s;
}

.bar.empty { background: color-mix(in srgb, var(--text-color) 5%, transparent); }
.bar.filled { background: color-mix(in srgb, var(--primary-color) 58%, transparent); }
.bar.center { background: color-mix(in srgb, var(--text-color) 88%, transparent); }

.chart-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.2);
  margin-top: 4px;
}

.mean-offset { color: rgba(255, 255, 255, 0.5); font-variant-numeric: tabular-nums; }

.actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.45rem;
  width: 100%;
  flex-shrink: 0;
  padding-top: 0.25rem;
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
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
}

.btn.primary { background: linear-gradient(135deg, var(--accent-secondary), var(--primary-color)); border: none; color: var(--text-on-primary); }
.btn.accent { background: linear-gradient(135deg, #00e676, #00bfa5); border: none; color: #000; font-weight: 800; }
.btn.secondary { background: linear-gradient(135deg, var(--primary-color), var(--primary-color-hover)); border: none; color: var(--text-on-primary); }
.btn:hover { filter: brightness(1.15); transform: translateY(-1px); }

@media (max-width: 900px) {
  .judgment-grid.is-dual,
  .offset-grid.is-dual {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .evaluation-screen {
    flex-direction: column;
    align-items: stretch;
    overflow-y: auto;
  }

  .hero-panel {
    flex: 0 0 auto;
  }

  .detail-panel {
    flex: 1 1 auto;
    max-width: none;
  }

  .actions { gap: 0.35rem; }

  .btn {
    min-height: 40px;
    padding: 0.45rem 0.28rem;
    font-size: clamp(0.52rem, 2.8vw, 0.68rem);
  }
}
</style>
