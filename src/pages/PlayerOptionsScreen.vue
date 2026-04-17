<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "@/shared/stores/game";
import type { ChartInfoItem } from "@/utils/api";
import { useI18n } from "@/shared/i18n";
import { listNoteskins } from "@/api";
import { SettingsCard } from "@/widgets";
import { ROUTINE_PLAYER_COLORS, type RoutinePlayerColorId } from "@/constants/routinePlayerColors";
import { logOptionalRejection } from "@/utils/devLog";
import { chartFitsPlayMode } from "@/utils/chartPlayMode";
import { setMetronomeSfxEnabled, setRhythmSfxEnabled, setUiSfxEnabled } from "@/shared/lib/sfx";

const router = useRouter();
const game = useGameStore();
const { t } = useI18n();

const SPEED_MODS_C = ["C300", "C400", "C450", "C500", "C550", "C600", "C700", "C800"];
const SPEED_MODS_X = ["1.0x", "1.5x", "2.0x", "2.5x", "3.0x"];
const RATE_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const NOTE_SCALE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5];
const NOTE_STYLES = ["default", "neon", "retro", "tetris", "cyberpunk", "mechanical", "musical"] as const;

const availableP1Colors = computed(() => ROUTINE_PLAYER_COLORS);
const availableP2Colors = computed(() => ROUTINE_PLAYER_COLORS);
const routineColorDisabled = (colorId: RoutinePlayerColorId, player: 1 | 2) =>
  (player === 1 ? game.routineP2ColorId : game.routineP1ColorId) === colorId;

function selectP2Color(colorId: RoutinePlayerColorId) {
  if (routineColorDisabled(colorId, 2)) return;
  game.routineP2ColorId = colorId;
}

function selectP1Color(colorId: RoutinePlayerColorId) {
  if (routineColorDisabled(colorId, 1)) return;
  game.routineP1ColorId = colorId;
}

const availableSkins = ref<string[]>([]);

async function loadSkinList() {
  try {
    const skins = await listNoteskins();
    availableSkins.value = [
      ...skins.filter((skin) => skin === "default"),
      ...skins.filter((skin) => skin !== "default"),
    ];
  } catch {
    availableSkins.value = ["default", "flat"];
  }
}

// Mode-specific computed properties
const isSingleMode = computed(() => game.playMode === "pump-single");
const isDoubleMode = computed(() => game.playMode === "pump-double");
const isRoutineMode = computed(() => game.playMode === "pump-routine");

/** Difficulty chips: only charts for the current play mode (same filter as select-music). */
const chartsForPlayMode = computed((): ChartInfoItem[] => {
  const all = game.charts;
  const mode = game.playMode;
  if (!mode) return all;
  const m = all.filter((c) => chartFitsPlayMode(c, mode));
  return m.length > 0 ? m : all;
});

function ensureChartIndicesMatchPlayMode() {
  const all = game.charts;
  const mode = game.playMode;
  if (!all.length || !mode) return;
  const cur = all[game.p1ChartIndex];
  if (cur && chartFitsPlayMode(cur, mode)) {
    if (isSingleMode.value || isDoubleMode.value) {
      game.p2ChartIndex = game.p1ChartIndex;
    }
    return;
  }
  const hit = all.find((c) => chartFitsPlayMode(c, mode));
  if (!hit) return;
  const i = all.indexOf(hit);
  if (i >= 0) {
    game.p1ChartIndex = i;
    game.currentChartIndex = i;
    if (isSingleMode.value || isDoubleMode.value) {
      game.p2ChartIndex = i;
    }
  }
}

/** Pump single: P1/P2 chart indices follow the difficulty chosen on song select (`currentChartIndex`). */
function applySingleModeChartsFromSongSelect() {
  if (!isSingleMode.value) return;
  const all = game.charts;
  const mode = game.playMode;
  if (!all.length || !mode) return;
  const i = game.currentChartIndex;
  if (i >= 0 && i < all.length && chartFitsPlayMode(all[i]!, mode)) {
    game.p1ChartIndex = i;
    game.p2ChartIndex = i;
  }
}

