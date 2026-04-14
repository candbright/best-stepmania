<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    disabled?: boolean;
    locked?: boolean;
    accentClass?: string;
  }>(),
  {
    disabled: false,
    locked: false,
    accentClass: "",
  },
);
</script>

<template>
  <section class="settings-card" :class="{ disabled, locked, [accentClass]: !!accentClass }">
    <div class="settings-card-header">
      <h3>{{ title }}</h3>
      <slot name="header" />
    </div>

    <div v-if="!disabled" class="settings-card-body">
      <slot />
    </div>
    <div v-else class="settings-card-disabled-body">
      <slot name="disabled">—</slot>
    </div>
  </section>
</template>

<style scoped>
.settings-card {
  flex: 1;
  min-width: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02));
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  transition: opacity 0.2s, border-color 0.2s;
}
.settings-card.disabled { opacity: 0.5; border-color: rgba(255,255,255,0.04); }
.settings-card.locked {
  border-color: rgba(100,100,100,0.3);
  background: linear-gradient(180deg, rgba(50,50,50,0.15), rgba(40,40,40,0.1));
}
.settings-card-header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.settings-card.locked .settings-card-header { background: rgba(60,60,60,0.2); }
.settings-card-header h3 {
  font-size: 0.7rem; letter-spacing: 0.2em; color: rgba(255,255,255,0.5);
  margin: 0; white-space: nowrap;
}
.settings-card-body { padding: 0.65rem 0.85rem; }
.settings-card-disabled-body {
  padding: 2rem 1rem; text-align: center;
  color: rgba(255,255,255,0.2); font-size: 0.8rem;
}
</style>
