<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "@/stores/game";
import type { ChartInfoItem } from "@/utils/api";
import { useI18n } from "@/i18n";
import HelpTooltip from "@/components/HelpTooltip.vue";
import { listNoteskins } from "@/api";
import { ROUTINE_PLAYER_COLORS, type RoutinePlayerColorId } from "@/constants/routinePlayerColors";
import { logOptionalRejection } from "@/utils/devLog";
import { chartFitsPlayMode } from "@/utils/chartPlayMode";
import { setUiSfxEnabled } from "@/utils/sfx";

const router = useRouter();
const game = useGameStore();
const { t } = useI18n();

const SPEED_MODS_C = ["C300", "C400", "C450", "C500", "C550", "C600", "C700", "C800"];
const SPEED_MODS_X = ["1.0x", "1.5x", "2.0x", "2.5x", "3.0x"];
const RATE_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const NOTE_SCALE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5];
const NOTE_STYLES = ["default", "neon", "retro", "tetris", "cyberpunk", "mechanical", "musical"] as const;

// Computed available colors for P2 (exclude P1's selected color)
const availableP2Colors = computed(() =>
  ROUTINE_PLAYER_COLORS.filter((c) => c.id !== game.routineP1ColorId),
);

function routineColorTitle(colorId: RoutinePlayerColorId): string {
  const key = `playerOpt.routineColor.${colorId}`;
  const translated = t(key);
  return translated === key ? colorId : translated;
}

// When P2 selects a color, ensure it's different from P1
function selectP2Color(colorId: RoutinePlayerColorId) {
  if (colorId === game.routineP1ColorId) return;
  game.routineP2ColorId = colorId;
}

// When P1 selects a color, automatically switch P2 to a different one
function selectP1Color(colorId: RoutinePlayerColorId) {
  game.routineP1ColorId = colorId;
  if (game.routineP2ColorId === colorId) {
    const firstAvailable = availableP2Colors.value[0];
    if (firstAvailable) {
      game.routineP2ColorId = firstAvailable.id;
    }
  }
}

const availableSkins = ref<string[]>([]);