// Routine: P2 on, settings locked to P1. Double: P2 off and cannot be enabled (solo both pads).
const p2Locked = computed(() => isRoutineMode.value);
const p2RoutineReadonly = computed(() => isRoutineMode.value && game.hasPlayer2);

function difficultyLabel(diff?: string) {
  if (!diff) return "—";
  const key = `difficulty.${diff}`;
  const translated = t(key);
  return translated === key ? diff : translated;
}

function noteskinLabel(ns: string) {
  const key = `playerOpt.noteskin.${ns}`;
  const translated = t(key);
  return translated === key ? ns : translated;
}

function noteStyleLabel(st: typeof NOTE_STYLES[number]) {
  const key = `playerOpt.noteStyle.${st}`;
  const translated = t(key);
  return translated === key ? st : translated;
}

function canStart() {
  if (!game.currentSong || game.charts.length === 0) return false;
  if (!game.hasPlayer1 && !game.hasPlayer2) return false;
  return true;
}

function confirm() {
  if (!canStart()) {
    router.push("/editor");
    return;
  }
  if (isDoubleMode.value) {
    game.hasPlayer2 = false;
    game.p2ChartIndex = game.p1ChartIndex;
    game.player2Config = { ...game.player1Config };
  } else if (isRoutineMode.value && game.hasPlayer2) {
    game.p2ChartIndex = game.p1ChartIndex;
    game.player2Config = { ...game.player1Config };
  }
  if (isRoutineMode.value && game.hasPlayer2 && game.routineP1ColorId === game.routineP2ColorId) {
    const fallback = ROUTINE_PLAYER_COLORS.find((color) => color.id !== game.routineP1ColorId);
    game.routineP2ColorId = fallback?.id ?? game.routineP2ColorId;
  }
  game.currentChartIndex = game.hasPlayer1 ? game.p1ChartIndex : game.p2ChartIndex;
  router.push("/gameplay");
}

function goBack() {
  if (game.previewReturnToEditor) {
    game.editorWarmResume = true;
    game.previewFromSecond = null;
    game.previewReturnToEditor = false;
    router.push("/editor");
    return;
  }
  game.resumePlaybackOnReturn = true;
  router.push("/select-music");
}

// Prevent disabling both players simultaneously
function togglePlayer1(val: boolean) {
  if (!val && !game.hasPlayer2) return;
  game.hasPlayer1 = val;
}

function togglePlayer2(val: boolean) {
  if (isDoubleMode.value) return;
  if (!val && !game.hasPlayer1) return;
  game.hasPlayer2 = val;
}

const canDisableP1 = computed(() => game.hasPlayer2);
const canDisableP2 = computed(() => game.hasPlayer1);
const p2SwitchDisabled = computed(
  () => isDoubleMode.value || p2Locked.value || (!canDisableP2.value && game.hasPlayer2),
);

watch(
  [() => isRoutineMode.value, () => game.p1ChartIndex, () => game.player1Config],
  ([routineEnabled]) => {
    if (!routineEnabled) return;
    game.p2ChartIndex = game.p1ChartIndex;
    game.player2Config = { ...game.player1Config };
  },
  { immediate: true, deep: true },
);

// Sync UI sfxEnabled setting with the sfx module
watch(
  () => game.uiSfxEnabled,
  (val) => {
    setUiSfxEnabled(val);
  },
  { immediate: true },
);

watch(
  () => game.metronomeSfxEnabled,
  (val) => {
    setMetronomeSfxEnabled(val);
  },
  { immediate: true },
);

watch(
  () => game.rhythmSfxEnabled,
  (val) => {
    setRhythmSfxEnabled(val);
  },
  { immediate: true },
);

