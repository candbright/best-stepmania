<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "@/i18n";
import { useGameStore } from "@/shared/stores/game";
import { SettingsSection } from "@/features/settings";
import { SettingsSelectRow } from "@/features/settings";
import { APP_THEME_IDS } from "@/constants/appThemes";
import { OPTIONS_DIALOG, OPTIONS_PANEL_SFX } from "./injectionKeys";

const { t } = useI18n();
const game = useGameStore();
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
    await game.resetAllSettingsToDefaults();
    await game.loadSongs(undefined, { force: true });
  } catch (e: unknown) {
    console.error(e);
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
        @click="sfx.playControlClickSfx(); onResetAllSettings()"
      >
        {{ t("settings.resetAllSettings") }}
      </button>
    </div>
  </SettingsSection>
  </div>
</template>
