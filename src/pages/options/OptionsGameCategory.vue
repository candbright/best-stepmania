<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "@/shared/i18n";
import { useSettingsStore } from "@/shared/stores/settings";
import { SettingsSection } from "@/features/settings";
import { SettingsRangeRow } from "@/features/settings";
import { SettingsToggleRow } from "@/features/settings";
import { SettingsSelectRow } from "@/features/settings";
import { OPTIONS_PANEL_SFX } from "./injectionKeys";

const { t } = useI18n();
const settings = useSettingsStore();
const sfx = inject(OPTIONS_PANEL_SFX)!;

const judgmentStyleOptions = computed(() => [
  { label: t("settings.judgmentStyle.ddr"), value: "ddr" },
  { label: t("settings.judgmentStyle.itg"), value: "itg" },
]);

const lifeTypeOptions = computed(() => [
  { label: t("settings.lifeType.bar"), value: "bar" },
  { label: t("settings.lifeType.battery"), value: "battery" },
  { label: t("settings.lifeType.survival"), value: "survival" },
]);

const batteryLivesOptions = computed(() =>
  Array.from({ length: 10 }, (_, i) => ({ label: `${i + 1}`, value: i + 1 })),
);
</script>

<template>
  <div class="options-category-root">
  <SettingsSection :title="t('settings.layout')">
    <SettingsRangeRow
      :label="t('settings.doublePanelGap')"
      help-key="doublePanelGap"
      :model-value="settings.doublePanelGapPx"
      :min="16"
      :max="160"
      :step="4"
      :display-value="`${settings.doublePanelGapPx}px`"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (settings.doublePanelGapPx = v)"
    />
  </SettingsSection>

  <SettingsSection :title="t('settings.judgmentCategory')">
    <SettingsSelectRow
      :label="t('settings.judgmentStyle')"
      help-key="judgmentStyle"
      :model-value="settings.judgmentStyle"
      :options="judgmentStyleOptions"
      @update:model-value="(v) => (settings.judgmentStyle = v as 'ddr' | 'itg')"
    />
    <SettingsToggleRow
      :label="t('settings.showOffset')"
      help-key="showOffset"
      :model-value="settings.showOffset"
      :on-toggle-sound="sfx.playToggleClickSfx"
      @update:model-value="(v) => (settings.showOffset = v)"
    />
    <SettingsSelectRow
      :label="t('settings.lifeType')"
      help-key="lifeType"
      :model-value="settings.lifeType"
      :options="lifeTypeOptions"
      @update:model-value="(v) => (settings.lifeType = v as 'bar' | 'battery' | 'survival')"
    />
    <SettingsSelectRow
      v-if="settings.lifeType === 'battery'"
      :label="t('settings.batteryLives')"
      help-key="batteryLives"
      :model-value="settings.batteryLives"
      :options="batteryLivesOptions"
      @update:model-value="(v) => (settings.batteryLives = Number(v))"
    />
    <SettingsToggleRow
      :label="t('playerOpt.showParticles')"
      help-key="showParticles"
      :model-value="settings.showParticles"
      :on-toggle-sound="sfx.playToggleClickSfx"
      @update:model-value="(v) => (settings.showParticles = v)"
    />
  </SettingsSection>
  </div>
</template>