function onKeyDown(e: KeyboardEvent) {
  if (game.shortcutMatches(e, "title.confirm")) {
    if (!canStart()) return;
    e.preventDefault();
    confirm();
    return;
  }
  if (game.shortcutMatches(e, "global.back")) {
    e.preventDefault();
    goBack();
  }
}

watch(
  () => game.playMode,
  (mode) => {
    if (mode !== "pump-double") return;
    game.hasPlayer2 = false;
    game.p2ChartIndex = game.p1ChartIndex;
    game.player2Config = { ...game.player1Config };
  },
);

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  loadSkinList();
  applySingleModeChartsFromSongSelect();
  ensureChartIndicesMatchPlayMode();
  // Ensure P1 is always enabled when entering player options
  game.hasPlayer1 = true;
  if (isDoubleMode.value) {
    game.hasPlayer2 = false;
    game.p2ChartIndex = game.p1ChartIndex;
    game.player2Config = { ...game.player1Config };
  } else if (isRoutineMode.value) {
    game.hasPlayer2 = true;
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
  game.saveAppConfig().catch((e) => logOptionalRejection("playerOptions.unmount.saveAppConfig", e));
});
</script>

<template>
  <div class="options-screen">
    <header class="top-bar">
      <button class="back-btn" @click="goBack">&larr;</button>
      <h2>{{ t('playerOpt.title') }}</h2>
      <button class="confirm-btn" :disabled="!canStart()" @click="confirm">{{ t('playerOpt.ready') }}</button>
    </header>

    <div class="options-scroll">
      <!-- Song Preview -->
      <section class="option-card song-preview">
        <h3>{{ t('playerOpt.song') }}</h3>
        <div class="preview-info">
          <p class="song-t">{{ game.currentSong?.title ?? '—' }}</p>
          <p class="song-a">{{ game.currentSong?.artist ?? '' }}</p>
        </div>
      </section>

      <!-- Player cards row: P1 (left) and P2 (right) side by side -->
      <div class="player-cards-row">

        <!-- ═══════ PLAYER 1 CARD ═══════ -->
        <SettingsCard
          class="p1-card"
          :title="t('playerOpt.player1')"
          :disabled="!game.hasPlayer1"
          :class="{ disabled: !game.hasPlayer1 }"
        >
          <template #header>
            <label class="toggle-switch" :title="canDisableP1 ? '' : t('playerOpt.cannotDisableBoth')">
              <input type="checkbox" :checked="game.hasPlayer1" @change="togglePlayer1(($event.target as HTMLInputElement).checked)" :disabled="!canDisableP1 && game.hasPlayer1" />
              <span class="toggle-slider"></span>
            </label>
          </template>

          <template #default>
            <!-- Difficulty -->
            <div class="setting-row stacked">
              <span class="setting-label">{{ t('playerOpt.difficulty') }}</span>
              <div class="diff-grid">
                <button v-for="chart in chartsForPlayMode" :key="chart.chartIndex"
                  class="diff-chip" :class="{ active: game.p1ChartIndex === chart.chartIndex }"
                  @click="game.p1ChartIndex = chart.chartIndex">
                  {{ difficultyLabel(chart.difficulty) }} {{ chart.meter }}
                </button>
              </div>
            </div>

            <!-- Speed -->
            <div class="setting-row stacked">
              <span class="setting-label">{{ t('playerOpt.speed') }}</span>
              <div class="speed-mod-rows">
                <div class="chip-grid-inline">
                  <button v-for="mod in SPEED_MODS_C" :key="mod"
                    class="chip-sm" :class="{ active: game.player1Config.speedMod === mod }"
                    @click="game.player1Config.speedMod = mod">{{ mod }}</button>
                </div>
                <div class="chip-grid-inline">
                  <button v-for="mod in SPEED_MODS_X" :key="mod"
                    class="chip-sm" :class="{ active: game.player1Config.speedMod === mod }"
                    @click="game.player1Config.speedMod = mod">{{ mod }}</button>
                </div>
              </div>
            </div>

            <!-- Color scheme: pump-single / pump-double only -->
            <div class="setting-row stacked" v-if="isSingleMode || isDoubleMode">
              <span class="setting-label">{{ t('playerOpt.colorScheme') }}</span>
              <div class="chip-grid-inline">
                <button v-for="ns in availableSkins" :key="ns"
                  class="chip-sm" :class="{ active: game.player1Config.noteskin === ns }"
                  @click="game.player1Config.noteskin = ns">{{ noteskinLabel(ns) }}</button>
              </div>
            </div>

            <!-- Note Style -->
            <div class="setting-row stacked">
              <span class="setting-label">{{ t('playerOpt.noteStyle') }}</span>
              <div class="chip-grid-inline">
                <button v-for="st in NOTE_STYLES" :key="st"
                  class="chip-sm" :class="{ active: game.player1Config.noteStyle === st }"
                  @click="game.player1Config.noteStyle = st">{{ noteStyleLabel(st) }}</button>
              </div>
            </div>

            <!-- Note Scale -->
            <div class="setting-row stacked">
              <span class="setting-label">{{ t('playerOpt.noteScale') }}</span>
              <div class="chip-grid-inline">
                <button v-for="sc in NOTE_SCALE_OPTIONS" :key="sc"
                  class="chip-sm" :class="{ active: game.player1Config.noteScale === sc }"
                  @click="game.player1Config.noteScale = sc">{{ sc }}x</button>
              </div>
            </div>

            <!-- Note colors by chart layer: Routine only -->
            <div class="setting-row stacked" v-if="isRoutineMode">
              <span class="setting-label">{{ t('playerOpt.routineP1Color') }}</span>
              <div class="color-picker">
                <button v-for="color in availableP1Colors" :key="color.id"
                  class="color-btn" :class="{ active: game.routineP1ColorId === color.id, disabled: routineColorDisabled(color.id, 1) }"
                  :style="{ backgroundColor: color.hex }"
                  :disabled="routineColorDisabled(color.id, 1)"
                  @click="selectP1Color(color.id)" />
              </div>
            </div>

            <!-- Toggles -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.reverse') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player1Config.reverse" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.mirror') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player1Config.mirror" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.sudden') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player1Config.sudden" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.hidden') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player1Config.hidden" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.rotate') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player1Config.rotate" /><span class="toggle-slider"></span></label>
            </div>
          </template>
        </SettingsCard>

        <!-- ═══════ PLAYER 2 CARD ═══════ -->
        <SettingsCard
          class="p2-card"
          :title="t('playerOpt.player2')"
          :disabled="!game.hasPlayer2"
          :locked="p2Locked && game.hasPlayer2"
          :class="{ disabled: !game.hasPlayer2, locked: p2Locked && game.hasPlayer2 }"
        >
          <template #header>
            <label class="toggle-switch" :class="{ 'toggle-disabled': p2SwitchDisabled }" :title="canDisableP2 ? '' : t('playerOpt.cannotDisableBoth')">
              <input type="checkbox" :checked="game.hasPlayer2" @change="togglePlayer2(($event.target as HTMLInputElement).checked)" :disabled="p2SwitchDisabled" />
              <span class="toggle-slider"></span>
            </label>
          </template>

          <template #default>
            <!-- Difficulty -->
            <div class="setting-row stacked">
              <span class="setting-label">{{ t('playerOpt.difficulty') }}</span>
              <div class="diff-grid">
                <button v-for="chart in chartsForPlayMode" :key="chart.chartIndex"
                  class="diff-chip" :class="{ active: game.p2ChartIndex === chart.chartIndex }"
                  :disabled="p2RoutineReadonly"
                  @click="game.p2ChartIndex = chart.chartIndex">
                  {{ difficultyLabel(chart.difficulty) }} {{ chart.meter }}
                </button>
              </div>
            </div>

            <!-- Speed -->
            <div class="setting-row stacked">
              <span class="setting-label">{{ t('playerOpt.speed') }}</span>
              <div class="speed-mod-rows">
                <div class="chip-grid-inline">
                  <button v-for="mod in SPEED_MODS_C" :key="mod"
                    class="chip-sm" :class="{ active: game.player2Config.speedMod === mod }"
                    :disabled="p2RoutineReadonly"
                    @click="game.player2Config.speedMod = mod">{{ mod }}</button>
                </div>
                <div class="chip-grid-inline">
                  <button v-for="mod in SPEED_MODS_X" :key="mod"
                    class="chip-sm" :class="{ active: game.player2Config.speedMod === mod }"
                    :disabled="p2RoutineReadonly"
                    @click="game.player2Config.speedMod = mod">{{ mod }}</button>
                </div>
              </div>
            </div>

            <!-- Color scheme -->
            <div v-if="isSingleMode" class="setting-row stacked">
              <span class="setting-label">{{ t('playerOpt.colorScheme') }}</span>
              <div class="chip-grid-inline">
                <button v-for="ns in availableSkins" :key="ns"
                  class="chip-sm" :class="{ active: game.player2Config.noteskin === ns }"
                  @click="game.player2Config.noteskin = ns">{{ noteskinLabel(ns) }}</button>
              </div>
            </div>

            <!-- Note Style -->
            <div class="setting-row stacked">
              <span class="setting-label">{{ t('playerOpt.noteStyle') }}</span>
              <div class="chip-grid-inline">
                <button v-for="st in NOTE_STYLES" :key="st"
                  class="chip-sm" :class="{ active: game.player2Config.noteStyle === st }"
                  :disabled="p2RoutineReadonly"
                  @click="game.player2Config.noteStyle = st">{{ noteStyleLabel(st) }}</button>
              </div>
            </div>

            <!-- Note Scale -->
            <div class="setting-row stacked">
              <span class="setting-label">{{ t('playerOpt.noteScale') }}</span>
              <div class="chip-grid-inline">
                <button v-for="sc in NOTE_SCALE_OPTIONS" :key="sc"
                  class="chip-sm" :class="{ active: game.player2Config.noteScale === sc }"
                  :disabled="p2RoutineReadonly"
                  @click="game.player2Config.noteScale = sc">{{ sc }}x</button>
              </div>
            </div>

            <!-- Note colors by chart layer: Routine only -->
            <div v-if="isRoutineMode" class="setting-row stacked">
              <span class="setting-label">{{ t('playerOpt.routineP2Color') }}</span>
              <div class="color-picker">
                <button v-for="color in availableP2Colors" :key="color.id"
                  class="color-btn" :class="{ active: game.routineP2ColorId === color.id, disabled: routineColorDisabled(color.id, 2) }"
                  :style="{ backgroundColor: color.hex }"
                  :disabled="routineColorDisabled(color.id, 2)"
                  @click="selectP2Color(color.id)" />
              </div>
            </div>

            <!-- Toggles -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.reverse') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player2Config.reverse" :disabled="p2RoutineReadonly" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.mirror') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player2Config.mirror" :disabled="p2RoutineReadonly" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.sudden') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player2Config.sudden" :disabled="p2RoutineReadonly" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.hidden') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player2Config.hidden" :disabled="p2RoutineReadonly" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.rotate') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player2Config.rotate" :disabled="p2RoutineReadonly" /><span class="toggle-slider"></span></label>
            </div>
          </template>
        </SettingsCard>

      </div>


      <!-- ═══════ SHARED SETTINGS ═══════ -->

      <!-- Playback Rate -->
      <section class="option-card">
        <h3>{{ t('playerOpt.playbackRate') }}</h3>
        <div class="chip-grid">
          <button v-for="r in RATE_OPTIONS" :key="r"
            class="chip" :class="{ active: game.playbackRate === r }"
            @click="game.playbackRate = r">{{ r }}x</button>
        </div>
      </section>

      <!-- Judgment Settings -->
      <section class="option-card">
        <h3>{{ t('playerOpt.judgmentSettings') }}</h3>
        <div class="setting-row">
          <span class="setting-label">{{ t('playerOpt.autoPlay') }}</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="game.autoPlay" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <span class="setting-label">{{ t('settings.rhythmSfxEnabled') }}</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="game.rhythmSfxEnabled" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <span class="setting-label">{{ t('playerOpt.sfx') }}</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="game.metronomeSfxEnabled" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.options-screen { width: 100%; height: 100%; display: flex; flex-direction: column; background: linear-gradient(180deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%); }
