<script setup lang="ts">
import { ref, computed, onUnmounted, onMounted, watchEffect, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/i18n";
import { currentLocale } from "@/i18n";
import { useGameStore } from "@/stores/game";
import { useLibraryStore } from "@/stores/library";
import * as api from "@/utils/api";
import type { RhythmSfxStyle } from "@/api/config";
import { previewRhythmSfx, previewUiSfx, setUiSfxEnabled, setUiSfxStyle, setUiSfxVolume } from "@/utils/sfx";
import HelpTooltip from "@/components/HelpTooltip.vue";
import CustomSelect from "@/components/CustomSelect.vue";
import { APP_THEME_IDS } from "@/constants/appThemes";
import KeyChordPicker from "@/components/KeyChordPicker.vue";
import type { KeyChord, ShortcutId } from "@/engine/keyBindings";
import { logOptionalRejection } from "@/utils/devLog";
import { WINDOW_DISPLAY_PRESET_IDS } from "@/constants/windowDisplay";
import { applyWindowDisplayPreset } from "@/utils/applyWindowDisplay";
import {
  SHORTCUT_DEFAULTS,
  mergeShortcutBindings,
  bindingsEqual,
  bindingToChordList,
  resolveGameplayPumpDoubleLanes,
  GAMEPLAY_10_LANE_DEFAULT_CODES,
} from "@/engine/keyBindings";

const router = useRouter();
const { t } = useI18n();
const game = useGameStore();
const library = useLibraryStore();

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
    titleKey: "settings.keybindings.sectionPlayerOpt",
    rows: [{ id: "playerOptions.back", labelKey: "settings.keybindings.playerOptionsBack" }],
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
      { id: "editor.noteType5", labelKey: "settings.keybindings.editorNoteType5" },
      { id: "editor.noteType6", labelKey: "settings.keybindings.editorNoteType6" },
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
  const fallback = GAMEPLAY_10_LANE_DEFAULT_CODES[i] ?? "KeyQ";
  return [{ code: lanes[i] ?? fallback }];
}

