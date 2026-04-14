<script setup lang="ts">
defineProps<{
  title: string;
  /** Larger title when pump-double layout */
  large?: boolean;
}>();
</script>

<template>
  <div class="hud-song-center">
    <div class="hud-song-title" :class="{ 'hud-song-title--large': large }">{{ title }}</div>
  </div>
</template>

<style scoped>
.hud-song-center {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}
.hud-song-title {
  font-size: 0.96rem;
  font-weight: 800;
  color: color-mix(in srgb, var(--text-color) 88%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.04em;
  max-width: min(56vw, 34rem);
  text-align: center;
}
.hud-song-title--large {
  font-size: 1rem;
}
</style>
