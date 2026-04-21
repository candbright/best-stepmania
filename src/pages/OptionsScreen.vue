<script setup lang="ts">
import { ref, onUnmounted, onMounted, provide } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { useSettingsStore } from "@/shared/stores/settings";
import { useSessionStore } from "@/shared/stores/session";
import { useLibraryStore } from "@/shared/stores/library";
import {
  previewMetronomeSfx,
  previewRhythmSfx,
  previewUiSfx,
} from "@/shared/lib/sfx";
import { logDebug } from "@/shared/lib/devLog";
import { useConfirmDialog } from "@/shared/composables/useConfirmDialog";
import { useSettingsSaveQueue } from "@/shared/composables/useSettingsSaveQueue";
import { useAppSettingsSync } from "@/shared/composables/useAppSettingsSync";
import { useSfxPreviewGate } from "@/shared/composables/useSfxPreviewGate";
import { OPTIONS_DIALOG, OPTIONS_PANEL_SFX, type OptionsPanelSfx } from "./options/injectionKeys";
import OptionsContentCategory from "./options/OptionsContentCategory.vue";
import OptionsAudioCategory from "./options/OptionsAudioCategory.vue";
import OptionsDisplayCategory from "./options/OptionsDisplayCategory.vue";
import OptionsGeneralCategory from "./options/OptionsGeneralCategory.vue";
import OptionsKeyboardCategory from "./options/OptionsKeyboardCategory.vue";
import OptionsGameCategory from "./options/OptionsGameCategory.vue";
import OptionsAboutCategory from "./options/OptionsAboutCategory.vue";

const router = useRouter();
const { t } = useI18n();
const settings = useSettingsStore();
const session = useSessionStore();
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
const { schedule, flushAwait } = useSettingsSaveQueue(() => settings.saveAppConfig(session.profileName), 800);
const { stopAll: stopAppSettingsSync } = useAppSettingsSync(settings, schedule);
const sfxGate = useSfxPreviewGate();

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
  sfxGate.tryRun(() => previewUiSfx());
}

function playToggleClickSfx() {
  sfxGate.tryRun(() => previewUiSfx());
}

function playSliderClickSfx() {
  sfxGate.tryRun(() => previewUiSfx());
}

const panelSfx: OptionsPanelSfx = {
  playControlClickSfx,
  playToggleClickSfx,
  playSliderClickSfx,
  previewUiSfxFromSettings,
  previewRhythmSfxFromSettings,
  previewMetronomeSfxFromSettings,
};

provide(OPTIONS_PANEL_SFX, panelSfx);
provide(OPTIONS_DIALOG, { requestConfirm });

onMounted(() => {
  if (library.packs.length === 0) {
    void library.loadPacks().catch((e) => logDebug("Optional", "options.prefetchSongPacks", e));
  }
});

onUnmounted(() => {
  stopAppSettingsSync();
  void flushAwait();
});

function goBack() {
  router.push("/");
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
      <h2 class="top-bar-title">{{ t("settings.title") }}</h2>
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
          @click="
            activeCategory = cat.id;
            playControlClickSfx();
          "
        >
          {{ t(cat.labelKey) }}
        </button>
      </nav>

      <div class="category-panel" role="tabpanel">
        <div class="sections">
          <OptionsContentCategory v-if="activeCategory === 'content'" />
          <OptionsAudioCategory v-if="activeCategory === 'audio'" />
          <OptionsDisplayCategory v-if="activeCategory === 'display'" />
          <OptionsGeneralCategory v-if="activeCategory === 'general'" />
          <OptionsKeyboardCategory v-if="activeCategory === 'keyboard'" />
          <OptionsGameCategory v-if="activeCategory === 'game'" />
          <OptionsAboutCategory v-if="activeCategory === 'about'" />
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
            {{ t("back") }}
          </button>
          <button type="button" class="confirm-dialog-ok" :disabled="confirmDialogBusy" @click="confirmDialogAccept()">
            {{ confirmDialogBusy ? "..." : confirmDialogConfirmText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="./options/optionsScreen.css"></style>
