<script setup lang="ts">
/**
 * BaseFormModal - Standard form modal shell with:
 * - Overlay with backdrop blur
 * - Header with title and close button
 * - Scrollable body slot
 * - Footer with action buttons slot
 * - Optional bottom hint (via useModalBottomHintLayout)
 */
import { computed, onUnmounted, ref, watch } from "vue";
import { useI18n } from "@/i18n";
import { useModalBottomHintLayout } from "@/shared/composables/useModalBottomHintLayout";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    /** v-model: controls visibility */
    modelValue: boolean;
    /** Modal title */
    title?: string;
    /** Width of modal (CSS value) */
    width?: string;
    /** Show wide variant (e.g., for complex forms) */
    wide?: boolean;
    /** Shown below the dialog card, above screen bottom (e.g., keyboard hint) */
    bottomHint?: string;
    /** Close on ESC key */
    closeOnEsc?: boolean;
    /** Close when clicking overlay */
    closeOnOverlay?: boolean;
  }>(),
  {
    title: "",
    width: "min(560px, 92vw)",
    wide: false,
    bottomHint: "",
    closeOnEsc: true,
    closeOnOverlay: true,
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "close"): void;
}>();

const modalMaskRef = ref<HTMLElement | null>(null);
const modalCardRef = ref<HTMLElement | null>(null);
const overlayActive = computed(() => props.modelValue);
const { hintVisible } = useModalBottomHintLayout(modalMaskRef, modalCardRef, {
  active: overlayActive,
  hasHint: () => props.bottomHint.trim().length > 0,
});

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

function close() {
  show.value = false;
  emit("close");
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
  <Teleport v-if="show" to="body">
    <div ref="modalMaskRef" class="form-modal-mask">
      <div class="form-modal-mask-fill" @click.self="closeOnOverlay ? close() : undefined">
        <div
          ref="modalCardRef"
          class="form-modal-shell"
          :class="{
            'form-modal-card--wide': wide,
            'form-modal--scrollable': true,
          }"
          :style="{ width }"
          role="dialog"
          aria-modal="true"
          @click.stop
        >
          <header class="form-modal-header">
            <span class="form-modal-title">{{ title }}</span>
            <button type="button" class="form-modal-close" aria-label="close" @click="close">
              ×
            </button>
          </header>

          <div class="form-modal-body">
            <slot />
          </div>

          <footer class="form-modal-footer">
            <slot name="footer">
              <div class="form-modal-footer-inner">
                <button type="button" class="form-modal-btn" @click="close">
                  {{ t("cancel") }}
                </button>
              </div>
            </slot>
          </footer>
        </div>
      </div>
      <p v-if="hintVisible" class="form-modal-mask-hint">{{ bottomHint }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.form-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 13000);
  padding: 1rem;
  box-sizing: border-box;
}

.form-modal-mask-fill {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.form-modal-shell {
  background: linear-gradient(180deg, rgba(29, 18, 44, 0.98), rgba(19, 13, 31, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 2rem);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  animation: form-modal-mask-in 0.15s ease;
}

.form-modal-card--wide {
  width: min(680px, 92vw);
}

.form-modal--scrollable .form-modal-body {
  overflow-y: auto;
}

@keyframes form-modal-mask-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.form-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  flex-shrink: 0;
}

.form-modal-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
}

.form-modal-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.15s, color 0.15s;
}

.form-modal-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.form-modal-body {
  padding: 0.5rem 1.25rem;
  flex: 1;
  min-height: 0;
}

.form-modal-footer {
  padding: 0.75rem 1.25rem 1rem;
  flex-shrink: 0;
}

.form-modal-footer-inner {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.form-modal-btn {
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  font-size: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}

.form-modal-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-color);
}

.form-modal-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.form-modal-btn--primary {
  border-color: rgba(0, 230, 118, 0.3);
  background: rgba(0, 230, 118, 0.1);
  color: #00e676;
}

.form-modal-btn--primary:hover:not(:disabled) {
  background: rgba(0, 230, 118, 0.2);
}

.form-modal-mask-hint {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: rgba(255, 255, 255, 0.6);
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-family: 'Rajdhani', sans-serif;
  pointer-events: none;
  animation: hint-in 0.2s ease;
}

@keyframes hint-in {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
