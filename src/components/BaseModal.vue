<script setup lang="ts">
import { onUnmounted, watch } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    closeOnOverlay?: boolean;
    closeOnEsc?: boolean;
    width?: string;
  }>(),
  {
    title: "",
    closeOnOverlay: true,
    closeOnEsc: true,
    width: "min(560px, 92vw)",
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

function close() {
  emit("update:modelValue", false);
}

function onEscKey(e: KeyboardEvent) {
  if (!props.modelValue || !props.closeOnEsc) return;
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) window.addEventListener("keydown", onEscKey, true);
    else window.removeEventListener("keydown", onEscKey, true);
  },
  { immediate: true },
);

onUnmounted(() => window.removeEventListener("keydown", onEscKey, true));
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="base-modal-overlay" @click.self="closeOnOverlay ? close() : undefined">
      <div class="base-modal" role="dialog" aria-modal="true" :style="{ width }" @click.stop>
        <div class="base-modal-header">
          <slot name="title">
            <span class="base-modal-title">{{ title }}</span>
          </slot>
          <button type="button" class="base-modal-close" aria-label="close" @click="close">×</button>
        </div>
        <div class="base-modal-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.base-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 12000;
}

.base-modal {
  background: var(--bg-color);
  border: 1px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: base-modal-in 0.18s ease;
}

@keyframes base-modal-in {
  from {
    transform: translateY(14px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.base-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 1rem 1.25rem 0.6rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.base-modal-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: color-mix(in srgb, var(--text-color) 80%, transparent);
  line-height: 1.35;
}

.base-modal-close {
  border: none;
  background: transparent;
  color: var(--text-subtle);
  font-size: 1.4rem;
  line-height: 1;
  padding: 0 0.25rem;
}

.base-modal-close:hover {
  color: var(--text-color);
}

.base-modal-body {
  padding: 1rem 1.25rem 1.25rem;
}
</style>
