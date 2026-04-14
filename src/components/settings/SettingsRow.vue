<script setup lang="ts">
import HelpTooltip from "@/components/HelpTooltip.vue";

defineProps<{
  label?: string;
  helpKey?: string;
}>();
</script>

<template>
  <div class="setting-row">
    <label v-if="!$slots.label && label">
      {{ label }}
      <HelpTooltip v-if="helpKey" :help-key="helpKey" />
    </label>
    <slot name="label" />
    <slot />
  </div>
</template>

<style scoped>
.setting-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-color);
}
.setting-row:last-child {
  border-bottom: none;
}
.setting-row > label:not(.toggle-switch) {
  flex: 1;
  font-size: 0.85rem;
  color: var(--text-color);
  opacity: 0.85;
  display: flex;
  align-items: center;
}
.setting-row > :deep(input[type="range"]) {
  width: 120px;
  accent-color: var(--primary-color);
}
.value {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.4);
  min-width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 680px) {
  .setting-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .setting-row > :deep(input[type="range"]) {
    width: 100%;
  }
  .value {
    margin-left: auto;
  }
}
</style>
