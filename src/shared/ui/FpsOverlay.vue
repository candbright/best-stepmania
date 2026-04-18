<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { useI18n } from "@/shared/i18n";
import { useSettingsStore } from "@/shared/stores/settings";

const { t } = useI18n();
const settings = useSettingsStore();

const fps = ref(0);
let rafId = 0;
const stamps: number[] = [];
const WINDOW_MS = 1000;

function tick(now: number) {
  stamps.push(now);
  const cutoff = now - WINDOW_MS;
  while (stamps.length > 0 && stamps[0]! < cutoff) {
    stamps.shift();
  }
  fps.value = stamps.length;
  rafId = requestAnimationFrame(tick);
}

function start() {
  stamps.length = 0;
  rafId = requestAnimationFrame(tick);
}

function stop() {
  cancelAnimationFrame(rafId);
  stamps.length = 0;
  fps.value = 0;
}

watch(
  () => settings.showFpsOverlay,
  (on) => {
    if (on) start();
    else stop();
  },
  { immediate: true },
);

onUnmounted(stop);
</script>

<template>
  <div
    v-if="settings.showFpsOverlay"
    class="fps-overlay"
    aria-hidden="true"
  >
    <span class="fps-overlay__value">{{ fps }}</span>
    <span class="fps-overlay__unit">{{ t("gameplay.dev.fps") }}</span>
  </div>
</template>

<style scoped>
.fps-overlay {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: calc(var(--z-cursor, 2147483647) - 1);
  pointer-events: none;
  display: flex;
  align-items: baseline;
  gap: 0.35em;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  color: var(--text-color);
  background: color-mix(in srgb, var(--bg-color) 78%, transparent);
  border: 1px solid color-mix(in srgb, var(--text-color) 18%, transparent);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--bg-color) 40%, transparent);
}

.fps-overlay__value {
  font-weight: 600;
}

.fps-overlay__unit {
  opacity: 0.85;
  font-weight: 500;
}
</style>
