<script setup lang="ts">
import { computed, inject, watch } from "vue";
import { useI18n } from "@/i18n";
import { useGameStore } from "@/shared/stores/game";
import type { RhythmSfxStyle } from "@/api/config";
import { HelpTooltip } from "@/shared/ui";
import { CustomSelect } from "@/shared/ui";
import { AppNumberField } from "@/shared/ui";
import { SettingsSection } from "@/features/settings";
import { SettingsRangeRow } from "@/features/settings";
import { OPTIONS_PANEL_SFX } from "./injectionKeys";

const { t } = useI18n();
const game = useGameStore();
const sfx = inject(OPTIONS_PANEL_SFX)!;

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

watch(
  () => game.metronomeSfxStyle,
  (next, prev) => {
    if (next !== prev && game.metronomeSfxEnabled) {
      sfx.previewMetronomeSfxFromSettings();
    }
  },
);

watch(
  () => game.rhythmSfxStyle,
  (next, prev) => {
    if (next !== prev && game.rhythmSfxEnabled) {
      sfx.previewRhythmSfxFromSettings();
    }
  },
);

watch(
  () => game.uiSfxStyle,
  (next, prev) => {
    if (next !== prev && game.uiSfxEnabled) {
      sfx.previewUiSfxFromSettings();
    }
  },
);
</script>

<template>
  <div class="options-category-root">
  <SettingsSection :title="t('settings.audio')">
    <SettingsRangeRow
      :label="t('settings.masterVolume')"
      help-key="masterVolume"
      :model-value="game.masterVolume"
      :min="0"
      :max="100"
      :display-value="`${game.masterVolume}%`"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (game.masterVolume = v)"
    />
    <SettingsRangeRow
      :label="t('settings.musicVolume')"
      help-key="musicVolume"
      :model-value="game.musicVolume"
      :min="0"
      :max="100"
      :display-value="`${game.musicVolume}%`"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (game.musicVolume = v)"
    />
    <SettingsRangeRow
      :label="t('settings.effectVolume')"
      help-key="effectVolume"
      :model-value="game.effectVolume"
      :min="0"
      :max="100"
      :display-value="`${game.effectVolume}%`"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (game.effectVolume = v)"
    />
    <div class="setting-row">
      <label>{{ t("settings.audioOffset") }} <HelpTooltip help-key="audioOffset" /></label>
      <AppNumberField
        v-model="game.audioOffsetMs"
        input-class="audio-offset-ms-input"
        :step="1"
        hide-steppers
      />
    </div>
  </SettingsSection>

  <SettingsSection>
    <template #head>
      <div class="section-head">
        <h3>{{ t("settings.metronomeSfx") }}</h3>
        <label class="toggle-switch section-head-toggle" :title="t('settings.metronomeSfxEnabled')">
          <input type="checkbox" v-model="game.metronomeSfxEnabled" @change="sfx.playToggleClickSfx" />
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
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (game.metronomeSfxVolume = v)"
    />
    <div class="setting-row">
      <label>
        {{ t("settings.metronomeSfxStyle") }}
        <button
          type="button"
          class="sfx-preview-icon-btn"
          data-sfx="off"
          :disabled="!game.metronomeSfxEnabled"
          :title="t('settings.sfxPreviewMetronome')"
          aria-label="preview metronome sfx"
          @pointerup.stop.prevent="sfx.previewMetronomeSfxFromSettings"
          @mousedown.stop.prevent
        >
          ▶
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

  <SettingsSection>
    <template #head>
      <div class="section-head">
        <h3>{{ t("settings.rhythmSfx") }}</h3>
        <label class="toggle-switch section-head-toggle" :title="t('settings.rhythmSfxEnabled')">
          <input type="checkbox" v-model="game.rhythmSfxEnabled" @change="sfx.playToggleClickSfx" />
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
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (game.rhythmSfxVolume = v)"
    />
    <div class="setting-row">
      <label>
        {{ t("settings.rhythmSfxStyle") }}
        <button
          type="button"
          class="sfx-preview-icon-btn"
          data-sfx="off"
          :disabled="!game.rhythmSfxEnabled"
          :title="t('settings.sfxPreviewRhythm')"
          aria-label="preview rhythm sfx"
          @pointerup.stop.prevent="sfx.previewRhythmSfxFromSettings"
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
  </SettingsSection>

  <SettingsSection>
    <template #head>
      <div class="section-head">
        <h3>{{ t("settings.uiSfxStyle") }}</h3>
        <label class="toggle-switch section-head-toggle" :title="t('settings.uiSfxEnabled')">
          <input type="checkbox" v-model="game.uiSfxEnabled" @change="sfx.playToggleClickSfx" />
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
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (game.uiSfxVolume = v)"
    />
    <div class="setting-row">
      <label>
        {{ t("settings.uiSfxStyle") }}
        <button
          type="button"
          class="sfx-preview-icon-btn"
          data-sfx="off"
          :disabled="!game.uiSfxEnabled"
          :title="t('settings.sfxPreviewPlay')"
          aria-label="preview ui sfx"
          @pointerup.stop.prevent="sfx.previewUiSfxFromSettings"
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
  </SettingsSection>
  </div>
</template>
