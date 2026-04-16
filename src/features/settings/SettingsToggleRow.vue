<script setup lang="ts">
import { BaseTooltip } from "@/shared/ui";

const props = defineProps<{
  label: string;
  helpKey?: string;
  modelValue: boolean;
  disabled?: boolean;
  onToggleSound?: () => void;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

function onChange(e: Event) {
  props.onToggleSound?.();
  emit("update:modelValue", (e.target as HTMLInputElement).checked);
}
</script>

<template>
  <div class="setting-row">
    <label>
      {{ label }}
      <BaseTooltip v-if="helpKey" :help-key="helpKey" />
    </label>
    <label class="toggle-switch">
      <input type="checkbox" :checked="modelValue" :disabled="disabled" @change="onChange" />
      <span class="toggle-slider" />
    </label>
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
.toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  cursor: pointer;
  flex: 0 0 36px;
  display: inline-block;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.toggle-slider {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 22px;
  transition: 0.2s;
}
.toggle-slider::before {
  content: "";
  position: absolute;
  width: 14px;
  height: 14px;
  left: 3px;
  bottom: 3px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  transition: 0.2s;
}
.toggle-switch input:checked + .toggle-slider {
  background: var(--primary-color);
}
.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(16px);
  background: var(--text-on-primary);
}
.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.4;
  cursor: not-allowed;
}
@media (max-width: 680px) {
  .setting-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }
}
</style>
