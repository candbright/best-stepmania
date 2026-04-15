<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "@/i18n";
import { useGameStore } from "@/stores/game";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import SettingsRangeRow from "@/components/settings/SettingsRangeRow.vue";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow.vue";
import SettingsSelectRow from "@/components/settings/SettingsSelectRow.vue";
import SettingsResetRow from "@/components/settings/SettingsResetRow.vue";
import { WINDOW_DISPLAY_PRESET_IDS } from "@/constants/windowDisplay";
import { OPTIONS_DIALOG, OPTIONS_PANEL_SFX } from "./injectionKeys";

const { t } = useI18n();
const game = useGameStore();
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
  game.cursorRippleEnabled = !(game.cursorRippleEnabled ?? true);
}
</script>

<template>
  <div class="options-category-root">
  <SettingsSection :title="t('settings.display')">
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
      :on-toggle-sound="sfx.playToggleClickSfx"
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
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (game.uiScale = v / 100)"
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
      :on-interact="sfx.playSliderClickSfx"
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
      :on-interact="sfx.playSliderClickSfx"
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
      :on-interact="sfx.playSliderClickSfx"
      @update:model-value="(v) => (game.cursorGlow = v / 100)"
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
            :class="{ active: game.cursorRippleEnabled }"
            data-sfx="off"
            :title="t('settings.cursorRippleEnabled')"
            @click="sfx.playControlClickSfx(); toggleClickEffectEnabledFromSectionHead()"
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
        :on-interact="sfx.playSliderClickSfx"
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
        :on-interact="sfx.playSliderClickSfx"
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
        :on-interact="sfx.playSliderClickSfx"
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
        :on-interact="sfx.playSliderClickSfx"
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
        :on-interact="sfx.playSliderClickSfx"
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
        :on-interact="sfx.playSliderClickSfx"
        @update:model-value="(v) => (game.cursorRippleGlow = v / 100)"
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
