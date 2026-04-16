<script setup lang="ts">
import { HelpTooltip } from "@/shared/ui";
import { CustomSelect } from "@/shared/ui";

type RowValue = string | number;

defineProps<{
  label: string;
  helpKey?: string;
  modelValue: RowValue;
  options: { label: string; value: RowValue }[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: RowValue];
}>();
</script>

<template>
  <div class="setting-row">
    <label>
      <slot name="label">
        {{ label }}
        <HelpTooltip v-if="helpKey" :help-key="helpKey" />
      </slot>
    </label>
    <CustomSelect
      :model-value="modelValue"
      :options="options"
      :disabled="disabled"
      @update:model-value="(v) => emit('update:modelValue', v)"
    />
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
@media (max-width: 680px) {
  .setting-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }
}
</style>