.top-bar { display: flex; align-items: center; padding: 0.85rem 1rem; border-bottom: 1px solid var(--border-color); background: rgba(8,8,18,0.74); backdrop-filter: blur(14px); flex-shrink: 0; }
.top-bar h2 { flex: 1; text-align: center; font-size: 0.85rem; letter-spacing: 0.3em; color: rgba(255,255,255,0.4); }
.back-btn, .confirm-btn { background: none; border: 1px solid var(--border-color); color: rgba(255,255,255,0.6); border-radius: 10px; padding: 0.5rem 0.9rem; cursor: pointer; font-size: 0.8rem; font-weight: 700; }
.confirm-btn { background: linear-gradient(135deg, var(--accent-secondary), var(--primary-color)); border: none; color: var(--text-on-primary); box-shadow: 0 10px 24px var(--primary-color-glow); }
.confirm-btn:hover { filter: brightness(1.15); }
.confirm-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.options-scroll { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; max-width: 900px; margin: 0 auto; width: 100%; }

/* Player Cards Row */
.player-cards-row { display: flex; gap: 0.75rem; }

.player-card {
  flex: 1; min-width: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02));
  border: 1px solid var(--border-color); border-radius: 12px;
  overflow: hidden;
  transition: opacity 0.2s, border-color 0.2s;
}
.player-card.disabled { opacity: 0.5; border-color: rgba(255,255,255,0.04); }