async function loadSkinList() {
  try {
    availableSkins.value = await listNoteskins();
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
    if (isSingleMode.value) {
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
    if (isSingleMode.value) {
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

// In single mode, both players can be configured independently
// In double/routine mode, P2 settings are synced/locked
const p2Locked = computed(() => isDoubleMode.value || isRoutineMode.value);

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
  // In double / routine (co-op) modes, shared gameplay settings follow P1
  if ((isDoubleMode.value || isRoutineMode.value) && game.hasPlayer2) {
    game.p2ChartIndex = game.p1ChartIndex;
    game.player2Config = { ...game.player1Config };
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
  if (!val && !game.hasPlayer1) return;
  game.hasPlayer2 = val;
}

const canDisableP1 = computed(() => game.hasPlayer2);
const canDisableP2 = computed(() => game.hasPlayer1);

// Sync UI sfxEnabled setting with the sfx module
watch(
  () => game.uiSfxEnabled,
  (val) => {
    setUiSfxEnabled(val);
  },
  { immediate: true },
);

function onKeyDown(e: KeyboardEvent) {
  if (game.shortcutMatches(e, "playerOptions.back")) {
    e.preventDefault();
    goBack();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  loadSkinList();
  applySingleModeChartsFromSongSelect();
  ensureChartIndicesMatchPlayMode();
  // Ensure P1 is always enabled when entering player options
  game.hasPlayer1 = true;
  // In double/routine modes, P2 is enabled by default but settings are locked
  if (isDoubleMode.value || isRoutineMode.value) {
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
      <button class="confirm-btn" :disabled="!canStart()" @click="confirm">{{ t('playerOpt.ready') }} &rarr;</button>
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
        <section class="player-card p1-card" :class="{ disabled: !game.hasPlayer1 }">
          <div class="player-card-header">
            <h3>{{ t('playerOpt.player1') }}</h3>
            <span class="player-side-hint">{{ t('playerOpt.p1Left') }}</span>
            <label class="toggle-switch" :title="canDisableP1 ? '' : t('playerOpt.cannotDisableBoth')">
              <input type="checkbox" :checked="game.hasPlayer1" @change="togglePlayer1(($event.target as HTMLInputElement).checked)" :disabled="!canDisableP1 && game.hasPlayer1" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="player-card-body" v-if="game.hasPlayer1">
            <!-- Difficulty -->
            <div class="sub-section">
              <span class="sub-label">{{ t('playerOpt.difficulty') }}</span>
              <div class="diff-grid">
                <button v-for="chart in chartsForPlayMode" :key="chart.chartIndex"
                  class="diff-chip" :class="{ active: game.p1ChartIndex === chart.chartIndex }"
                  @click="game.p1ChartIndex = chart.chartIndex">
                  {{ difficultyLabel(chart.difficulty) }} {{ chart.meter }}
                </button>
              </div>
            </div>

            <!-- Speed -->
            <div class="sub-section">
              <span class="sub-label">{{ t('playerOpt.speed') }} <HelpTooltip helpKey="speed" /></span>
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
            <div class="setting-row" v-if="isSingleMode || isDoubleMode">
              <span class="setting-label">{{ t('playerOpt.colorScheme') }} <HelpTooltip helpKey="colorScheme" /></span>
              <div class="chip-grid-inline">
                <button v-for="ns in availableSkins" :key="ns"
                  class="chip-sm" :class="{ active: game.player1Config.noteskin === ns }"
                  @click="game.player1Config.noteskin = ns">{{ noteskinLabel(ns) }}</button>
              </div>
            </div>

            <!-- Note Style -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.noteStyle') }}</span>
              <div class="chip-grid-inline">
                <button v-for="st in NOTE_STYLES" :key="st"
                  class="chip-sm" :class="{ active: game.player1Config.noteStyle === st }"
                  @click="game.player1Config.noteStyle = st">{{ noteStyleLabel(st) }}</button>
              </div>
            </div>

            <!-- Note colors by chart layer: Routine only -->
            <div class="setting-row" v-if="isRoutineMode">
              <span class="setting-label">{{ t('playerOpt.routineP1Color') }} <HelpTooltip helpKey="routineLayerP1" /></span>
              <div class="color-picker">
                <button v-for="color in ROUTINE_PLAYER_COLORS" :key="color.id"
                  class="color-btn" :class="{ active: game.routineP1ColorId === color.id, 'color-unavailable': game.routineP2ColorId === color.id }"
                  :style="{ backgroundColor: color.hex }"
                  :title="game.routineP2ColorId === color.id ? t('playerOpt.colorTakenByP2') : routineColorTitle(color.id)"
                  @click="selectP1Color(color.id)" />
              </div>
            </div>

            <!-- Note Scale -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.noteScale') }}</span>
              <div class="chip-grid-inline">
                <button v-for="sc in NOTE_SCALE_OPTIONS" :key="sc"
                  class="chip-sm" :class="{ active: game.player1Config.noteScale === sc }"
                  @click="game.player1Config.noteScale = sc">{{ sc }}x</button>
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
          </div>
          <div v-else class="player-card-disabled-body">
            <span>{{ t('playerOpt.disabled') }}</span>
          </div>
        </section>

        <!-- ═══════ PLAYER 2 CARD ═══════ -->
        <section class="player-card p2-card" :class="{ disabled: !game.hasPlayer2, locked: p2Locked && game.hasPlayer2 }">
          <div class="player-card-header">
            <h3>{{ t('playerOpt.player2') }}</h3>
            <span class="player-side-hint">{{ t('playerOpt.p2Right') }}</span>
            <!-- In double/routine modes, toggle is disabled but visible -->
            <label class="toggle-switch" :class="{ 'toggle-disabled': p2Locked || (!canDisableP2 && game.hasPlayer2) }" :title="canDisableP2 ? '' : t('playerOpt.cannotDisableBoth')">
              <input type="checkbox" :checked="game.hasPlayer2" @change="togglePlayer2(($event.target as HTMLInputElement).checked)" :disabled="p2Locked || (!canDisableP2 && game.hasPlayer2)" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <!-- Routine mode: P2 can only set accent color; order matches P1 -->
          <div v-if="isRoutineMode && game.hasPlayer2" class="player-card-body locked-content">
            <!-- Difficulty (read-only display) -->
            <div class="sub-section">
              <span class="sub-label">{{ t('playerOpt.difficulty') }}</span>
              <div class="diff-grid locked">
                <button v-for="chart in chartsForPlayMode" :key="chart.chartIndex"
                  class="diff-chip" :class="{ active: game.p1ChartIndex === chart.chartIndex }" :disabled="true">
                  {{ difficultyLabel(chart.difficulty) }} {{ chart.meter }}
                </button>
              </div>
            </div>

            <!-- Speed (read-only) -->
            <div class="sub-section">
              <span class="sub-label">{{ t('playerOpt.speed') }}</span>
              <div class="speed-mod-rows">
                <div class="chip-grid-inline locked">
                  <button v-for="mod in SPEED_MODS_C" :key="mod"
                    class="chip-sm" :class="{ active: game.player1Config.speedMod === mod }" :disabled="true">{{ mod }}</button>
                </div>
                <div class="chip-grid-inline locked">
                  <button v-for="mod in SPEED_MODS_X" :key="mod"
                    class="chip-sm" :class="{ active: game.player1Config.speedMod === mod }" :disabled="true">{{ mod }}</button>
                </div>
              </div>
            </div>

            <!-- Note Style (read-only) -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.noteStyle') }}</span>
              <div class="chip-grid-inline locked">
                <button v-for="st in NOTE_STYLES" :key="st"
                  class="chip-sm" :class="{ active: game.player1Config.noteStyle === st }" :disabled="true">{{ noteStyleLabel(st) }}</button>
              </div>
            </div>

            <!-- P2 note color (layer 2) -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.routineP2Color') }} <HelpTooltip helpKey="routineLayerP2" /></span>
              <div class="color-picker">
                <button v-for="color in availableP2Colors" :key="color.id"
                  class="color-btn" :class="{ active: game.routineP2ColorId === color.id }"
                  :style="{ backgroundColor: color.hex }"
                  :title="routineColorTitle(color.id)"
                  @click="selectP2Color(color.id)" />
              </div>
            </div>

            <!-- Note Scale (read-only) -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.noteScale') }}</span>
              <div class="chip-grid-inline locked">
                <button v-for="sc in NOTE_SCALE_OPTIONS" :key="sc"
                  class="chip-sm" :class="{ active: game.player1Config.noteScale === sc }" :disabled="true">{{ sc }}x</button>
              </div>
            </div>

            <!-- Toggles (read-only) -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.reverse') }}</span>
              <label class="toggle-switch toggle-disabled"><input type="checkbox" :checked="game.player1Config.reverse" :disabled="true" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.mirror') }}</span>
              <label class="toggle-switch toggle-disabled"><input type="checkbox" :checked="game.player1Config.mirror" :disabled="true" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.sudden') }}</span>
              <label class="toggle-switch toggle-disabled"><input type="checkbox" :checked="game.player1Config.sudden" :disabled="true" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.hidden') }}</span>
              <label class="toggle-switch toggle-disabled"><input type="checkbox" :checked="game.player1Config.hidden" :disabled="true" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.rotate') }}</span>
              <label class="toggle-switch toggle-disabled"><input type="checkbox" :checked="game.player1Config.rotate" :disabled="true" /><span class="toggle-slider"></span></label>
            </div>
          </div>

          <!-- Double mode: P2 settings are locked (grayed out) -->
          <div class="player-card-body locked-content" v-else-if="isDoubleMode && game.hasPlayer2">
            <!-- Difficulty (read-only display) -->
            <div class="sub-section">
              <span class="sub-label">{{ t('playerOpt.difficulty') }}</span>
              <div class="diff-grid locked">
                <button v-for="chart in chartsForPlayMode" :key="chart.chartIndex"
                  class="diff-chip" :class="{ active: game.p1ChartIndex === chart.chartIndex }" :disabled="true">
                  {{ difficultyLabel(chart.difficulty) }} {{ chart.meter }}
                </button>
              </div>
            </div>

            <!-- Speed (read-only) -->
            <div class="sub-section">
              <span class="sub-label">{{ t('playerOpt.speed') }}</span>
              <div class="speed-mod-rows">
                <div class="chip-grid-inline locked">
                  <button v-for="mod in SPEED_MODS_C" :key="mod"
                    class="chip-sm" :class="{ active: game.player1Config.speedMod === mod }" :disabled="true">{{ mod }}</button>
                </div>
                <div class="chip-grid-inline locked">
                  <button v-for="mod in SPEED_MODS_X" :key="mod"
                    class="chip-sm" :class="{ active: game.player1Config.speedMod === mod }" :disabled="true">{{ mod }}</button>
                </div>
              </div>
            </div>

            <!-- Color scheme (read-only, follows P1) -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.colorScheme') }} <HelpTooltip helpKey="colorScheme" /></span>
              <div class="chip-grid-inline locked">
                <button v-for="ns in availableSkins" :key="ns"
                  class="chip-sm" :class="{ active: game.player1Config.noteskin === ns }" :disabled="true">{{ noteskinLabel(ns) }}</button>
              </div>
            </div>

            <!-- Note Style (read-only) -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.noteStyle') }}</span>
              <div class="chip-grid-inline locked">
                <button v-for="st in NOTE_STYLES" :key="st"
                  class="chip-sm" :class="{ active: game.player1Config.noteStyle === st }" :disabled="true">{{ noteStyleLabel(st) }}</button>
              </div>
            </div>

            <!-- Note Scale (read-only) -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.noteScale') }}</span>
              <div class="chip-grid-inline locked">
                <button v-for="sc in NOTE_SCALE_OPTIONS" :key="sc"
                  class="chip-sm" :class="{ active: game.player1Config.noteScale === sc }" :disabled="true">{{ sc }}x</button>
              </div>
            </div>

            <!-- Toggles (read-only) -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.reverse') }}</span>
              <label class="toggle-switch toggle-disabled"><input type="checkbox" :checked="game.player1Config.reverse" :disabled="true" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.mirror') }}</span>
              <label class="toggle-switch toggle-disabled"><input type="checkbox" :checked="game.player1Config.mirror" :disabled="true" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.sudden') }}</span>
              <label class="toggle-switch toggle-disabled"><input type="checkbox" :checked="game.player1Config.sudden" :disabled="true" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.hidden') }}</span>
              <label class="toggle-switch toggle-disabled"><input type="checkbox" :checked="game.player1Config.hidden" :disabled="true" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.rotate') }}</span>
              <label class="toggle-switch toggle-disabled"><input type="checkbox" :checked="game.player1Config.rotate" :disabled="true" /><span class="toggle-slider"></span></label>
            </div>
          </div>

          <!-- Single mode: P2 has independent settings -->
          <div class="player-card-body" v-else-if="isSingleMode && game.hasPlayer2">
            <!-- Difficulty -->
            <div class="sub-section">
              <span class="sub-label">{{ t('playerOpt.difficulty') }}</span>
              <div class="diff-grid">
                <button v-for="chart in chartsForPlayMode" :key="chart.chartIndex"
                  class="diff-chip" :class="{ active: game.p2ChartIndex === chart.chartIndex }"
                  @click="game.p2ChartIndex = chart.chartIndex">
                  {{ difficultyLabel(chart.difficulty) }} {{ chart.meter }}
                </button>
              </div>
            </div>

            <!-- Speed -->
            <div class="sub-section">
              <span class="sub-label">{{ t('playerOpt.speed') }} <HelpTooltip helpKey="speed" /></span>
              <div class="speed-mod-rows">
                <div class="chip-grid-inline">
                  <button v-for="mod in SPEED_MODS_C" :key="mod"
                    class="chip-sm" :class="{ active: game.player2Config.speedMod === mod }"
                    @click="game.player2Config.speedMod = mod">{{ mod }}</button>
                </div>
                <div class="chip-grid-inline">
                  <button v-for="mod in SPEED_MODS_X" :key="mod"
                    class="chip-sm" :class="{ active: game.player2Config.speedMod === mod }"
                    @click="game.player2Config.speedMod = mod">{{ mod }}</button>
                </div>
              </div>
            </div>

            <!-- Color scheme -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.colorScheme') }} <HelpTooltip helpKey="colorScheme" /></span>
              <div class="chip-grid-inline">
                <button v-for="ns in availableSkins" :key="ns"
                  class="chip-sm" :class="{ active: game.player2Config.noteskin === ns }"
                  @click="game.player2Config.noteskin = ns">{{ noteskinLabel(ns) }}</button>
              </div>
            </div>

            <!-- Note Style -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.noteStyle') }}</span>
              <div class="chip-grid-inline">
                <button v-for="st in NOTE_STYLES" :key="st"
                  class="chip-sm" :class="{ active: game.player2Config.noteStyle === st }"
                  @click="game.player2Config.noteStyle = st">{{ noteStyleLabel(st) }}</button>
              </div>
            </div>

            <!-- Note Scale -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.noteScale') }}</span>
              <div class="chip-grid-inline">
                <button v-for="sc in NOTE_SCALE_OPTIONS" :key="sc"
                  class="chip-sm" :class="{ active: game.player2Config.noteScale === sc }"
                  @click="game.player2Config.noteScale = sc">{{ sc }}x</button>
              </div>
            </div>

            <!-- Toggles -->
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.reverse') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player2Config.reverse" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.mirror') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player2Config.mirror" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.sudden') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player2Config.sudden" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.hidden') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player2Config.hidden" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">{{ t('playerOpt.rotate') }}</span>
              <label class="toggle-switch"><input type="checkbox" v-model="game.player2Config.rotate" /><span class="toggle-slider"></span></label>
            </div>
          </div>
          <div v-else class="player-card-disabled-body">
            <span>{{ t('playerOpt.disabled') }}</span>
          </div>
        </section>
      </div>

      <!-- ═══════ SHARED SETTINGS ═══════ -->

      <!-- Playback Rate -->
      <section class="option-card">
        <h3>{{ t('playerOpt.playbackRate') }} <HelpTooltip helpKey="playbackRate" /></h3>
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
          <span class="setting-label">{{ t('playerOpt.autoPlay') }} <HelpTooltip helpKey="autoPlay" /></span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="game.autoPlay" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <span class="setting-label">{{ t('playerOpt.sfx') }}</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="game.rhythmSfxEnabled" />
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
.player-side-hint {
  flex: 1; font-size: 0.6rem; color: rgba(255,255,255,0.2);
  text-align: right; margin-right: 0.5rem;
}

.player-card-body { padding: 0.65rem 0.85rem; }
.player-card-disabled-body {
  padding: 2rem 1rem; text-align: center;
  color: rgba(255,255,255,0.2); font-size: 0.8rem;
}

.sub-section { margin-bottom: 0.5rem; }
.sub-label {
  display: flex; align-items: center; gap: 0.3rem;
  font-size: 0.65rem; letter-spacing: 0.15em; color: rgba(255,255,255,0.3);
  margin-bottom: 0.35rem; text-transform: uppercase;
}

.diff-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.diff-chip {
  padding: 0.25rem 0.55rem; border-radius: 6px;
  font-size: 0.72rem; font-weight: 600;
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
.setting-label { font-size: 0.78rem; color: rgba(255,255,255,0.7); display: flex; align-items: center; gap: 0.3rem; }

.toggle-switch { position: relative; width: 42px; height: 22px; cursor: pointer; flex-shrink: 0; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; inset: 0; background: rgba(255,255,255,0.1); border-radius: 22px; transition: 0.2s; }
.toggle-slider::before { content: ''; position: absolute; width: 16px; height: 16px; left: 3px; bottom: 3px; background: rgba(255,255,255,0.5); border-radius: 50%; transition: 0.2s; }
.toggle-switch input:checked + .toggle-slider { background: var(--primary-color); }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(20px); background: var(--text-on-primary); }
.toggle-switch input:disabled + .toggle-slider { opacity: 0.4; cursor: not-allowed; }

/* Disabled toggle state */
.toggle-disabled { cursor: not-allowed; }
.toggle-disabled .toggle-slider { background: rgba(100,100,100,0.3); }
.toggle-disabled .toggle-slider::before { background: rgba(150,150,150,0.5); }

.chip-grid-inline { display: flex; flex-wrap: wrap; gap: 4px; }
.speed-mod-rows { display: flex; flex-direction: column; gap: 8px; }
.chip-sm { padding: 0.2rem 0.45rem; font-size: 0.7rem; border-radius: 5px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); color: rgba(255,255,255,0.45); cursor: pointer; transition: all 0.1s; }
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
.color-btn.color-unavailable { opacity: 0.3; cursor: not-allowed; }
.color-btn.color-unavailable:hover { transform: none; }

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
