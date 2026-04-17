<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "@/shared/i18n";
import { useSettingsStore } from "@/shared/stores/settings";
import { SettingsSection } from "@/features/settings";
import { SettingsRangeRow } from "@/features/settings";
import { SettingsToggleRow } from "@/features/settings";
import { SettingsSelectRow } from "@/features/settings";
import { SettingsResetRow } from "@/features/settings";
import { WINDOW_DISPLAY_PRESET_IDS } from "@/shared/constants/windowDisplay";
import { OPTIONS_DIALOG, OPTIONS_PANEL_SFX } from "./injectionKeys";

const { t } = useI18n();
const settings = useSettingsStore();
const sfx = inject(OPTIONS_PANEL_SFX)!;
const dialog = inject(OPTIONS_DIALOG)!;

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

const canResetCursorCoreSettings = computed(() => {
  return (
    settings.cursorEnabled !== true ||
    settings.cursorStylePreset !== "a" ||
    settings.cursorScale !== 1 ||
    settings.cursorOpacity !== 0.9 ||
    settings.cursorGlow !== 0.35 ||
    settings.cursorTrailsEnabled !== true
  );
});

const canResetClickEffectSettings = computed(() => {
  return (
    settings.cursorRippleEnabled !== true ||
    settings.cursorRippleDurationMs !== 480 ||
    settings.cursorRippleMinScale !== 0.65 ||
    settings.cursorRippleMaxScale !== 6.2 ||
    settings.cursorRippleOpacity !== 0.7 ||
    settings.cursorRippleLineWidth !== 1 ||
    settings.cursorRippleGlow !== 0.26
  );
});

function resetCursorCoreSettings() {
  settings.cursorEnabled = true;
  settings.cursorStylePreset = "a";
  settings.cursorScale = 1;
  settings.cursorOpacity = 0.9;
  settings.cursorGlow = 0.35;
  settings.cursorTrailsEnabled = true;
}

function resetClickEffectSettings() {
  settings.cursorRippleEnabled = true;
  settings.cursorRippleDurationMs = 480;
  settings.cursorRippleMinScale = 0.65;
  settings.cursorRippleMaxScale = 6.2;
  settings.cursorRippleOpacity = 0.7;
  settings.cursorRippleLineWidth = 1;
  settings.cursorRippleGlow = 0.26;
}

function onResetCursorCoreSettings() {
  if (!canResetCursorCoreSettings.value) return;
  dialog.requestConfirm({
    title: t("settings.cursor.resetAll"),
    message: t("settings.cursor.resetCoreConfirm"),
    confirmText: t("settings.cursor.resetAll"),
    onConfirm: () => resetCursorCoreSettings(),
  });
}

function onResetClickEffectSettings() {
  if (!canResetClickEffectSettings.value) return;
  dialog.requestConfirm({
    title: t("settings.cursor.resetAll"),
    message: t("settings.cursor.resetClickEffectConfirm"),
    confirmText: t("settings.cursor.resetAll"),
    onConfirm: () => resetClickEffectSettings(),
  });
}

function toggleClickEffectEnabledFromSectionHead() {
  settings.cursorRippleEnabled = !(settings.cursorRippleEnabled ?? true);
}
</script>