function applyLaneCode(i: number, chords: KeyChord[]) {
  const code = chords[0]?.code?.trim() ?? "";
  const base = [...resolveGameplayPumpDoubleLanes(game.gameplayPumpDoubleLanes)];
  base[i] = code.length > 0 ? code : base[i] ?? "KeyQ";
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
  { label: t("settings.languageOption.en"), value: "en" },
  { label: t("settings.languageOption.zh-CN"), value: "zh-CN" },
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

type ConfirmAction =
  | "reset-keybindings"
  | "reset-all-settings"
  | "reset-cursor-core-settings"
  | "reset-click-effect-settings";

const confirmDialogOpen = ref(false);
const confirmDialogTitle = ref("");
const confirmDialogMessage = ref("");
const pendingConfirmAction = ref<ConfirmAction | null>(null);
const confirmDialogBusy = ref(false);

const confirmDialogConfirmText = computed(() => {
  if (pendingConfirmAction.value === "reset-keybindings") {
    return t("settings.keybindings.resetAll");
  }
  if (
    pendingConfirmAction.value === "reset-cursor-core-settings" ||
    pendingConfirmAction.value === "reset-click-effect-settings"
  ) {
    return t("settings.cursor.resetAll");
  }
  return t("settings.resetAllSettings");
});

function openConfirmDialog(action: ConfirmAction) {
  pendingConfirmAction.value = action;
  if (action === "reset-keybindings") {
    confirmDialogTitle.value = t("settings.keybindings.resetAll");
    confirmDialogMessage.value = t("settings.keybindings.resetAllConfirm");
  } else if (action === "reset-cursor-core-settings") {
    confirmDialogTitle.value = t("settings.cursor.resetAll");
    confirmDialogMessage.value = t("settings.cursor.resetCoreConfirm");
  } else if (action === "reset-click-effect-settings") {
    confirmDialogTitle.value = t("settings.cursor.resetAll");
    confirmDialogMessage.value = t("settings.cursor.resetClickEffectConfirm");
  } else {
    confirmDialogTitle.value = t("settings.resetAllSettings");
    confirmDialogMessage.value = t("settings.resetAllSettingsConfirm");
  }
  confirmDialogOpen.value = true;
}

function closeConfirmDialog() {
  if (confirmDialogBusy.value) return;
  confirmDialogOpen.value = false;
  pendingConfirmAction.value = null;
}

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

function onResetAllKeyBindings() {
  if (!canResetKeyBindings.value) return;
  openConfirmDialog("reset-keybindings");
}

function onResetAllSettings() {
  openConfirmDialog("reset-all-settings");
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

function onResetCursorCoreSettings() {
  if (!canResetCursorCoreSettings.value) return;
  openConfirmDialog("reset-cursor-core-settings");
}

function onResetClickEffectSettings() {
  if (!canResetClickEffectSettings.value) return;
  openConfirmDialog("reset-click-effect-settings");
}

async function confirmDialogAccept() {
  const action = pendingConfirmAction.value;
  if (!action) return;
  confirmDialogBusy.value = true;
  try {
    if (action === "reset-keybindings") {
      resetAllKeyBindings();
    } else if (action === "reset-cursor-core-settings") {
      resetCursorCoreSettings();
    } else if (action === "reset-click-effect-settings") {
      resetClickEffectSettings();
    } else {
      await resetAllSettings();
    }
    confirmDialogOpen.value = false;
    pendingConfirmAction.value = null;
  } finally {
    confirmDialogBusy.value = false;
  }
}

function formatGameplayLane(n: number): string {
  return t("settings.keybindings.gameplayLane").replace("{n}", String(n));
}

let lastSfxPreviewAt = 0;
function shouldSkipDuplicatedPreview() {
  const now = performance.now();
  if (now - lastSfxPreviewAt < 120) return true;
  lastSfxPreviewAt = now;
  return false;
}

function previewUiSfxFromSettings() {
  if (shouldSkipDuplicatedPreview()) return;
  previewUiSfx();
}

function previewRhythmSfxFromSettings() {
  if (shouldSkipDuplicatedPreview()) return;
  previewRhythmSfx();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** All reactive watcher stop handles — cleaned up together in onUnmounted. */
const watchStops: Array<() => void> = [];

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => game.saveAppConfig(), 800);
}

// 使用 watchEffect 统一监听所有设置变化
let stopWatching: (() => void) | null = null;

onMounted(() => {
  // 首次进入设置时预热曲包列表，进入曲包管理页可直接使用缓存。
  if (library.packs.length === 0) {
    void library.loadPacks().catch((e) =>
      logOptionalRejection("options.prefetchSongPacks", e),
    );
  }

  stopWatching = watchEffect(() => {
    // 访问所有响应式属性以建立依赖
    game.masterVolume;
    game.musicVolume;
    game.effectVolume;
    game.rhythmSfxEnabled;
    game.rhythmSfxVolume;
    game.rhythmSfxStyle;
    game.uiSfxEnabled;
    game.uiSfxVolume;
    game.uiSfxStyle;
    game.audioOffsetMs;
    game.windowDisplayPreset;
    game.vsync;
    game.targetFps;
    game.language;
    game.theme;
    game.uiScale;
    game.doublePanelGapPx;
    game.judgmentStyle;
    game.showOffset;
    game.lifeType;
    game.batteryLives;
    game.showParticles;
    game.cursorEnabled;
    game.cursorStylePreset;
    game.cursorScale;
    game.cursorOpacity;
    game.cursorGlow;
    game.cursorRippleEnabled;
    game.cursorRippleDurationMs;
    game.cursorRippleMinScale;
    game.cursorRippleMaxScale;
    game.cursorRippleOpacity;
    game.cursorRippleLineWidth;
    game.cursorRippleGlow;

    scheduleSave();
  });

  watchStops.push(
    watch(
      () => [game.masterVolume, game.musicVolume],
      ([master, music]) => {
        api.audioSetVolume((music ?? 70) / 100, (master ?? 80) / 100).catch((e) =>
          logOptionalRejection("options.watch.audioSetVolume", e),
        );
      },
      { immediate: true },
    ),
    watch(
      () => [game.effectVolume, game.uiSfxEnabled, game.uiSfxStyle] as const,
      ([effectVol, enabled, style]) => {
        setUiSfxVolume((effectVol ?? 90) / 100);
        setUiSfxEnabled(enabled ?? true);
        setUiSfxStyle((style ?? "classic") as "classic" | "soft" | "arcade");
      },
      { immediate: true },
    ),
    watch(
      () => game.windowDisplayPreset,
      (preset) => {
        void applyWindowDisplayPreset(preset);
      },
      { immediate: true },
    ),
    watch(
      () => [game.language, game.theme] as const,
      ([lang, thm]) => {
        if (lang) {
          currentLocale.value = lang as "en" | "zh-CN";
          localStorage.setItem("locale", lang as string);
        }
        if (thm) {
          document.body.setAttribute("data-theme", thm as string);
        }
      },
      { immediate: true },
    ),
    watch(
      () => game.uiScale,
      (scale) => {
        document.documentElement.style.fontSize = `${(scale ?? 1) * 16}px`;
      },
      { immediate: true },
    ),
    watch(
      () => [game.gameplayPumpDoubleLanes, game.shortcutOverrides] as const,
      () => scheduleSave(),
      { deep: true },
    ),
  );
});

onUnmounted(() => {
  if (stopWatching) stopWatching();
  watchStops.forEach(stop => stop());
  if (saveTimer) { clearTimeout(saveTimer); game.saveAppConfig(); }
});

function goBack() { router.push("/"); }

async function exportDiagnostics() {
  try {
    const result = await api.exportDiagnostics();
    if (result.path) {
      await api.openPath(result.path);
    }
  } catch (e: unknown) {
    console.error("Failed to export diagnostics:", e);
  }
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
      <button class="back-btn" @click="goBack">&larr; {{ t('back') }}</button>
      <h2>{{ t('settings.title') }}</h2>
      <div style="width:80px" />
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
          @click="activeCategory = cat.id"
        >
          {{ t(cat.labelKey) }}
        </button>
      </nav>

      <div class="category-panel" role="tabpanel">
        <div class="sections">

      <!-- 子页面导航入口 -->
      <section v-show="activeCategory === 'content'" class="section nav-section">
        <h3>{{ t('settings.contentManagement') }}</h3>
        <button class="nav-item" @click="router.push('/song-packs')">
          <span class="nav-icon">&#x1F3B5;</span>
          <div class="nav-info">
            <span class="nav-title">{{ t('settings.manageSongPacks') }}</span>
            <span class="nav-desc">{{ t('settings.manageSongPacksDesc') }}</span>
          </div>
          <span class="nav-arrow">&rsaquo;</span>
        </button>
      </section>

      <section v-show="activeCategory === 'audio'" class="section">
        <h3>{{ t('settings.audio') }}</h3>
        <div class="setting-row">
          <label>{{ t('settings.masterVolume') }} <HelpTooltip helpKey="masterVolume" /></label>
          <input type="range" min="0" max="100" v-model.number="game.masterVolume" />
          <span class="value">{{ game.masterVolume }}%</span>
        </div>
        <div class="setting-row">
          <label>{{ t('settings.musicVolume') }} <HelpTooltip helpKey="musicVolume" /></label>
          <input type="range" min="0" max="100" v-model.number="game.musicVolume" />
          <span class="value">{{ game.musicVolume }}%</span>
        </div>
        <div class="setting-row">
          <label>{{ t('settings.effectVolume') }} <HelpTooltip helpKey="effectVolume" /></label>
          <input type="range" min="0" max="100" v-model.number="game.effectVolume" />
          <span class="value">{{ game.effectVolume }}%</span>
        </div>
        <div class="setting-row">
          <label>{{ t('settings.rhythmSfxEnabled') }} <HelpTooltip helpKey="rhythmSfx" /></label>
          <input type="checkbox" v-model="game.rhythmSfxEnabled" />
        </div>
        <div class="setting-row">
          <label>{{ t('settings.rhythmSfxVolume') }} <HelpTooltip helpKey="rhythmSfxVolume" /></label>
          <input type="range" min="0" max="100" v-model.number="game.rhythmSfxVolume" :disabled="!game.rhythmSfxEnabled" />
          <span class="value">{{ game.rhythmSfxVolume }}%</span>
        </div>
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
              ▶
            </button>
          </label>
          <CustomSelect
            :model-value="game.rhythmSfxStyle"
            :options="rhythmSfxStyleOptions"
            :disabled="!game.rhythmSfxEnabled"
            @update:model-value="(v) => (game.rhythmSfxStyle = v as RhythmSfxStyle)"
          />
        </div>
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
              ▶
            </button>
          </label>
          <CustomSelect
            :model-value="game.uiSfxStyle"
            :options="uiSfxStyleOptions"
            :disabled="!game.uiSfxEnabled"
            @update:model-value="(v) => (game.uiSfxStyle = v as 'classic' | 'soft' | 'arcade')"
          />
        </div>
        <div class="setting-row">
          <label>{{ t('settings.audioOffset') }} <HelpTooltip helpKey="audioOffset" /></label>
          <input type="number" class="num-input" v-model.number="game.audioOffsetMs" step="1" />
        </div>
      </section>

      <section v-show="activeCategory === 'display'" class="section">
        <h3>{{ t('settings.display') }}</h3>
        <div class="setting-row">
          <label>{{ t('settings.windowDisplayMode') }} <HelpTooltip helpKey="windowDisplay" /></label>
          <CustomSelect
            :model-value="game.windowDisplayPreset"
            :options="windowDisplayPresetOptions"
            @update:model-value="(v) => (game.windowDisplayPreset = String(v) as typeof game.windowDisplayPreset)"
          />
        </div>
        <div class="setting-row">
          <label>{{ t('settings.vsync') }} <HelpTooltip helpKey="vsync" /></label>
          <input type="checkbox" v-model="game.vsync" />
        </div>
        <div class="setting-row">
          <label>{{ t('settings.targetFps') }} <HelpTooltip helpKey="targetFps" /></label>
          <CustomSelect
            :model-value="game.targetFps"
            :options="targetFpsOptions"
            @update:model-value="(v) => (game.targetFps = Number(v))"
          />
        </div>
        <div class="setting-row">
          <label>{{ t('settings.uiScale') }} <HelpTooltip helpKey="uiScale" /></label>
          <input type="range" min="75" max="150" step="5" :value="Math.round(game.uiScale * 100)" @input="game.uiScale = parseInt(($event.target as HTMLInputElement).value) / 100" />
          <span class="value">{{ Math.round(game.uiScale * 100) }}%</span>
        </div>
      </section>

      <section v-show="activeCategory === 'display'" class="section">
        <div class="section-head">
          <h3>{{ t('settings.cursorSettings') }}</h3>
          <button type="button" class="reset-keys-btn" :disabled="!canResetCursorCoreSettings" @click="onResetCursorCoreSettings">
            {{ t('settings.cursor.resetAll') }}
          </button>
        </div>
        <div class="setting-row">
          <label>{{ t('settings.cursorStylePreset') }} <HelpTooltip helpKey="cursorStylePreset" /></label>
          <CustomSelect
            :model-value="game.cursorStylePreset"
            :options="cursorStylePresetOptions"
            @update:model-value="(v) => (game.cursorStylePreset = v as 'a' | 'b')"
          />
        </div>
        <div class="setting-row">
          <label>{{ t('settings.cursorScale') }} <HelpTooltip helpKey="cursorScale" /></label>
          <input type="range" min="70" max="160" step="5" :value="Math.round(game.cursorScale * 100)" @input="game.cursorScale = parseInt(($event.target as HTMLInputElement).value) / 100" />
          <span class="value">{{ Math.round(game.cursorScale * 100) }}%</span>
        </div>
        <div class="setting-row">
          <label>{{ t('settings.cursorOpacity') }} <HelpTooltip helpKey="cursorOpacity" /></label>
          <input type="range" min="10" max="100" step="1" :value="Math.round(game.cursorOpacity * 100)" @input="game.cursorOpacity = parseInt(($event.target as HTMLInputElement).value) / 100" />
          <span class="value">{{ Math.round(game.cursorOpacity * 100) }}%</span>
        </div>
        <div class="setting-row">
          <label>{{ t('settings.cursorGlow') }} <HelpTooltip helpKey="cursorGlow" /></label>
          <input type="range" min="0" max="100" step="1" :value="Math.round(game.cursorGlow * 100)" @input="game.cursorGlow = parseInt(($event.target as HTMLInputElement).value) / 100" />
          <span class="value">{{ Math.round(game.cursorGlow * 100) }}%</span>
        </div>
      </section>

      <section v-show="activeCategory === 'display'" class="section">
        <div class="section-head">
          <h3>{{ t('settings.clickEffectSettings') }}</h3>
          <button type="button" class="reset-keys-btn" :disabled="!canResetClickEffectSettings" @click="onResetClickEffectSettings">
            {{ t('settings.cursor.resetAll') }}
          </button>
        </div>
        <div class="setting-row">
          <label>{{ t('settings.cursorRippleEnabled') }} <HelpTooltip helpKey="cursorRippleEnabled" /></label>
          <input type="checkbox" v-model="game.cursorRippleEnabled" />
        </div>
        <template v-if="game.cursorRippleEnabled">
          <div class="setting-row">
            <label>{{ t('settings.cursorRippleDurationMs') }} <HelpTooltip helpKey="cursorRippleDurationMs" /></label>
            <input type="range" min="180" max="1200" step="10" v-model.number="game.cursorRippleDurationMs" />
            <span class="value">{{ game.cursorRippleDurationMs }}ms</span>
          </div>
          <div class="setting-row">
            <label>{{ t('settings.cursorRippleMinScale') }} <HelpTooltip helpKey="cursorRippleMinScale" /></label>
            <input type="range" min="20" max="240" step="5" :value="Math.round(game.cursorRippleMinScale * 100)" @input="game.cursorRippleMinScale = parseInt(($event.target as HTMLInputElement).value) / 100" />
            <span class="value">{{ game.cursorRippleMinScale.toFixed(2) }}x</span>
          </div>
          <div class="setting-row">
            <label>{{ t('settings.cursorRippleMaxScale') }} <HelpTooltip helpKey="cursorRippleMaxScale" /></label>
            <input type="range" min="120" max="1200" step="10" :value="Math.round(game.cursorRippleMaxScale * 100)" @input="game.cursorRippleMaxScale = parseInt(($event.target as HTMLInputElement).value) / 100" />
            <span class="value">{{ game.cursorRippleMaxScale.toFixed(2) }}x</span>
          </div>
          <div class="setting-row">
            <label>{{ t('settings.cursorRippleOpacity') }} <HelpTooltip helpKey="cursorRippleOpacity" /></label>
            <input type="range" min="0" max="100" step="1" :value="Math.round(game.cursorRippleOpacity * 100)" @input="game.cursorRippleOpacity = parseInt(($event.target as HTMLInputElement).value) / 100" />
            <span class="value">{{ Math.round(game.cursorRippleOpacity * 100) }}%</span>
          </div>
          <div class="setting-row">
            <label>{{ t('settings.cursorRippleLineWidth') }} <HelpTooltip helpKey="cursorRippleLineWidth" /></label>
            <input type="range" min="5" max="30" step="1" :value="Math.round(game.cursorRippleLineWidth * 10)" @input="game.cursorRippleLineWidth = parseInt(($event.target as HTMLInputElement).value) / 10" />
            <span class="value">{{ game.cursorRippleLineWidth.toFixed(1) }}px</span>
          </div>
          <div class="setting-row">
            <label>{{ t('settings.cursorRippleGlow') }} <HelpTooltip helpKey="cursorRippleGlow" /></label>
            <input type="range" min="0" max="100" step="1" :value="Math.round(game.cursorRippleGlow * 100)" @input="game.cursorRippleGlow = parseInt(($event.target as HTMLInputElement).value) / 100" />
            <span class="value">{{ Math.round(game.cursorRippleGlow * 100) }}%</span>
          </div>
        </template>
      </section>

      <section v-show="activeCategory === 'general'" class="section">
        <h3>{{ t('settings.gameplay') }}</h3>
        <div class="setting-row">
          <label>{{ t('settings.language') }} <HelpTooltip helpKey="language" /></label>
          <CustomSelect
            :model-value="game.language"
            :options="languageOptions"
            @update:model-value="(v) => (game.language = v as 'en' | 'zh-CN')"
          />
        </div>
        <div class="setting-row">
          <label>{{ t('settings.theme') }} <HelpTooltip helpKey="theme" /></label>
          <CustomSelect
            :model-value="game.theme"
            :options="themeOptions"
            @update:model-value="(v) => (game.theme = String(v) as typeof game.theme)"
          />
        </div>
        <div class="reset-all-settings-block">
          <p class="reset-all-hint">{{ t("settings.resetAllSettingsHint") }}</p>
          <button type="button" class="reset-all-settings-btn" @click="onResetAllSettings">
            {{ t("settings.resetAllSettings") }}
          </button>
        </div>
      </section>

      <section v-show="activeCategory === 'keyboard'" class="section keybindings-section">
        <div class="section-head">
          <h3>{{ t('settings.keybindings.title') }}</h3>
          <button type="button" class="reset-keys-btn" :disabled="!canResetKeyBindings" @click="onResetAllKeyBindings">
            {{ t('settings.keybindings.resetAll') }}
          </button>
        </div>
        <h4 class="subsection-title">{{ t('settings.keybindings.sectionGameplay10') }}</h4>
        <div
          v-for="lane in 10"
          :key="'lane-' + lane"
          class="setting-row keybind-row"
        >
          <label>{{ formatGameplayLane(lane) }}</label>
          <KeyChordPicker
            plain-code-only
            :chords="laneChordsForIndex(lane - 1)"
            @update:chords="(c) => applyLaneCode(lane - 1, c)"
          />
        </div>

        <template v-for="sec in SHORTCUT_SECTIONS" :key="sec.titleKey">
          <h4 class="subsection-title">{{ t(sec.titleKey) }}</h4>
          <div
            v-for="row in sec.rows"
            :key="row.id"
            class="setting-row keybind-row"
          >
            <label>{{ t(row.labelKey) }}</label>
            <KeyChordPicker
              :chords="chordsForShortcut(row.id)"
              @update:chords="(c) => applyShortcut(row.id, c)"
            />
          </div>
        </template>
      </section>

      <section v-show="activeCategory === 'game'" class="section">
        <h3>{{ t('settings.layout') }}</h3>
        <div class="setting-row">
          <label>{{ t('settings.doublePanelGap') }} <HelpTooltip helpKey="doublePanelGap" /></label>
          <input type="range" min="16" max="160" step="4" v-model.number="game.doublePanelGapPx" />
          <span class="value">{{ game.doublePanelGapPx }}px</span>
        </div>
      </section>

      <section v-show="activeCategory === 'game'" class="section">
        <h3>{{ t('settings.judgmentCategory') }}</h3>
        <div class="setting-row">
          <label>{{ t('settings.judgmentStyle') }} <HelpTooltip helpKey="judgmentStyle" /></label>
          <CustomSelect
            :model-value="game.judgmentStyle"
            :options="judgmentStyleOptions"
            @update:model-value="(v) => (game.judgmentStyle = v as 'ddr' | 'itg')"
          />
        </div>
        <div class="setting-row">
          <label>{{ t('settings.showOffset') }} <HelpTooltip helpKey="showOffset" /></label>
          <input type="checkbox" v-model="game.showOffset" />
        </div>
        <div class="setting-row">
          <label>{{ t('settings.lifeType') }} <HelpTooltip helpKey="lifeType" /></label>
          <CustomSelect
            :model-value="game.lifeType"
            :options="lifeTypeOptions"
            @update:model-value="(v) => (game.lifeType = v as 'bar' | 'battery' | 'survival')"
          />
        </div>
        <div v-if="game.lifeType === 'battery'" class="setting-row">
          <label>{{ t('settings.batteryLives') }} <HelpTooltip helpKey="batteryLives" /></label>
          <CustomSelect
            :model-value="game.batteryLives"
            :options="batteryLivesOptions"
            @update:model-value="(v) => (game.batteryLives = Number(v))"
          />
        </div>
        <div class="setting-row">
          <label>{{ t('playerOpt.showParticles') }}</label>
          <input type="checkbox" v-model="game.showParticles" />
        </div>
      </section>

      <section v-show="activeCategory === 'about'" class="section">
        <h3>{{ t('settings.about') }}</h3>
        <div class="about-info">
          <p class="about-version">Best-StepMania v1.0.0</p>
          <p class="about-desc">{{ t('settings.aboutDescription') }}</p>
          <p class="about-desc">内测问题反馈群：1098757120</p>
        </div>
        <div class="setting-row">
          <button class="export-diagnostics-btn" @click="exportDiagnostics">
            {{ t('settings.exportDiagnostics') }}
          </button>
        </div>
      </section>

        </div>
      </div>
    </div>

    <div
      v-if="confirmDialogOpen"
      class="confirm-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="confirmDialogTitle"
      @click.self="closeConfirmDialog"
    >
      <div class="confirm-dialog-card">
        <h4>{{ confirmDialogTitle }}</h4>
        <p>{{ confirmDialogMessage }}</p>
        <div class="confirm-dialog-actions">
          <button type="button" class="confirm-dialog-cancel" :disabled="confirmDialogBusy" @click="closeConfirmDialog">
            {{ t('back') }}
          </button>
          <button type="button" class="confirm-dialog-ok" :disabled="confirmDialogBusy" @click="confirmDialogAccept">
            {{ confirmDialogBusy ? '...' : confirmDialogConfirmText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.options-screen { width:100%;height:100%;display:flex;flex-direction:column;background:linear-gradient(180deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%); }
.top-bar { display:flex;align-items:center;padding:0.85rem 1rem;border-bottom:1px solid var(--border-color);background:rgba(8,8,18,0.72);backdrop-filter:blur(14px); }
.top-bar h2 { flex:1;text-align:center;font-size:0.85rem;letter-spacing:0.3em;color:rgba(255,255,255,0.4); }
.back-btn { background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:0.9rem; }
.back-btn:hover { color: var(--text-color); }
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
}
.sections { scroll-padding-bottom: 1rem; }
.section { background:linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02));border:1px solid var(--border-color);border-radius:14px;padding:1rem 1.25rem;box-shadow:0 10px 30px rgba(0,0,0,0.15); }
.section h3 { font-size:0.7rem;letter-spacing:0.2em;color:rgba(255,255,255,0.3);margin-bottom:0.75rem;text-transform:uppercase; }
.section-head { display:flex; align-items:center; justify-content:space-between; gap:0.75rem; margin-bottom:0.75rem; }
.section-head h3 { margin:0; }
.nav-section { padding:0.75rem; }
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
.setting-row label { flex:1;font-size:0.85rem;color:var(--text-color);opacity:0.85;display:flex;align-items:center; }
.setting-row input[type=range] { width:120px;accent-color:var(--primary-color); }
.setting-row input[type=checkbox] { accent-color:var(--primary-color);width:18px;height:18px; }
.value { font-size:0.8rem;color:rgba(255,255,255,0.4);min-width:40px;text-align:right;font-variant-numeric:tabular-nums; }
.num-input { width:80px;padding:0.3rem 0.5rem;border-radius:4px;border:1px solid var(--border-color);background:rgba(255,255,255,0.04);color:var(--text-color);font-size:0.85rem;text-align:center; }
.sel { padding:0.3rem 0.5rem;border-radius:4px;border:1px solid var(--border-color);background:rgba(255,255,255,0.04);color:var(--text-color);font-size:0.8rem; }
.theme-sel { min-width: 12rem; max-width: 100%; }
.keybindings-hint { font-size: 0.72rem; color: rgba(255,255,255,0.38); margin: -0.25rem 0 0.75rem; line-height: 1.45; }
.subsection-title { font-size: 0.65rem; letter-spacing: 0.15em; color: rgba(255,255,255,0.35); margin: 1rem 0 0.5rem; text-transform: uppercase; }
.keybindings-section .subsection-title:first-of-type { margin-top: 0.25rem; }
.keybind-row label { flex: 1; min-width: 0; }
.keybindings-reset-row { justify-content: flex-end; border-bottom: none; padding-bottom: 0; }
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
  border-top: 1px solid var(--border-color);
}
.reset-all-hint {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.38);
  margin: 0 0 0.65rem;
  line-height: 1.45;
}
.reset-all-settings-btn {
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
