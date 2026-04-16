<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "@/i18n";
import { useGameStore } from "@/shared/stores/game";
import SettingsSection from "@/features/settings/SettingsSection.vue";
import KeyChordPicker from "@/widgets/KeyChordPicker.vue";
import type { KeyChord, ShortcutId } from "@/engine/keyBindings";
import {
  SHORTCUT_DEFAULTS,
  mergeShortcutBindings,
  bindingsEqual,
  bindingToChordList,
  resolveGameplayPumpDoubleLanes,
  GAMEPLAY_10_LANE_DEFAULT_CODES,
} from "@/engine/keyBindings";
import { OPTIONS_DIALOG, OPTIONS_PANEL_SFX } from "./injectionKeys";
import { OPTIONS_SHORTCUT_SECTIONS } from "./shortcutSections";

const { t } = useI18n();
const game = useGameStore();
const sfx = inject(OPTIONS_PANEL_SFX)!;
const dialog = inject(OPTIONS_DIALOG)!;

function chordsForShortcut(id: ShortcutId): KeyChord[] {
  return bindingToChordList(mergeShortcutBindings(game.shortcutOverrides)[id]);
}

function applyShortcut(id: ShortcutId, chords: KeyChord[]) {
  const def = SHORTCUT_DEFAULTS[id];
  const next = { ...game.shortcutOverrides };
  if (bindingsEqual(chords, def)) {
    delete next[id];
  } else {
    next[id] = chords.map((c) => ({ ...c }));
  }
  game.shortcutOverrides = next;
}

function laneChordsForIndex(i: number): KeyChord[] {
  const lanes = resolveGameplayPumpDoubleLanes(game.gameplayPumpDoubleLanes);
  const fallback = GAMEPLAY_10_LANE_DEFAULT_CODES[i] ?? "KeyZ";
  return [{ code: lanes[i] ?? fallback }];
}

function applyLaneCode(i: number, chords: KeyChord[]) {
  const code = chords[0]?.code?.trim() ?? "";
  const base = [...resolveGameplayPumpDoubleLanes(game.gameplayPumpDoubleLanes)];
  base[i] = code.length > 0 ? code : base[i] ?? "KeyZ";
  game.gameplayPumpDoubleLanes = base;
}

const canResetKeyBindings = computed(() => {
  const hasLaneOverrides = game.gameplayPumpDoubleLanes !== null;
  const hasShortcutOverrides = Object.keys(game.shortcutOverrides).length > 0;
  return hasLaneOverrides || hasShortcutOverrides;
});

function resetAllKeyBindings() {
  game.gameplayPumpDoubleLanes = null;
  game.shortcutOverrides = {};
}

function onResetAllKeyBindings() {
  if (!canResetKeyBindings.value) return;
  dialog.requestConfirm({
    title: t("settings.keybindings.resetAll"),
    message: t("settings.keybindings.resetAllConfirm"),
    confirmText: t("settings.keybindings.resetAll"),
    onConfirm: () => {
      resetAllKeyBindings();
    },
  });
}

function formatGameplayLane(n: number): string {
  return t("settings.keybindings.gameplayLane").replace("{n}", String(n));
}
</script>

<template>
  <div class="options-category-root">
  <SettingsSection class="keybindings-section">
    <template #head>
      <div class="section-head">
        <h3>{{ t("settings.keybindings.title") }}</h3>
        <button
          type="button"
          class="reset-keys-btn"
          :disabled="!canResetKeyBindings"
          @click="sfx.playControlClickSfx(); onResetAllKeyBindings()"
        >
          {{ t("settings.keybindings.resetAll") }}
        </button>
      </div>
    </template>
    <h4 class="subsection-title">{{ t("settings.keybindings.sectionGameplay10") }}</h4>
    <div v-for="lane in 10" :key="'lane-' + lane" class="setting-row keybind-row">
      <label>{{ formatGameplayLane(lane) }}</label>
      <KeyChordPicker
        plain-code-only
        :chords="laneChordsForIndex(lane - 1)"
        @update:chords="(c) => applyLaneCode(lane - 1, c)"
      />
    </div>

    <template v-for="sec in OPTIONS_SHORTCUT_SECTIONS" :key="sec.titleKey">
      <h4 class="subsection-title">{{ t(sec.titleKey) }}</h4>
      <div v-for="row in sec.rows" :key="row.id" class="setting-row keybind-row">
        <label>{{ t(row.labelKey) }}</label>
        <KeyChordPicker
          :chords="chordsForShortcut(row.id)"
          @update:chords="(c) => applyShortcut(row.id, c)"
        />
      </div>
    </template>
  </SettingsSection>
  </div>
</template>
