<script setup lang="ts">
import { computed, inject, watch } from "vue";
import { useI18n } from "@/shared/i18n";
import { useSettingsStore } from "@/shared/stores/settings";
import type { RhythmSfxStyle } from "@/shared/api/config";
import { BaseTooltip } from "@/shared/ui";
import { BaseSelect } from "@/shared/ui";
import { BaseNumberField } from "@/shared/ui";
import { SettingsSection } from "@/features/settings";
import { SettingsRangeRow } from "@/features/settings";
import { OPTIONS_PANEL_SFX } from "./injectionKeys";

const { t } = useI18n();
const settings = useSettingsStore();
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
  () => settings.metronomeSfxStyle,
  (next, prev) => {
    if (next !== prev && settings.metronomeSfxEnabled) {
      sfx.previewMetronomeSfxFromSettings();
    }
  },
);

watch(
  () => settings.rhythmSfxStyle,
  (next, prev) => {
    if (next !== prev && settings.rhythmSfxEnabled) {
      sfx.previewRhythmSfxFromSettings();
    }
  },
);

watch(
  () => settings.uiSfxStyle,
  (next, prev) => {
    if (next !== prev && settings.uiSfxEnabled) {
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
      :model-value="settings.masterVolume"
      :min="0"
      :max="100"
      :display-value="`${settings.masterVolume}%`"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (settings.masterVolume = v)"
    />
    <SettingsRangeRow
      :label="t('settings.musicVolume')"
      help-key="musicVolume"
      :model-value="settings.musicVolume"
      :min="0"
      :max="100"
      :display-value="`${settings.musicVolume}%`"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (settings.musicVolume = v)"
    />
    <SettingsRangeRow
      :label="t('settings.effectVolume')"
      help-key="effectVolume"
      :model-value="settings.effectVolume"
      :min="0"
      :max="100"
      :display-value="`${settings.effectVolume}%`"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (settings.effectVolume = v)"
    />
    <div class="setting-row">
      <label>{{ t("settings.audioOffset") }} <BaseTooltip help-key="audioOffset" /></label>
      <BaseNumberField
        v-model="settings.audioOffsetMs"
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
          <input type="checkbox" v-model="settings.metronomeSfxEnabled" @change="sfx.playToggleClickSfx" />
          <span class="toggle-slider" />
        </label>
      </div>
    </template>
    <SettingsRangeRow
      :label="t('settings.metronomeSfxVolume')"
      help-key="metronomeSfxVolume"
      :model-value="settings.metronomeSfxVolume"
      :min="0"
      :max="100"
      :display-value="`${settings.metronomeSfxVolume}%`"
      :disabled="!settings.metronomeSfxEnabled"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (settings.metronomeSfxVolume = v)"
    />
    <div class="setting-row">
      <label>
        {{ t("settings.metronomeSfxStyle") }}
        <button
          type="button"
          class="sfx-preview-icon-btn"
          data-sfx="off"
          :disabled="!settings.metronomeSfxEnabled"
          :title="t('settings.sfxPreviewMetronome')"
          aria-label="preview metronome sfx"
          @pointerup.stop.prevent="sfx.previewMetronomeSfxFromSettings"
          @mousedown.stop.prevent
        >
          ▶
        </button>
      </label>
      <BaseSelect
        :model-value="settings.metronomeSfxStyle"
        :options="metronomeSfxStyleOptions"
        :disabled="!settings.metronomeSfxEnabled"
        @update:model-value="(v) => (settings.metronomeSfxStyle = v as RhythmSfxStyle)"
      />
    </div>
  </SettingsSection>

  <SettingsSection>
    <template #head>
      <div class="section-head">
        <h3>{{ t("settings.rhythmSfx") }}</h3>
        <label class="toggle-switch section-head-toggle" :title="t('settings.rhythmSfxEnabled')">
          <input type="checkbox" v-model="settings.rhythmSfxEnabled" @change="sfx.playToggleClickSfx" />
          <span class="toggle-slider" />
        </label>
      </div>
    </template>
    <SettingsRangeRow
      :label="t('settings.rhythmSfxVolume')"
      help-key="rhythmSfxVolume"
      :model-value="settings.rhythmSfxVolume"
      :min="0"
      :max="100"
      :display-value="`${settings.rhythmSfxVolume}%`"
      :disabled="!settings.rhythmSfxEnabled"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (settings.rhythmSfxVolume = v)"
    />
    <div class="setting-row">
      <label>
        {{ t("settings.rhythmSfxStyle") }}
        <button
          type="button"
          class="sfx-preview-icon-btn"
          data-sfx="off"
          :disabled="!settings.rhythmSfxEnabled"
          :title="t('settings.sfxPreviewRhythm')"
          aria-label="preview rhythm sfx"
          @pointerup.stop.prevent="sfx.previewRhythmSfxFromSettings"
          @mousedown.stop.prevent
        >
          ▶
        </button>
      </label>
      <BaseSelect
        :model-value="settings.rhythmSfxStyle"
        :options="rhythmSfxStyleOptions"
        :disabled="!settings.rhythmSfxEnabled"
        @update:model-value="(v) => (settings.rhythmSfxStyle = v as RhythmSfxStyle)"
      />
    </div>
  </SettingsSection>

  <SettingsSection>
    <template #head>
      <div class="section-head">
        <h3>{{ t("settings.uiSfxStyle") }}</h3>
        <label class="toggle-switch section-head-toggle" :title="t('settings.uiSfxEnabled')">
          <input type="checkbox" v-model="settings.uiSfxEnabled" @change="sfx.playToggleClickSfx" />
          <span class="toggle-slider" />
        </label>
      </div>
    </template>
    <SettingsRangeRow
      :label="t('settings.uiSfxVolume')"
      :model-value="settings.uiSfxVolume"
      :min="0"
      :max="100"
      :display-value="`${settings.uiSfxVolume}%`"
      :disabled="!settings.uiSfxEnabled"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (settings.uiSfxVolume = v)"
    />
    <div class="setting-row">
      <label>
        {{ t("settings.uiSfxStyle") }}
        <button
          type="button"
          class="sfx-preview-icon-btn"
          data-sfx="off"
          :disabled="!settings.uiSfxEnabled"
          :title="t('settings.sfxPreviewPlay')"
          aria-label="preview ui sfx"
          @pointerup.stop.prevent="sfx.previewUiSfxFromSettings"
          @mousedown.stop.prevent
        >
          ▶
        </button>
      </label>
      <BaseSelect
        :model-value="settings.uiSfxStyle"
        :options="uiSfxStyleOptions"
        :disabled="!settings.uiSfxEnabled"
        @update:model-value="(v) => (settings.uiSfxStyle = v as 'classic' | 'soft' | 'arcade')"
      />
    </div>
  </SettingsSection>
  </div>
</template>
