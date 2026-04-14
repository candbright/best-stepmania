<script setup lang="ts">
import { ref, computed, onUnmounted, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/i18n";
import { useGameStore } from "@/stores/game";
import { useLibraryStore } from "@/stores/library";
import type { RhythmSfxStyle } from "@/api/config";
import {
  previewMetronomeSfx,
  previewRhythmSfx,
  previewUiSfx,
  playMenuConfirm,
} from "@/utils/sfx";

import HelpTooltip from "@/components/HelpTooltip.vue";
import CustomSelect from "@/components/CustomSelect.vue";
import AppNumberField from "@/components/AppNumberField.vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import SettingsRangeRow from "@/components/settings/SettingsRangeRow.vue";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow.vue";
import SettingsSelectRow from "@/components/settings/SettingsSelectRow.vue";
import SettingsResetRow from "@/components/settings/SettingsResetRow.vue";
import { APP_THEME_IDS } from "@/constants/appThemes";
import KeyChordPicker from "@/components/KeyChordPicker.vue";
import type { KeyChord, ShortcutId } from "@/engine/keyBindings";
import { logOptionalRejection } from "@/utils/devLog";
import { WINDOW_DISPLAY_PRESET_IDS } from "@/constants/windowDisplay";
import {
  SHORTCUT_DEFAULTS,
  mergeShortcutBindings,
  bindingsEqual,
  bindingToChordList,
  resolveGameplayPumpDoubleLanes,
  GAMEPLAY_10_LANE_DEFAULT_CODES,
} from "@/engine/keyBindings";
import { useConfirmDialog } from "@/composables/useConfirmDialog";
import { useSettingsSaveQueue } from "@/composables/useSettingsSaveQueue";
import { useAppSettingsSync } from "@/composables/useAppSettingsSync";
import { useSfxPreviewGate } from "@/composables/useSfxPreviewGate";
import { exportDiagnosticsAndOpen } from "@/services/tauri/diagnostics";

const router = useRouter();
const { t } = useI18n();
const game = useGameStore();
const library = useLibraryStore();

const {
  open: confirmDialogOpen,
  title: confirmDialogTitle,
  message: confirmDialogMessage,
  bullets: confirmDialogBullets,
  confirmText: confirmDialogConfirmText,
  busy: confirmDialogBusy,
  requestConfirm,
  close: closeConfirmDialog,
  accept: confirmDialogAccept,
} = useConfirmDialog();
const { schedule, flush } = useSettingsSaveQueue(() => game.saveAppConfig(), 800);
const { stopAll: stopAppSettingsSync } = useAppSettingsSync(game, schedule);
const sfxGate = useSfxPreviewGate();

const SHORTCUT_SECTIONS: {
  titleKey: string;
  rows: { id: ShortcutId; labelKey: string }[];
}[] = [
  {
    titleKey: "settings.keybindings.sectionGlobal",
    rows: [
      { id: "global.back", labelKey: "settings.keybindings.globalBack" },
      { id: "title.confirm", labelKey: "settings.keybindings.titleConfirm" },
    ],
  },
  {
    titleKey: "settings.keybindings.sectionGameplayScreen",
    rows: [
      { id: "gameplay.devPanel", labelKey: "settings.keybindings.gameplayDevPanel" },
      { id: "gameplay.pause", labelKey: "settings.keybindings.gameplayPause" },
    ],
  },
  {
    titleKey: "settings.keybindings.sectionEditor",
    rows: [
      { id: "editor.undo", labelKey: "settings.keybindings.editorUndo" },
      { id: "editor.redo", labelKey: "settings.keybindings.editorRedo" },
      { id: "editor.save", labelKey: "settings.keybindings.editorSave" },
      { id: "editor.copy", labelKey: "settings.keybindings.editorCopy" },
      { id: "editor.cut", labelKey: "settings.keybindings.editorCut" },
      { id: "editor.paste", labelKey: "settings.keybindings.editorPaste" },
      { id: "editor.selectAll", labelKey: "settings.keybindings.editorSelectAll" },
      { id: "editor.delete", labelKey: "settings.keybindings.editorDelete" },
      { id: "editor.back", labelKey: "settings.keybindings.editorBack" },
      { id: "editor.playPause", labelKey: "settings.keybindings.editorPlayPause" },
      { id: "editor.scrollUp", labelKey: "settings.keybindings.editorScrollUp" },
      { id: "editor.scrollDown", labelKey: "settings.keybindings.editorScrollDown" },
      { id: "editor.quantizeUp", labelKey: "settings.keybindings.editorQuantizeUp" },
      { id: "editor.quantizeDown", labelKey: "settings.keybindings.editorQuantizeDown" },
      { id: "editor.zoomIn", labelKey: "settings.keybindings.editorZoomIn" },
      { id: "editor.zoomOut", labelKey: "settings.keybindings.editorZoomOut" },
      { id: "editor.flipH", labelKey: "settings.keybindings.editorFlipH" },
      { id: "editor.flipV", labelKey: "settings.keybindings.editorFlipV" },
      { id: "editor.flipD", labelKey: "settings.keybindings.editorFlipD" },
      { id: "editor.routineLayer1", labelKey: "settings.keybindings.editorRoutineLayer1" },
      { id: "editor.routineLayer2", labelKey: "settings.keybindings.editorRoutineLayer2" },
      { id: "editor.clearSelection", labelKey: "settings.keybindings.editorClearSelection" },
      { id: "editor.previewPlay", labelKey: "settings.keybindings.editorPreviewPlay" },
      { id: "editor.addBeat", labelKey: "settings.keybindings.editorAddBeat" },
      { id: "editor.deleteBeat", labelKey: "settings.keybindings.editorDeleteBeat" },
    ],
  },
  {
    titleKey: "settings.keybindings.sectionEditorNotes",
    rows: [
      { id: "editor.noteType1", labelKey: "settings.keybindings.editorNoteType1" },
      { id: "editor.noteType2", labelKey: "settings.keybindings.editorNoteType2" },
      { id: "editor.noteType3", labelKey: "settings.keybindings.editorNoteType3" },
      { id: "editor.noteType4", labelKey: "settings.keybindings.editorNoteType4" },
    ],
  },
];

function chordsForShortcut(id: ShortcutId): KeyChord[] {
  return bindingToChordList(mergeShortcutBindings(game.shortcutOverrides)[id]);
}

function applyShortcut(id: ShortcutId, chords: KeyChord[]) {
  const def = SHORTCUT_DEFAULTS[id];
  const next = { ...game.shortcutOverrides };
  if (bindingsEqual(chords, def)) {
    delete next[id];
  } else {
    next[id] = chords.map((c) => ({ ...c }));
  }
  game.shortcutOverrides = next;
}

function laneChordsForIndex(i: number): KeyChord[] {
  const lanes = resolveGameplayPumpDoubleLanes(game.gameplayPumpDoubleLanes);
  const fallback = GAMEPLAY_10_LANE_DEFAULT_CODES[i] ?? "KeyZ";
  return [{ code: lanes[i] ?? fallback }];
}

function applyLaneCode(i: number, chords: KeyChord[]) {
  const code = chords[0]?.code?.trim() ?? "";
  const base = [...resolveGameplayPumpDoubleLanes(game.gameplayPumpDoubleLanes)];
  base[i] = code.length > 0 ? code : base[i] ?? "KeyZ";
  game.gameplayPumpDoubleLanes = base;
}

const canResetKeyBindings = computed(() => {
  const hasLaneOverrides = game.gameplayPumpDoubleLanes !== null;
  const hasShortcutOverrides = Object.keys(game.shortcutOverrides).length > 0;
  return hasLaneOverrides || hasShortcutOverrides;
});

const canResetCursorCoreSettings = computed(() => {
  return (
    game.cursorEnabled !== true ||
    game.cursorStylePreset !== "a" ||
    game.cursorScale !== 1 ||
    game.cursorOpacity !== 0.9 ||
    game.cursorGlow !== 0.35 ||
    game.cursorTrailsEnabled !== true
  );
});

const canResetClickEffectSettings = computed(() => {
  return (
    game.cursorRippleEnabled !== true ||
    game.cursorRippleDurationMs !== 480 ||
    game.cursorRippleMinScale !== 0.65 ||
    game.cursorRippleMaxScale !== 6.2 ||
    game.cursorRippleOpacity !== 0.7 ||
    game.cursorRippleLineWidth !== 1 ||
    game.cursorRippleGlow !== 0.26
  );
});

const uiSfxStyleOptions = computed(() => [
  { label: t("settings.uiSfxStyleOption.classic"), value: "classic" },
  { label: t("settings.uiSfxStyleOption.soft"), value: "soft" },
  { label: t("settings.uiSfxStyleOption.arcade"), value: "arcade" },
]);

const metronomeSfxStyleOptions = computed(() => [
  { label: t("settings.metronomeSfxStyleOption.warm"), value: "warm" },
  { label: t("settings.metronomeSfxStyleOption.bright"), value: "bright" },
  { label: t("settings.metronomeSfxStyleOption.crisp"), value: "crisp" },
]);

const rhythmSfxStyleOptions = computed(() => [
  { label: t("settings.rhythmSfxStyleOption.warm"), value: "warm" },
  { label: t("settings.rhythmSfxStyleOption.bright"), value: "bright" },
  { label: t("settings.rhythmSfxStyleOption.crisp"), value: "crisp" },
]);

const windowDisplayPresetOptions = computed(() =>
  WINDOW_DISPLAY_PRESET_IDS.map((id) => ({
    label: t(`settings.windowPreset.${id}`),
    value: id,
  })),
);

const targetFpsOptions = [
  { label: t("settings.targetFpsUnlimited"), value: 0 },
  { label: "60", value: 60 },
  { label: "120", value: 120 },
  { label: "144", value: 144 },
  { label: "240", value: 240 },
];

const cursorStylePresetOptions = computed(() => [
  { label: t("settings.cursorStylePresetOption.a"), value: "a" },
  { label: t("settings.cursorStylePresetOption.b"), value: "b" },
]);

const languageOptions = computed(() => [
  { label: t("settings.languageOption.zh-CN"), value: "zh-CN" },
  { label: t("settings.languageOption.en"), value: "en" },
]);

const themeOptions = computed(() => APP_THEME_IDS.map((tid) => ({ label: t(`settings.themeOption.${tid}`), value: tid })));

const judgmentStyleOptions = computed(() => [
  { label: t("settings.judgmentStyle.ddr"), value: "ddr" },
  { label: t("settings.judgmentStyle.itg"), value: "itg" },
]);

const lifeTypeOptions = computed(() => [
  { label: t("settings.lifeType.bar"), value: "bar" },
  { label: t("settings.lifeType.battery"), value: "battery" },
  { label: t("settings.lifeType.survival"), value: "survival" },
]);

const batteryLivesOptions = computed(() => Array.from({ length: 10 }, (_, i) => ({ label: `${i + 1}`, value: i + 1 })));

const diagnosticsItems = computed(() => [
  t("settings.exportDiagnosticsItem.systemInfo"),
  t("settings.exportDiagnosticsItem.config"),
  t("settings.exportDiagnosticsItem.databases"),
  t("settings.exportDiagnosticsItem.recoveryBackups"),
  t("settings.exportDiagnosticsItem.logs"),
  t("settings.exportDiagnosticsItem.songLibrary"),
  t("settings.exportDiagnosticsItem.scanState"),
  t("settings.exportDiagnosticsItem.noteskins"),
  t("settings.exportDiagnosticsItem.chartCache"),
]);

function resetAllKeyBindings() {
  game.gameplayPumpDoubleLanes = null;
  game.shortcutOverrides = {};
}

async function resetAllSettings() {
  try {
    await game.resetAllSettingsToDefaults();
    await game.loadSongs(undefined, { force: true });
  } catch (e: unknown) {
    console.error(e);
  }
}

function resetCursorCoreSettings() {
  game.cursorEnabled = true;
  game.cursorStylePreset = "a";
  game.cursorScale = 1;
  game.cursorOpacity = 0.9;
  game.cursorGlow = 0.35;
  game.cursorTrailsEnabled = true;
}

function resetClickEffectSettings() {
  game.cursorRippleEnabled = true;
  game.cursorRippleDurationMs = 480;
  game.cursorRippleMinScale = 0.65;
  game.cursorRippleMaxScale = 6.2;
  game.cursorRippleOpacity = 0.7;
  game.cursorRippleLineWidth = 1;
  game.cursorRippleGlow = 0.26;
}

function onResetAllKeyBindings() {
  if (!canResetKeyBindings.value) return;
  requestConfirm({
    title: t("settings.keybindings.resetAll"),
    message: t("settings.keybindings.resetAllConfirm"),
    confirmText: t("settings.keybindings.resetAll"),
    onConfirm: () => {
      resetAllKeyBindings();
    },
  });
}

function onResetAllSettings() {
  requestConfirm({
    title: t("settings.resetAllSettings"),
    message: t("settings.resetAllSettingsConfirm"),
    confirmText: t("settings.resetAllSettings"),
    onConfirm: () => resetAllSettings(),
  });
}

function onResetCursorCoreSettings() {
  if (!canResetCursorCoreSettings.value) return;
  requestConfirm({
    title: t("settings.cursor.resetAll"),
    message: t("settings.cursor.resetCoreConfirm"),
    confirmText: t("settings.cursor.resetAll"),
    onConfirm: () => resetCursorCoreSettings(),
  });
}

function onResetClickEffectSettings() {
  if (!canResetClickEffectSettings.value) return;
  requestConfirm({
    title: t("settings.cursor.resetAll"),
    message: t("settings.cursor.resetClickEffectConfirm"),
    confirmText: t("settings.cursor.resetAll"),
    onConfirm: () => resetClickEffectSettings(),
  });
}

function toggleClickEffectEnabledFromSectionHead() {
  game.cursorRippleEnabled = !(game.cursorRippleEnabled ?? true);
}

function previewUiSfxFromSettings() {
  sfxGate.tryRun(() => previewUiSfx());
}

function previewRhythmSfxFromSettings() {
  sfxGate.tryRun(() => previewRhythmSfx());
}

function previewMetronomeSfxFromSettings() {
  sfxGate.tryRun(() => previewMetronomeSfx());
}

function playControlClickSfx() {
  sfxGate.tryRun(() => playMenuConfirm());
}

function playToggleClickSfx() {
  sfxGate.tryRun(() => playMenuConfirm());
}

function playSliderClickSfx() {
  sfxGate.tryRun(() => playMenuConfirm());
}

onMounted(() => {
  if (library.packs.length === 0) {
    void library.loadPacks().catch((e) => logOptionalRejection("options.prefetchSongPacks", e));
  }
});

onUnmounted(() => {
  stopAppSettingsSync();
  flush();
});

function goBack() {
  router.push("/");
}

async function runExportDiagnostics() {
  try {
    await exportDiagnosticsAndOpen();
  } catch (e: unknown) {
    console.error("Failed to export diagnostics:", e);
  }
}

function onExportDiagnostics() {
  requestConfirm({
    title: t("settings.exportDiagnostics"),
    message: t("settings.exportDiagnosticsConfirm"),
    bullets: diagnosticsItems.value,
    confirmText: t("confirm"),
    onConfirm: () => runExportDiagnostics(),
  });
}

function formatGameplayLane(n: number): string {
  return t("settings.keybindings.gameplayLane").replace("{n}", String(n));
}

type SettingsCategoryId = "general" | "content" | "audio" | "display" | "game" | "keyboard" | "about";

const SETTING_CATEGORIES: { id: SettingsCategoryId; labelKey: string }[] = [
  { id: "general", labelKey: "settings.gameplay" },
  { id: "content", labelKey: "settings.contentManagement" },
  { id: "audio", labelKey: "settings.audio" },
  { id: "display", labelKey: "settings.display" },
  { id: "game", labelKey: "settings.game" },
  { id: "keyboard", labelKey: "settings.keybindings.title" },
  { id: "about", labelKey: "settings.about" },
];

const activeCategory = ref<SettingsCategoryId>("general");
</script>

<template>
  <div class="options-screen">
    <header class="top-bar">
      <div class="top-bar-lead">
        <button type="button" class="tb-btn" @click="playControlClickSfx(); goBack()">←</button>
      </div>
      <h2 class="top-bar-title">{{ t('settings.title') }}</h2>
      <div class="top-bar-trail" aria-hidden="true" />
    </header>

    <div class="settings-body">
      <nav class="category-nav" role="tablist" :aria-label="t('settings.title')">
        <button
          v-for="cat in SETTING_CATEGORIES"
          :key="cat.id"
          type="button"
          role="tab"
          class="category-tab"
          :class="{ active: activeCategory === cat.id }"
          :aria-selected="activeCategory === cat.id"
          @click="activeCategory = cat.id; playControlClickSfx()"
        >
          {{ t(cat.labelKey) }}
        </button>
      </nav>

      <div class="category-panel" role="tabpanel">
        <div class="sections">
          <SettingsSection v-show="activeCategory === 'content'" class="nav-section">
            <h3>{{ t('settings.contentManagement') }}</h3>
            <button class="nav-item" @click="playControlClickSfx(); router.push('/song-packs')">
              <span class="nav-icon">&#x1F3B5;</span>
              <div class="nav-info">
                <span class="nav-title">{{ t('settings.manageSongPacks') }}</span>
                <span class="nav-desc">{{ t('settings.manageSongPacksDesc') }}</span>
              </div>
              <span class="nav-arrow">&rsaquo;</span>
            </button>
          </SettingsSection>

          <SettingsSection v-show="activeCategory === 'audio'" :title="t('settings.audio')">
            <SettingsRangeRow
              :label="t('settings.masterVolume')"
              help-key="masterVolume"
              :model-value="game.masterVolume"
              :min="0"
              :max="100"
              :display-value="`${game.masterVolume}%`"
              :on-interact="playSliderClickSfx"
              @update:model-value="(v) => (game.masterVolume = v)"
            />
            <SettingsRangeRow
              :label="t('settings.musicVolume')"
              help-key="musicVolume"
              :model-value="game.musicVolume"
              :min="0"
              :max="100"
              :display-value="`${game.musicVolume}%`"
              :on-interact="playSliderClickSfx"
              @update:model-value="(v) => (game.musicVolume = v)"
            />
            <SettingsRangeRow
              :label="t('settings.effectVolume')"
              help-key="effectVolume"
              :model-value="game.effectVolume"
              :min="0"
              :max="100"
              :display-value="`${game.effectVolume}%`"
              :on-interact="playSliderClickSfx"
              @update:model-value="(v) => (game.effectVolume = v)"
            />
            <div class="setting-row">
              <label>{{ t('settings.audioOffset') }} <HelpTooltip help-key="audioOffset" /></label>
              <AppNumberField
                v-model="game.audioOffsetMs"
                input-class="audio-offset-ms-input"
                :step="1"
                hide-steppers
              />
            </div>
          </SettingsSection>

          <SettingsSection v-show="activeCategory === 'audio'">
            <template #head>
              <div class="section-head">
                <h3>{{ t('settings.metronomeSfx') }}</h3>
                <label class="toggle-switch section-head-toggle" :title="t('settings.metronomeSfxEnabled')">
                  <input type="checkbox" v-model="game.metronomeSfxEnabled" @change="playToggleClickSfx" />
                  <span class="toggle-slider" />
                </label>
              </div>
            </template>
            <SettingsRangeRow
              :label="t('settings.metronomeSfxVolume')"
              help-key="metronomeSfxVolume"
              :model-value="game.metronomeSfxVolume"
              :min="0"
              :max="100"
              :display-value="`${game.metronomeSfxVolume}%`"
              :disabled="!game.metronomeSfxEnabled"
              :on-interact="playSliderClickSfx"
              @update:model-value="(v) => (game.metronomeSfxVolume = v)"
            />
            <div class="setting-row">
              <label>
                {{ t('settings.metronomeSfxStyle') }}
                <button
                  type="button"
                  class="sfx-preview-icon-btn"
                  data-sfx="off"
                  :disabled="!game.metronomeSfxEnabled"
                  :title="t('settings.sfxPreviewMetronome')"
                  aria-label="preview metronome sfx"
                  @pointerup.stop.prevent="previewMetronomeSfxFromSettings"
                  @mousedown.stop.prevent
                >
                  ▶▶
                </button>
              </label>
              <CustomSelect
                :model-value="game.metronomeSfxStyle"
                :options="metronomeSfxStyleOptions"
                :disabled="!game.metronomeSfxEnabled"
                @update:model-value="(v) => (game.metronomeSfxStyle = v as RhythmSfxStyle)"
              />
            </div>
          </SettingsSection>

          <SettingsSection v-show="activeCategory === 'audio'">
            <template #head>
              <div class="section-head">
                <h3>{{ t('settings.rhythmSfx') }}</h3>
                <label class="toggle-switch section-head-toggle" :title="t('settings.rhythmSfxEnabled')">
                  <input type="checkbox" v-model="game.rhythmSfxEnabled" @change="playToggleClickSfx" />
                  <span class="toggle-slider" />
                </label>
              </div>
            </template>
            <SettingsRangeRow
              :label="t('settings.rhythmSfxVolume')"
              help-key="rhythmSfxVolume"
              :model-value="game.rhythmSfxVolume"
              :min="0"
              :max="100"
              :display-value="`${game.rhythmSfxVolume}%`"
              :disabled="!game.rhythmSfxEnabled"
              :on-interact="playSliderClickSfx"
              @update:model-value="(v) => (game.rhythmSfxVolume = v)"
            />
            <div class="setting-row">
              <label>
                {{ t('settings.rhythmSfxStyle') }}
                <button
                  type="button"
                  class="sfx-preview-icon-btn"
                  data-sfx="off"
                  :disabled="!game.rhythmSfxEnabled"
                  :title="t('settings.sfxPreviewRhythm')"
                  aria-label="preview rhythm sfx"
                  @pointerup.stop.prevent="previewRhythmSfxFromSettings"
                  @mousedown.stop.prevent
                >
                  ▶▶
                </button>
              </label>
              <CustomSelect
                :model-value="game.rhythmSfxStyle"
                :options="rhythmSfxStyleOptions"
                :disabled="!game.rhythmSfxEnabled"
                @update:model-value="(v) => (game.rhythmSfxStyle = v as RhythmSfxStyle)"
              />
            </div>
          </SettingsSection>

          <SettingsSection v-show="activeCategory === 'audio'">
            <template #head>
              <div class="section-head">
                <h3>{{ t('settings.uiSfxStyle') }}</h3>
                <label class="toggle-switch section-head-toggle" :title="t('settings.uiSfxEnabled')">
                  <input type="checkbox" v-model="game.uiSfxEnabled" @change="playToggleClickSfx" />
                  <span class="toggle-slider" />
                </label>
              </div>
            </template>
            <SettingsRangeRow
              :label="t('settings.uiSfxVolume')"
              :model-value="game.uiSfxVolume"
              :min="0"
              :max="100"
              :display-value="`${game.uiSfxVolume}%`"
              :disabled="!game.uiSfxEnabled"
              :on-interact="playSliderClickSfx"
              @update:model-value="(v) => (game.uiSfxVolume = v)"
            />
            <div class="setting-row">
              <label>
                {{ t('settings.uiSfxStyle') }}
                <button
                  type="button"
                  class="sfx-preview-icon-btn"
                  data-sfx="off"
                  :disabled="!game.uiSfxEnabled"
                  :title="t('settings.sfxPreviewPlay')"
                  aria-label="preview ui sfx"
                  @pointerup.stop.prevent="previewUiSfxFromSettings"
                  @mousedown.stop.prevent
                >
                  ▶▶
                </button>
              </label>
              <CustomSelect
                :model-value="game.uiSfxStyle"
                :options="uiSfxStyleOptions"
                :disabled="!game.uiSfxEnabled"
                @update:model-value="(v) => (game.uiSfxStyle = v as 'classic' | 'soft' | 'arcade')"
              />
            </div>
          </SettingsSection>

          <SettingsSection v-show="activeCategory === 'display'" :title="t('settings.display')">
            <SettingsSelectRow
              :label="t('settings.windowDisplayMode')"
              help-key="windowDisplay"
              :model-value="game.windowDisplayPreset"
              :options="windowDisplayPresetOptions"
              @update:model-value="(v) => (game.windowDisplayPreset = String(v) as typeof game.windowDisplayPreset)"
            />
            <SettingsToggleRow
              :label="t('settings.vsync')"
              help-key="vsync"
              :model-value="game.vsync"
              :on-toggle-sound="playToggleClickSfx"
              @update:model-value="(v) => (game.vsync = v)"
            />
            <SettingsSelectRow
              :label="t('settings.targetFps')"
              help-key="targetFps"
              :model-value="game.targetFps"
              :options="targetFpsOptions"
              @update:model-value="(v) => (game.targetFps = Number(v))"
            />
            <SettingsRangeRow
              :label="t('settings.uiScale')"
              help-key="uiScale"
              :model-value="Math.round(game.uiScale * 100)"
              :min="75"
              :max="150"
              :step="5"
              :display-value="`${Math.round(game.uiScale * 100)}%`"
              :on-interact="playSliderClickSfx"
              @update:model-value="(v) => (game.uiScale = v / 100)"
            />
          </SettingsSection>

          <SettingsSection v-show="activeCategory === 'display'">
            <template #head>
              <div class="section-head">
                <h3>{{ t('settings.cursor') }}</h3>
              </div>
            </template>
            <SettingsSelectRow
              :label="t('settings.cursorStylePreset')"
              help-key="cursorStylePreset"
              :model-value="game.cursorStylePreset"
              :options="cursorStylePresetOptions"
              @update:model-value="(v) => (game.cursorStylePreset = v as 'a' | 'b')"
            />
            <SettingsRangeRow
              :label="t('settings.cursorScale')"
              help-key="cursorScale"
              :model-value="Math.round(game.cursorScale * 100)"
              :min="70"
              :max="160"
              :step="5"
              :display-value="`${Math.round(game.cursorScale * 100)}%`"
              :on-interact="playSliderClickSfx"
              @update:model-value="(v) => (game.cursorScale = v / 100)"
            />
            <SettingsRangeRow
              :label="t('settings.cursorOpacity')"
              help-key="cursorOpacity"
              :model-value="Math.round(game.cursorOpacity * 100)"
              :min="10"
              :max="100"
              :step="1"
              :display-value="`${Math.round(game.cursorOpacity * 100)}%`"
              :on-interact="playSliderClickSfx"
              @update:model-value="(v) => (game.cursorOpacity = v / 100)"
            />
            <SettingsRangeRow
              :label="t('settings.cursorGlow')"
              help-key="cursorGlow"
              :model-value="Math.round(game.cursorGlow * 100)"
              :min="0"
              :max="100"
              :step="1"
              :display-value="`${Math.round(game.cursorGlow * 100)}%`"
              :on-interact="playSliderClickSfx"
              @update:model-value="(v) => (game.cursorGlow = v / 100)"
            />
            <SettingsResetRow
              variant="card"
              :disabled="!canResetCursorCoreSettings"
              @click="playControlClickSfx(); onResetCursorCoreSettings()"
            >
              {{ t('settings.cursor.resetAll') }}
            </SettingsResetRow>
          </SettingsSection>

          <SettingsSection v-show="activeCategory === 'display'">
            <template #head>
              <div class="section-head">
                <h3>{{ t('settings.clickEffect') }}</h3>
                <div class="section-head-actions">
                  <button
                    type="button"
                    class="toggle-switch ui-sfx-toggle-switch"
                    :class="{ active: game.cursorRippleEnabled }"
                    data-sfx="off"
                    :title="t('settings.cursorRippleEnabled')"
                    @click="playControlClickSfx(); toggleClickEffectEnabledFromSectionHead()"
                  >
                    <span class="toggle-slider" />
                  </button>
                </div>
              </div>
            </template>
            <template v-if="game.cursorRippleEnabled">
              <SettingsRangeRow
                :label="t('settings.cursorRippleDurationMs')"
                help-key="cursorRippleDurationMs"
                :model-value="game.cursorRippleDurationMs"
                :min="180"
                :max="1200"
                :step="10"
                :display-value="`${game.cursorRippleDurationMs}ms`"
                :on-interact="playSliderClickSfx"
                @update:model-value="(v) => (game.cursorRippleDurationMs = v)"
              />
              <SettingsRangeRow
                :label="t('settings.cursorRippleMinScale')"
                help-key="cursorRippleMinScale"
                :model-value="Math.round(game.cursorRippleMinScale * 100)"
                :min="20"
                :max="240"
                :step="5"
                :display-value="`${game.cursorRippleMinScale.toFixed(2)}x`"
                :on-interact="playSliderClickSfx"
                @update:model-value="(v) => (game.cursorRippleMinScale = v / 100)"
              />
              <SettingsRangeRow
                :label="t('settings.cursorRippleMaxScale')"
                help-key="cursorRippleMaxScale"
                :model-value="Math.round(game.cursorRippleMaxScale * 100)"
                :min="120"
                :max="1200"
                :step="10"
                :display-value="`${game.cursorRippleMaxScale.toFixed(2)}x`"
                :on-interact="playSliderClickSfx"
                @update:model-value="(v) => (game.cursorRippleMaxScale = v / 100)"
              />
              <SettingsRangeRow
                :label="t('settings.cursorRippleOpacity')"
                help-key="cursorRippleOpacity"
                :model-value="Math.round(game.cursorRippleOpacity * 100)"
                :min="0"
                :max="100"
                :step="1"
                :display-value="`${Math.round(game.cursorRippleOpacity * 100)}%`"
                :on-interact="playSliderClickSfx"
                @update:model-value="(v) => (game.cursorRippleOpacity = v / 100)"
              />
              <SettingsRangeRow
                :label="t('settings.cursorRippleLineWidth')"
                help-key="cursorRippleLineWidth"
                :model-value="Math.round(game.cursorRippleLineWidth * 10)"
                :min="5"
                :max="30"
                :step="1"
                :display-value="`${game.cursorRippleLineWidth.toFixed(1)}px`"
                :on-interact="playSliderClickSfx"
                @update:model-value="(v) => (game.cursorRippleLineWidth = v / 10)"
              />
              <SettingsRangeRow
                :label="t('settings.cursorRippleGlow')"
                help-key="cursorRippleGlow"
                :model-value="Math.round(game.cursorRippleGlow * 100)"
                :min="0"
                :max="100"
                :step="1"
                :display-value="`${Math.round(game.cursorRippleGlow * 100)}%`"
                :on-interact="playSliderClickSfx"
                @update:model-value="(v) => (game.cursorRippleGlow = v / 100)"
              />
            </template>
            <SettingsResetRow
              variant="card"
              :disabled="!canResetClickEffectSettings"
              @click="playControlClickSfx(); onResetClickEffectSettings()"
            >
              {{ t('settings.cursor.resetAll') }}
            </SettingsResetRow>
          </SettingsSection>

          <SettingsSection v-show="activeCategory === 'general'" :title="t('settings.gameplay')">
            <SettingsSelectRow
              :label="t('settings.language')"
              help-key="language"
              :model-value="game.language"
              :options="languageOptions"
              @update:model-value="(v) => (game.language = v as 'en' | 'zh-CN')"
            />
            <SettingsSelectRow
              :label="t('settings.theme')"
              help-key="theme"
              :model-value="game.theme"
              :options="themeOptions"
              @update:model-value="(v) => (game.theme = String(v) as typeof game.theme)"
            />
            <div class="reset-all-settings-block">
              <button
                type="button"
                class="reset-all-settings-btn"
                :title="t('settings.resetAllSettingsHint')"
                @click="playControlClickSfx(); onResetAllSettings()"
              >
                {{ t("settings.resetAllSettings") }}
              </button>
            </div>
          </SettingsSection>

          <SettingsSection v-show="activeCategory === 'keyboard'" class="keybindings-section">
            <template #head>
              <div class="section-head">
                <h3>{{ t('settings.keybindings.title') }}</h3>
                <button
                  type="button"
                  class="reset-keys-btn"
                  :disabled="!canResetKeyBindings"
                  @click="playControlClickSfx(); onResetAllKeyBindings()"
                >
                  {{ t('settings.keybindings.resetAll') }}
                </button>
              </div>
            </template>
            <h4 class="subsection-title">{{ t('settings.keybindings.sectionGameplay10') }}</h4>
            <div v-for="lane in 10" :key="'lane-' + lane" class="setting-row keybind-row">
              <label>{{ formatGameplayLane(lane) }}</label>
              <KeyChordPicker
                plain-code-only
                :chords="laneChordsForIndex(lane - 1)"
                @update:chords="(c) => applyLaneCode(lane - 1, c)"
              />
            </div>

            <template v-for="sec in SHORTCUT_SECTIONS" :key="sec.titleKey">
              <h4 class="subsection-title">{{ t(sec.titleKey) }}</h4>
              <div v-for="row in sec.rows" :key="row.id" class="setting-row keybind-row">
                <label>{{ t(row.labelKey) }}</label>
                <KeyChordPicker
                  :chords="chordsForShortcut(row.id)"
                  @update:chords="(c) => applyShortcut(row.id, c)"
                />
              </div>
            </template>
          </SettingsSection>

          <SettingsSection v-show="activeCategory === 'game'" :title="t('settings.layout')">
            <SettingsRangeRow
              :label="t('settings.doublePanelGap')"
              help-key="doublePanelGap"
              :model-value="game.doublePanelGapPx"
              :min="16"
              :max="160"
              :step="4"
              :display-value="`${game.doublePanelGapPx}px`"
              :on-interact="playSliderClickSfx"
              @update:model-value="(v) => (game.doublePanelGapPx = v)"
            />
          </SettingsSection>

          <SettingsSection v-show="activeCategory === 'game'" :title="t('settings.judgmentCategory')">
            <SettingsSelectRow
              :label="t('settings.judgmentStyle')"
              help-key="judgmentStyle"
              :model-value="game.judgmentStyle"
              :options="judgmentStyleOptions"
              @update:model-value="(v) => (game.judgmentStyle = v as 'ddr' | 'itg')"
            />
            <SettingsToggleRow
              :label="t('settings.showOffset')"
              help-key="showOffset"
              :model-value="game.showOffset"
              :on-toggle-sound="playToggleClickSfx"
              @update:model-value="(v) => (game.showOffset = v)"
            />
            <SettingsSelectRow
              :label="t('settings.lifeType')"
              help-key="lifeType"
              :model-value="game.lifeType"
              :options="lifeTypeOptions"
              @update:model-value="(v) => (game.lifeType = v as 'bar' | 'battery' | 'survival')"
            />
            <SettingsSelectRow
              v-if="game.lifeType === 'battery'"
              :label="t('settings.batteryLives')"
              help-key="batteryLives"
              :model-value="game.batteryLives"
              :options="batteryLivesOptions"
              @update:model-value="(v) => (game.batteryLives = Number(v))"
            />
            <SettingsToggleRow
              :label="t('playerOpt.showParticles')"
              help-key="showParticles"
              :model-value="game.showParticles"
              :on-toggle-sound="playToggleClickSfx"
              @update:model-value="(v) => (game.showParticles = v)"
            />
          </SettingsSection>

          <SettingsSection v-show="activeCategory === 'about'" :title="t('settings.about')">
            <div class="about-info">
              <p class="about-version">Best-StepMania v1.0.0</p>
              <p class="about-desc">{{ t('settings.aboutDescription') }}</p>
              <p class="about-desc">内测问题反馈群：1098757120</p>
            </div>
            <div class="setting-row">
              <button class="export-diagnostics-btn" @click="playControlClickSfx(); onExportDiagnostics()">
                {{ t('settings.exportDiagnostics') }}
              </button>
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>

    <div
      v-if="confirmDialogOpen"
      class="confirm-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="confirmDialogTitle"
      @click.self="closeConfirmDialog()"
    >
      <div class="confirm-dialog-card">
        <h4>{{ confirmDialogTitle }}</h4>
        <p>{{ confirmDialogMessage }}</p>
        <ul v-if="confirmDialogBullets.length > 0" class="confirm-dialog-bullets">
          <li v-for="item in confirmDialogBullets" :key="item">{{ item }}</li>
        </ul>
        <div class="confirm-dialog-actions">
          <button type="button" class="confirm-dialog-cancel" :disabled="confirmDialogBusy" @click="closeConfirmDialog()">
            {{ t('back') }}
          </button>
          <button type="button" class="confirm-dialog-ok" :disabled="confirmDialogBusy" @click="confirmDialogAccept()">
            {{ confirmDialogBusy ? '...' : confirmDialogConfirmText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.options-screen { width:100%;height:100%;display:flex;flex-direction:column;background:linear-gradient(180deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%); }
.top-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-color) 82%, transparent);
  backdrop-filter: blur(12px);
}
.top-bar-lead,
.top-bar-trail {
  flex: 0 0 5rem;
  display: flex;
  align-items: center;
}
.top-bar-lead { justify-content: flex-start; }
.top-bar-trail { justify-content: flex-end; }
.top-bar-title {
  flex: 1;
  margin: 0;
  text-align: center;
  font-size: 0.85rem;
  letter-spacing: 0.3em;
  color: var(--text-muted);
  text-transform: uppercase;
  font-family: "Orbitron", sans-serif;
}
.tb-btn {
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  background: var(--section-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem;
  font-family: "Rajdhani", sans-serif;
  transition: all 0.15s;
}
.tb-btn:hover {
  background: var(--primary-color-bg);
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  color: var(--text-color);
}
.tb-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.settings-body {
  flex: 1;
  display: flex;
  min-height: 0;
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  gap: 0;
}
.category-nav {
  flex-shrink: 0;
  width: 11rem;
  padding: 1rem 0.75rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-right: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.12);
}
.category-tab {
  text-align: left;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.category-tab:hover {
  color: rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.04);
}
.category-tab.active {
  color: var(--text-color);
  background: var(--primary-color-bg);
  border-color: rgba(255, 255, 255, 0.12);
}
.category-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sections {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 1.5rem 1.5rem 1.25rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  scrollbar-gutter: stable;
  scroll-padding-bottom: 1rem;
}
.sections :deep(.nav-section) {
  padding: 0.75rem;
}
.toggle-switch { position: relative; width: 36px; height: 20px; cursor: pointer; flex: 0 0 36px; display: inline-block; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; inset: 0; background: rgba(255,255,255,0.1); border-radius: 22px; transition: 0.2s; }
.toggle-slider::before { content: ''; position: absolute; width: 14px; height: 14px; left: 3px; bottom: 3px; background: rgba(255,255,255,0.5); border-radius: 50%; transition: 0.2s; }
.toggle-switch input:checked + .toggle-slider { background: var(--primary-color); }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(16px); background: var(--text-on-primary); }
.toggle-switch input:disabled + .toggle-slider { opacity: 0.4; cursor: not-allowed; }
.nav-item { width:100%;display:flex;align-items:center;gap:0.875rem;padding:0.75rem 1rem;background:var(--primary-color-bg);border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;transition:all 0.15s;color:var(--text-color);text-align:left; }
.nav-item:hover { background:rgba(255,255,255,0.05);border-color:var(--primary-color-hover); }
.nav-icon { font-size:1.3rem;flex-shrink:0; }
.nav-item,
.reset-keys-btn,
.reset-all-settings-btn,
.export-diagnostics-btn,
.confirm-dialog-cancel,
.confirm-dialog-ok {
  appearance: none;
  -webkit-appearance: none;
  box-shadow: none;
  background-clip: padding-box;
}
.nav-info { flex:1;display:flex;flex-direction:column;gap:1px; }
.nav-title { font-size:0.88rem;font-weight:700; }
.nav-desc { font-size:0.72rem;color:rgba(255,255,255,0.35); }
.nav-arrow { font-size:1.4rem;color:var(--primary-color-glow); }
.setting-row { display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--border-color); }
.setting-row:last-child { border-bottom:none; }
.setting-row > label:not(.toggle-switch) { flex:1;font-size:0.85rem;color:var(--text-color);opacity:0.85;display:flex;align-items:center; }
.setting-row input[type=range] { width:120px;accent-color:var(--primary-color); }
.value { font-size:0.8rem;color:rgba(255,255,255,0.4);min-width:40px;text-align:right;font-variant-numeric:tabular-nums; }
:deep(.audio-offset-ms-input) { width:80px;min-width:80px;padding:0.3rem 0.45rem;border-radius:4px;border:1px solid var(--border-color);background:rgba(255,255,255,0.04);color:var(--text-color);font-size:0.85rem; }
:deep(.audio-offset-ms-input .app-number-field-native) { text-align: center; }
.subsection-title { font-size: 0.65rem; letter-spacing: 0.15em; color: rgba(255,255,255,0.35); margin: 1rem 0 0.5rem; text-transform: uppercase; }
.keybindings-section :deep(.subsection-title:first-of-type) { margin-top: 0.25rem; }
.keybind-row label { flex: 1; min-width: 0; }
.reset-keys-btn {
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: rgba(255,80,80,0.12);
  color: rgba(255,200,200,0.95);
  cursor: pointer;
}
.reset-keys-btn:hover:not(:disabled) { border-color: rgba(255,120,120,0.5); background: rgba(255,80,80,0.2); }
.reset-keys-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.reset-all-settings-block {
  margin-top: 1rem;
  padding-top: 1rem;
}
.reset-all-settings-btn {
  display: block;
  margin-left: auto;
  padding: 0.45rem 0.9rem;
  font-size: 0.78rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 120, 120, 0.35);
  background: rgba(255, 60, 60, 0.14);
  color: rgba(255, 210, 210, 0.95);
  cursor: pointer;
}
.reset-all-settings-btn:hover {
  border-color: rgba(255, 140, 140, 0.55);
  background: rgba(255, 80, 80, 0.22);
}
.ui-sfx-toggle-switch {
  border: 0;
  padding: 0;
  background: transparent;
}
.ui-sfx-toggle-switch:hover .toggle-slider {
  background: rgba(255, 255, 255, 0.16);
}
.ui-sfx-toggle-switch.active .toggle-slider {
  background: var(--primary-color);
}
.ui-sfx-toggle-switch.active .toggle-slider::before {
  transform: translateX(16px);
  background: var(--text-on-primary);
}
.sfx-preview-icon-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
  color: color-mix(in srgb, var(--primary-color) 80%, var(--text-color));
  font-size: 0.58rem;
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  margin-left: 6px;
  flex-shrink: 0;
  line-height: 1;
  padding: 0;
}
.sfx-preview-icon-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary-color) 30%, transparent);
  color: var(--text-color);
}
.sfx-preview-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.about-info {
  margin-bottom: 1rem;
}
.about-version {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 0.5rem;
}
.about-desc {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
  line-height: 1.5;
}
.export-diagnostics-btn {
  padding: 0.55rem 1rem;
  font-size: 0.8rem;
  border-radius: 8px;
  border: 1px solid var(--primary-color);
  background: var(--primary-color-bg);
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.15s;
}
.export-diagnostics-btn:hover {
  border-color: var(--primary-color-hover);
  background: rgba(255, 255, 255, 0.08);
}
.confirm-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.confirm-dialog-card {
  width: min(92vw, 28rem);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: linear-gradient(180deg, rgba(16,16,28,0.98), rgba(12,12,22,0.98));
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  padding: 1rem 1.1rem;
}
.confirm-dialog-card h4 {
  margin: 0 0 0.6rem;
  font-size: 0.86rem;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.9);
}
.confirm-dialog-card p {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: rgba(255,255,255,0.66);
}
.confirm-dialog-bullets {
  margin: 0.75rem 0 0;
  padding-left: 1.1rem;
  color: rgba(255,255,255,0.72);
  font-size: 0.74rem;
  line-height: 1.45;
}
.confirm-dialog-bullets li + li {
  margin-top: 0.28rem;
}
.confirm-dialog-actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.confirm-dialog-cancel,
.confirm-dialog-ok {
  border-radius: 8px;
  padding: 0.42rem 0.82rem;
  font-size: 0.76rem;
  cursor: pointer;
  border: 1px solid var(--border-color);
}
.confirm-dialog-cancel {
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.86);
}
.confirm-dialog-ok {
  background: rgba(255,80,80,0.18);
  border-color: rgba(255,120,120,0.45);
  color: rgba(255,220,220,0.98);
}
.confirm-dialog-cancel:disabled,
.confirm-dialog-ok:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 680px) {
  .top-bar { flex-wrap: wrap; gap: 0.75rem; }
  .top-bar h2 { order: -1; width: 100%; }
  .settings-body { flex-direction: column; max-width: 100%; }
  .category-nav {
    flex-direction: row;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    width: 100%;
    padding: 0.75rem 1rem;
    gap: 0.35rem;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-gutter: stable;
  }
  .category-tab {
    flex-shrink: 0;
    white-space: nowrap;
    letter-spacing: 0.08em;
  }
  .sections { padding: 1rem; }
  .setting-row { flex-wrap: wrap; align-items: flex-start; }
  .setting-row input[type=range] { width: 100%; }
  .value { margin-left: auto; }
}
</style>