/* P2 locked state for double/routine modes */
.player-card.locked {
  border-color: rgba(100,100,100,0.3);
  background: linear-gradient(180deg, rgba(50,50,50,0.15), rgba(40,40,40,0.1));
}
.player-card.locked .player-card-header {
  background: rgba(60,60,60,0.2);
}
.player-card.locked .player-card-header h3 {
  color: rgba(200,200,200,0.4);
}

/* P1 and P2 card differentiation */
.p1-card {
  border-left: 3px solid rgba(0, 191, 255, 0.4);
}
.p2-card {
  border-left: 3px solid rgba(255, 68, 68, 0.4);
}

.player-card-header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.player-card-header h3 {
  font-size: 0.7rem; letter-spacing: 0.2em; color: rgba(255,255,255,0.5);
  margin: 0; white-space: nowrap;
}
.player-card-body { padding: 0.65rem 0.85rem; }
.player-card-disabled-body {
  padding: 2rem 1rem; text-align: center;
  color: rgba(255,255,255,0.2); font-size: 0.8rem;
}

.sub-section { margin-bottom: 0.5rem; }
.sub-label {
  display: flex; align-items: center; gap: 0.3rem;
  font-size: 0.78rem; letter-spacing: 0.15em; color: rgba(255,255,255,0.3);
  margin-bottom: 0.35rem; text-transform: uppercase;
}

