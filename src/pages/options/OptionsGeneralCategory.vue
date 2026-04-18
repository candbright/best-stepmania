<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "@/shared/i18n";
import { useSettingsStore } from "@/shared/stores/settings";
import { useSessionStore } from "@/shared/stores/session";
import { useLibraryStore } from "@/shared/stores/library";
import { SettingsSection } from "@/features/settings";
import { SettingsSelectRow } from "@/features/settings";
import { APP_THEME_IDS } from "@/shared/constants/appThemes";
import { OPTIONS_DIALOG, OPTIONS_PANEL_SFX } from "./injectionKeys";
import { logError } from "@/shared/lib/devLog";

const { t } = useI18n();
const settings = useSettingsStore();
const session = useSessionStore();
const library = useLibraryStore();
const sfx = inject(OPTIONS_PANEL_SFX)!;
const dialog = inject(OPTIONS_DIALOG)!;

const languageOptions = computed(() => [
  { label: t("settings.languageOption.zh-CN"), value: "zh-CN" },
  { label: t("settings.languageOption.en"), value: "en" },
]);

const themeOptions = computed(() =>
  APP_THEME_IDS.map((tid) => ({ label: t(`settings.themeOption.${tid}`), value: tid })),
);

async function resetAllSettings() {
  try {
    settings.resetToFactoryDefaults();
    await settings.saveAppConfig(session.profileName);
    await library.loadSongs(settings.songDirectories, { force: true });
  } catch (e: unknown) {
    logError("Options", "resetAllSettings failed:", e);
  }
}

function onResetAllSettings() {
  dialog.requestConfirm({
    title: t("settings.resetAllSettings"),
    message: t("settings.resetAllSettingsConfirm"),
    confirmText: t("settings.resetAllSettings"),
    onConfirm: () => resetAllSettings(),
  });
}
</script>

<template>
  <div class="options-category-root">
  <SettingsSection :title="t('settings.gameplay')">
    <SettingsSelectRow
      :label="t('settings.language')"
      help-key="language"
      :model-value="settings.language"
      :options="languageOptions"
      @update:model-value="(v) => (settings.language = v as 'en' | 'zh-CN')"
    />
    <SettingsSelectRow
      :label="t('settings.theme')"
      help-key="theme"
      :model-value="settings.theme"
      :options="themeOptions"
      @update:model-value="(v) => (settings.theme = String(v) as typeof settings.theme)"
    />
    <div class="reset-all-settings-block">
      <button
        type="button"
        class="reset-all-settings-btn"
        :title="t('settings.resetAllSettingsHint')"
        @click="sfx.playControlClickSfx(); onResetAllSettings()"
      >
        {{ t("settings.resetAllSettings") }}
      </button>
    </div>
  </SettingsSection>
  </div>
</template>
