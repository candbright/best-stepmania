<script setup lang="ts">
import { BaseTooltip } from "@/shared/ui";

const props = withDefaults(
  defineProps<{
    label: string;
    helpKey?: string;
    modelValue: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
    displayValue: string;
    onInteract?: () => void;
  }>(),
  { step: 1, disabled: false },
);

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

function onInput(e: Event) {
  emit("update:modelValue", Number((e.target as HTMLInputElement).value));
}
</script>

<template>
  <div class="setting-row">
    <label>
      {{ label }}
      <BaseTooltip v-if="helpKey" :help-key="helpKey" />
    </label>
    <input
      type="range"
      :min="props.min"
      :max="props.max"
      :step="props.step"
      :disabled="props.disabled"
      :value="props.modelValue"
      @pointerdown="onInteract?.()"
      @mousedown="onInteract?.()"
      @click="onInteract?.()"
      @input="onInput"
    />
    <span class="value">{{ displayValue }}</span>
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
input[type="range"] {
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
  input[type="range"] {
    width: 100%;
  }
  .value {
    margin-left: auto;
  }
}
</style>
