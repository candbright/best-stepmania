<script setup lang="ts">
import { computed, onUnmounted, useSlots, watch } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    closeOnOverlay?: boolean;
    closeOnEsc?: boolean;
    closeDisabled?: boolean;
    width?: string;
    /** When true, body scrolls inside a max-height shell (long forms). */
    bodyScrollable?: boolean;
  }>(),
  {
    title: "",
    closeOnOverlay: true,
    closeOnEsc: true,
    closeDisabled: false,
    width: "min(560px, 92vw)",
    bodyScrollable: false,
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const slots = useSlots();
const hasFooter = computed(() => Boolean(slots.footer));

function close() {
  if (props.closeDisabled) return;
  emit("update:modelValue", false);
}

function onEscKey(e: KeyboardEvent) {
  if (!props.modelValue || !props.closeOnEsc || props.closeDisabled) return;
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
    <div
      v-if="modelValue"
      class="base-modal-overlay"
      @click.self="closeOnOverlay && !closeDisabled ? close() : undefined"
    >
      <div
        class="form-modal-shell"
        :class="{ 'form-modal--scrollable': bodyScrollable }"
        role="dialog"
        aria-modal="true"
        :style="{ width }"
        @click.stop
      >
        <header class="form-modal-header">
          <slot name="title">
            <span class="form-modal-title">{{ title }}</span>
          </slot>
          <button type="button" class="form-modal-close" aria-label="close" :disabled="closeDisabled" @click="close">×</button>
        </header>
        <div class="form-modal-body">
          <slot />
        </div>
        <footer v-if="hasFooter" class="form-modal-footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.base-modal-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--bg-color) 24%, transparent);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 13000);
  padding: 1rem;
  box-sizing: border-box;
  animation: form-modal-mask-in 0.15s ease;
}

@keyframes form-modal-mask-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