.diff-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.diff-chip {
  padding: 0.35rem 0.65rem; border-radius: 6px;
  font-size: 0.75rem; font-weight: 600;
  background: rgba(255,255,255,0.04); border: 1px solid var(--border-color);
  color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.1s;
}
.diff-chip:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: var(--text-color); }
.diff-chip.active { background: var(--primary-color-bg); border-color: var(--primary-color-hover); color: var(--text-color); box-shadow: 0 0 8px var(--primary-color-glow); }
.diff-chip:disabled { opacity: 0.4; cursor: not-allowed; }

/* Shared card styles */
.option-card { background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02)); border: 1px solid var(--border-color); border-radius: 12px; padding: 0.85rem; }
.option-card h3 { font-size: 0.65rem; letter-spacing: 0.2em; color: rgba(255,255,255,0.3); margin-bottom: 0.6rem; display: flex; align-items: center; }

.chip-grid { display: flex; flex-wrap: wrap; gap: 5px; }
.chip { padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.1s; }
.chip:hover { background: rgba(255,255,255,0.08); color: var(--text-color); }
.chip.active { background: var(--primary-color-bg); border-color: var(--primary-color-hover); color: var(--text-color); box-shadow: 0 0 8px var(--primary-color-glow); }

.setting-row { display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid rgba(255,255,255,0.03); }
.setting-row:last-child { border-bottom: none; }
.setting-label { font-size: 0.65rem; color: rgba(255,255,255,0.3); display: flex; align-items: center; gap: 0.3rem; letter-spacing: 0.2em; text-transform: uppercase; }
.setting-row.stacked { flex-direction: column; align-items: flex-start; gap: 0.35rem; }

