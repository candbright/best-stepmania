<script setup lang="ts">
import { useI18n } from "@/i18n";
import type { SessionPlayMode } from "@/utils/chartPlayMode";

const MODES: { key: SessionPlayMode; labelKey: string }[] = [
  { key: "pump-single", labelKey: "playMode.pump-single" },
  { key: "pump-double", labelKey: "playMode.pump-double" },
  { key: "pump-routine", labelKey: "playMode.pump-routine" },
];

withDefaults(
  defineProps<{
    current: SessionPlayMode;
    layout?: "title" | "inline";
    disabled?: boolean;
    keyboardHighlightIndex?: number | null;
  }>(),
  { layout: "inline", disabled: false, keyboardHighlightIndex: null },
);

const emit = defineEmits<{
  pick: [mode: SessionPlayMode];
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="play-mode-strip"
    :class="[`play-mode-strip--${layout}`]"
    role="group"
    :aria-label="t('playMode.title')"
  >
    <p v-if="layout === 'title'" class="strip-hint-title">{{ t("playMode.title") }}</p>
    <div class="strip-btns" :class="{ 'strip-btns--stack': layout === 'title' }">
      <button
        v-for="(m, idx) in MODES"
        :key="m.key"
        type="button"
        class="mode-btn"
        :class="[
          `mode-${m.key}`,
          { 'is-current': current === m.key },
          { 'is-menu-keyboard-focus': layout === 'title' && keyboardHighlightIndex === idx },
        ]"
        :disabled="disabled"
        @click="emit('pick', m.key)"
      >
        <span class="mode-btn-label">{{ t(m.labelKey) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@400;600;700&display=swap");

.play-mode-strip--inline {
  width: 100%;
}
.play-mode-strip--title {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.strip-hint-title {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  text-align: center;
  min-height: 1.35rem;
  line-height: 1.35rem;
}
.strip-btns {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
}
.strip-btns--stack {
  flex-direction: column;
  gap: 0.75rem;
}
.mode-btn {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  cursor: pointer;
  font-family: "Orbitron", sans-serif;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-on-primary);
  transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
}
.mode-btn:focus {
  outline: none;
}
.mode-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary-color) 75%, white);
  outline-offset: 2px;
}
.mode-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.play-mode-strip--inline .mode-btn {
  padding: 0.38rem 0.75rem;
  border-radius: 8px;
  font-size: 0.62rem;
  border: 2px solid transparent;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
}
.play-mode-strip--inline .mode-btn.is-current {
  border-color: rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 55%, transparent), 0 4px 18px rgba(0, 0, 0, 0.35);
}
.play-mode-strip--title .mode-btn {
  width: 100%;
  min-height: 50px;
  padding: 0.875rem 1.2rem;
  font-size: 1rem;
  letter-spacing: 0.15em;
  border-radius: 12px;
  box-shadow: 0 4px 22px rgba(0, 0, 0, 0.25);
}
.play-mode-strip--title .mode-btn.is-current {
  box-shadow:
    0 0 0 3px rgba(255, 255, 255, 0.5),
    0 6px 28px rgba(0, 0, 0, 0.35);
}
.play-mode-strip--title .mode-btn.is-menu-keyboard-focus {
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--primary-color) 75%, white),
    0 6px 28px rgba(0, 0, 0, 0.35);
}
.mode-btn-label {
  pointer-events: none;
}
.mode-btn:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: scale(1.02);
}
.mode-pump-single {
  background: linear-gradient(135deg, #00e5ff 0%, #00838f 100%);
}
.mode-pump-double {
  background: linear-gradient(135deg, #b388ff 0%, #5e35b1 100%);
}
.mode-pump-routine {
  background: linear-gradient(135deg, #ffca28 0%, #f57c00 100%);
}
</style>
