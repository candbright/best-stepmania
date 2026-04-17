<script setup lang="ts">
defineProps<{
  difficulty: string;
  meter: string | number;
}>();
</script>

<template>
  <div class="hud-song-sub">
    {{ difficulty }} <span class="hud-meter">{{ meter }}</span>
  </div>
</template>

<style scoped>
.hud-song-sub {
  font-size: 0.68rem;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.hud-meter {
  color: var(--accent-secondary);
  font-weight: 700;
  margin-left: 0.25em;
}
</style>
