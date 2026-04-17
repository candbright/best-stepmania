<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "@/shared/i18n";
import { SettingsSection } from "@/features/settings";
import { exportDiagnosticsAndOpen } from "@/shared/services/tauri/diagnostics";
import { OPTIONS_DIALOG, OPTIONS_PANEL_SFX } from "./injectionKeys";

const { t } = useI18n();
const sfx = inject(OPTIONS_PANEL_SFX)!;
const dialog = inject(OPTIONS_DIALOG)!;

const diagnosticsItems = computed(() => [
  t("settings.exportDiagnosticsItem.systemInfo"),
  t("settings.exportDiagnosticsItem.config"),
  t("settings.exportDiagnosticsItem.databases"),
  t("settings.exportDiagnosticsItem.recoveryBackups"),
  t("settings.exportDiagnosticsItem.logs"),
  t("settings.exportDiagnosticsItem.songLibrary"),
  t("settings.exportDiagnosticsItem.scanState"),
  t("settings.exportDiagnosticsItem.noteskins"),
  t("settings.exportDiagnosticsItem.chartCache"),
]);

async function runExportDiagnostics() {
  try {
    await exportDiagnosticsAndOpen();
  } catch (e: unknown) {
    console.error("Failed to export diagnostics:", e);
  }
}

function onExportDiagnostics() {
  dialog.requestConfirm({
    title: t("settings.exportDiagnostics"),
    message: t("settings.exportDiagnosticsConfirm"),
    bullets: diagnosticsItems.value,
    confirmText: t("confirm"),
    onConfirm: () => runExportDiagnostics(),
  });
}
</script>

<template>
  <div class="options-category-root">
  <SettingsSection :title="t('settings.about')">
    <div class="about-info">
      <p class="about-version">Best-StepMania v1.0.0</p>
      <p class="about-desc">{{ t("settings.aboutDescription") }}</p>
      <p class="about-desc">内测问题反馈群：1098757120</p>
    </div>
    <div class="setting-row">
      <button type="button" class="export-diagnostics-btn" @click="sfx.playControlClickSfx(); onExportDiagnostics()">
        {{ t("settings.exportDiagnostics") }}
      </button>
    </div>
  </SettingsSection>
  </div>
</template>
