<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "@/i18n";
import { useGameStore } from "@/shared/stores/game";
import SettingsSection from "@/features/settings/SettingsSection.vue";
import SettingsRangeRow from "@/features/settings/SettingsRangeRow.vue";
import SettingsToggleRow from "@/features/settings/SettingsToggleRow.vue";
import SettingsSelectRow from "@/features/settings/SettingsSelectRow.vue";
import { OPTIONS_PANEL_SFX } from "./injectionKeys";

const { t } = useI18n();
const game = useGameStore();
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
      :model-value="game.doublePanelGapPx"
      :min="16"
      :max="160"
      :step="4"
      :display-value="`${game.doublePanelGapPx}px`"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (game.doublePanelGapPx = v)"
    />
  </SettingsSection>

  <SettingsSection :title="t('settings.judgmentCategory')">
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
      :on-toggle-sound="sfx.playToggleClickSfx"
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
      :on-toggle-sound="sfx.playToggleClickSfx"
      @update:model-value="(v) => (game.showParticles = v)"
    />
  </SettingsSection>
  </div>
</template>
