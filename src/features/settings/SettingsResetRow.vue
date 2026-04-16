<script setup lang="ts">
withDefaults(
  defineProps<{
    disabled?: boolean;
    variant?: "card" | "default";
  }>(),
  { variant: "default" },
);

const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <div class="setting-row" :class="{ 'card-reset-row': variant === 'card' }">
    <button
      type="button"
      class="reset-keys-btn"
      :disabled="disabled"
      @click="emit('click')"
    >
      <slot />
    </button>
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
.card-reset-row {
  justify-content: flex-end;
  border-bottom: none;
  padding-bottom: 0;
}
.reset-keys-btn {
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: rgba(255, 80, 80, 0.12);
  color: rgba(255, 200, 200, 0.95);
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  box-shadow: none;
  background-clip: padding-box;
}
.reset-keys-btn:hover:not(:disabled) {
  border-color: rgba(255, 120, 120, 0.5);
  background: rgba(255, 80, 80, 0.2);
}
.reset-keys-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