.toggle-switch { position: relative; width: 36px; height: 20px; cursor: pointer; flex-shrink: 0; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; inset: 0; background: rgba(255,255,255,0.1); border-radius: 22px; transition: 0.2s; }
.toggle-slider::before { content: ''; position: absolute; width: 14px; height: 14px; left: 3px; bottom: 3px; background: rgba(255,255,255,0.5); border-radius: 50%; transition: 0.2s; }
.toggle-switch input:checked + .toggle-slider { background: var(--primary-color); }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(16px); background: var(--text-on-primary); }
.toggle-switch input:disabled + .toggle-slider { opacity: 0.4; cursor: not-allowed; }

/* Disabled toggle state */
.toggle-disabled { cursor: not-allowed; }
.toggle-disabled .toggle-slider { background: rgba(100,100,100,0.3); }
.toggle-disabled .toggle-slider::before { background: rgba(150,150,150,0.5); }

.chip-grid-inline { display: flex; flex-wrap: wrap; gap: 4px; }
.speed-mod-rows { display: flex; flex-direction: column; gap: 8px; }
.chip-sm { padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.1s; }
.chip-sm:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: var(--text-color); }
.chip-sm.active { background: var(--primary-color-bg); border-color: var(--primary-color-hover); color: var(--text-color); box-shadow: 0 0 6px var(--primary-color-glow); }
.chip-sm:disabled { opacity: 0.4; cursor: not-allowed; }

/* Locked content state */
.locked-content .setting-label { color: rgba(255,255,255,0.35); }
.locked-content .chip-grid-inline.locked { opacity: 0.5; }
.locked-content .diff-grid.locked { opacity: 0.5; }

/* Color picker */
.color-picker { display: flex; gap: 4px; flex-wrap: wrap; }
.color-btn {
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer; transition: all 0.15s;
}
.color-btn:hover { transform: scale(1.15); }
.color-btn.active { border-color: var(--text-on-primary); box-shadow: 0 0 8px color-mix(in srgb, var(--text-color) 50%, transparent); }
.color-btn.disabled { opacity: 0.3; cursor: not-allowed; filter: grayscale(0.2); }
.color-btn.disabled:hover { transform: none; }

/* Notices */
.locked-notice, .routine-notice {
  font-size: 0.68rem; color: rgba(255,255,255,0.25);
  text-align: center; padding: 0.4rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  margin-bottom: 0.5rem;
}
.routine-notice { color: rgba(255,68,68,0.5); }

.preview-info { display: flex; flex-direction: column; gap: 0.2rem; }
.song-t { font-size: 1rem; font-weight: 700; }
.song-a { font-size: 0.8rem; color: rgba(255,255,255,0.4); }

@media (max-width: 700px) {
  .player-cards-row { flex-direction: column; }
}
</style>