<template>
  <div class="options-category-root">
  <SettingsSection :title="t('settings.display')">
    <SettingsSelectRow
      :label="t('settings.windowDisplayMode')"
      help-key="windowDisplay"
      :model-value="settings.windowDisplayPreset"
      :options="windowDisplayPresetOptions"
      @update:model-value="(v) => (settings.windowDisplayPreset = String(v) as typeof settings.windowDisplayPreset)"
    />
    <SettingsToggleRow
      :label="t('settings.vsync')"
      help-key="vsync"
      :model-value="settings.vsync"
      :on-toggle-sound="sfx.playToggleClickSfx"
      @update:model-value="(v) => (settings.vsync = v)"
    />
    <SettingsSelectRow
      :label="t('settings.targetFps')"
      help-key="targetFps"
      :model-value="settings.targetFps"
      :options="targetFpsOptions"
      @update:model-value="(v) => (settings.targetFps = Number(v))"
    />
    <SettingsRangeRow
      :label="t('settings.uiScale')"
      help-key="uiScale"
      :model-value="Math.round(settings.uiScale * 100)"
      :min="75"
      :max="150"
      :step="5"
      :display-value="`${Math.round(settings.uiScale * 100)}%`"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (settings.uiScale = v / 100)"
    />
  </SettingsSection>

  <SettingsSection>
    <template #head>
      <div class="section-head">
        <h3>{{ t("settings.cursor") }}</h3>
      </div>
    </template>
    <SettingsSelectRow
      :label="t('settings.cursorStylePreset')"
      help-key="cursorStylePreset"
      :model-value="settings.cursorStylePreset"
      :options="cursorStylePresetOptions"
      @update:model-value="(v) => (settings.cursorStylePreset = v as 'a' | 'b')"
    />
    <SettingsRangeRow
      :label="t('settings.cursorScale')"
      help-key="cursorScale"
      :model-value="Math.round(settings.cursorScale * 100)"
      :min="70"
      :max="160"
      :step="5"
      :display-value="`${Math.round(settings.cursorScale * 100)}%`"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (settings.cursorScale = v / 100)"
    />
    <SettingsRangeRow
      :label="t('settings.cursorOpacity')"
      help-key="cursorOpacity"
      :model-value="Math.round(settings.cursorOpacity * 100)"
      :min="10"
      :max="100"
      :step="1"
      :display-value="`${Math.round(settings.cursorOpacity * 100)}%`"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (settings.cursorOpacity = v / 100)"
    />
    <SettingsRangeRow
      :label="t('settings.cursorGlow')"
      help-key="cursorGlow"
      :model-value="Math.round(settings.cursorGlow * 100)"
      :min="0"
      :max="100"
      :step="1"
      :display-value="`${Math.round(settings.cursorGlow * 100)}%`"
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (settings.cursorGlow = v / 100)"
    />
    <SettingsResetRow
      variant="card"
      :disabled="!canResetCursorCoreSettings"
      @click="sfx.playControlClickSfx(); onResetCursorCoreSettings()"
    >
      {{ t("settings.cursor.resetAll") }}
    </SettingsResetRow>
  </SettingsSection>

  <SettingsSection>
    <template #head>
      <div class="section-head">
        <h3>{{ t("settings.clickEffect") }}</h3>
        <div class="section-head-actions">
          <button
            type="button"
            class="toggle-switch ui-sfx-toggle-switch"
            :class="{ active: settings.cursorRippleEnabled }"
            data-sfx="off"
            :title="t('settings.cursorRippleEnabled')"
            @click="sfx.playControlClickSfx(); toggleClickEffectEnabledFromSectionHead()"
          >
            <span class="toggle-slider" />
          </button>
        </div>
      </div>
    </template>
    <template v-if="settings.cursorRippleEnabled">
      <SettingsRangeRow
        :label="t('settings.cursorRippleDurationMs')"
        help-key="cursorRippleDurationMs"
        :model-value="settings.cursorRippleDurationMs"
        :min="180"
        :max="1200"
        :step="10"
        :display-value="`${settings.cursorRippleDurationMs}ms`"
        :on-interact="sfx.playSliderClickSfx"
        @update:model-value="(v) => (settings.cursorRippleDurationMs = v)"
      />
      <SettingsRangeRow
        :label="t('settings.cursorRippleMinScale')"
        help-key="cursorRippleMinScale"
        :model-value="Math.round(settings.cursorRippleMinScale * 100)"
        :min="20"
        :max="240"
        :step="5"
        :display-value="`${settings.cursorRippleMinScale.toFixed(2)}x`"
        :on-interact="sfx.playSliderClickSfx"
        @update:model-value="(v) => (settings.cursorRippleMinScale = v / 100)"
      />
      <SettingsRangeRow
        :label="t('settings.cursorRippleMaxScale')"
        help-key="cursorRippleMaxScale"
        :model-value="Math.round(settings.cursorRippleMaxScale * 100)"
        :min="120"
        :max="1200"
        :step="10"
        :display-value="`${settings.cursorRippleMaxScale.toFixed(2)}x`"
        :on-interact="sfx.playSliderClickSfx"
        @update:model-value="(v) => (settings.cursorRippleMaxScale = v / 100)"
      />
      <SettingsRangeRow
        :label="t('settings.cursorRippleOpacity')"
        help-key="cursorRippleOpacity"
        :model-value="Math.round(settings.cursorRippleOpacity * 100)"
        :min="0"
        :max="100"
        :step="1"
        :display-value="`${Math.round(settings.cursorRippleOpacity * 100)}%`"
        :on-interact="sfx.playSliderClickSfx"
        @update:model-value="(v) => (settings.cursorRippleOpacity = v / 100)"
      />
      <SettingsRangeRow
        :label="t('settings.cursorRippleLineWidth')"
        help-key="cursorRippleLineWidth"
        :model-value="Math.round(settings.cursorRippleLineWidth * 10)"
        :min="5"
        :max="30"
        :step="1"
        :display-value="`${settings.cursorRippleLineWidth.toFixed(1)}px`"
        :on-interact="sfx.playSliderClickSfx"
        @update:model-value="(v) => (settings.cursorRippleLineWidth = v / 10)"
      />
      <SettingsRangeRow
        :label="t('settings.cursorRippleGlow')"
        help-key="cursorRippleGlow"
        :model-value="Math.round(settings.cursorRippleGlow * 100)"
        :min="0"
        :max="100"
        :step="1"
        :display-value="`${Math.round(settings.cursorRippleGlow * 100)}%`"
        :on-interact="sfx.playSliderClickSfx"
        @update:model-value="(v) => (settings.cursorRippleGlow = v / 100)"
      />
    </template>
    <SettingsResetRow
      variant="card"
      :disabled="!canResetClickEffectSettings"
      @click="sfx.playControlClickSfx(); onResetClickEffectSettings()"
    >
      {{ t("settings.cursor.resetAll") }}
    </SettingsResetRow>
  </SettingsSection>
  </div>
</template>
