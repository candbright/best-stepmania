<script setup lang="ts">
import { computed, onUnmounted, watch } from "vue";
import { useI18n } from "@/shared/i18n";

const props = withDefaults(
  defineProps<{
    /** v-model: controls visibility */
    modelValue: boolean;
    /** Modal title text */
    title: string;
    /** Primary description (shown below title) */
    description?: string;
    /** Secondary warning text (e.g., consequences) */
    warning?: string;
    /** Confirm button label */
    confirmLabel?: string;
    /** Show toggle checkbox for explicit confirmation */
    toggleConfirm?: boolean;
    /** Toggle checkbox label */
    toggleConfirmLabel?: string;
    /** Loading state (disables confirm, shows spinner) */
    loading?: boolean;
    /** Disabled state for confirm button */
    disabled?: boolean;
    /** Close on ESC key */
    closeOnEsc?: boolean;
  }>(),
  {
    description: "",
    warning: "",
    confirmLabel: "",
    toggleConfirm: false,
    toggleConfirmLabel: "",
    loading: false,
    disabled: false,
    closeOnEsc: true,
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

const { t } = useI18n();

const confirmLabel = computed(() => props.confirmLabel || t("confirm"));
const toggleConfirmLabel = computed(() => props.toggleConfirmLabel || t("confirm"));

const toggleChecked = defineModel<boolean>("toggleChecked", { default: false });

const canConfirm = computed(() => {
  if (props.loading || props.disabled) return false;
  if (props.toggleConfirm && !toggleChecked.value) return false;
  return true;
});

function close() {
  emit("update:modelValue", false);
  emit("cancel");
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
    if (open) {
      // Each open gets a fresh confirmation state so destructive dialogs
      // never inherit an old checked toggle from a previous session.
      if (props.toggleConfirm) toggleChecked.value = false;
      window.addEventListener("keydown", onEscKey, true);
    } else {
      window.removeEventListener("keydown", onEscKey, true);
    }
  },
  { immediate: true },
);

onUnmounted(() => window.removeEventListener("keydown", onEscKey, true));
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="danger-modal-overlay" @click.self="close">
      <div class="danger-modal" @click.stop>
        <h3 class="danger-modal__title">{{ title }}</h3>

        <p v-if="description" class="danger-modal__desc">
          <slot name="description">{{ description }}</slot>
        </p>

        <p v-if="warning" class="danger-modal__warning">
          <slot name="warning">{{ warning }}</slot>
        </p>

        <div v-if="toggleConfirm" class="danger-modal__toggle">
          <span>{{ toggleConfirmLabel }}</span>
          <label class="toggle-switch">
            <input v-model="toggleChecked" type="checkbox" />
            <span class="toggle-slider" />
          </label>
        </div>

        <div class="danger-modal__actions">
          <button type="button" class="danger-modal__btn" @click="close">
            {{ t("cancel") }}
          </button>
          <button
            type="button"
            class="danger-modal__btn danger-modal__btn--danger"
            :disabled="!canConfirm"
            @click="emit('confirm')"
          >
            <span v-if="loading" class="form-modal-btn-spinner" aria-hidden="true" />
            <span :class="{ 'form-modal-btn-label--hidden': loading }">{{ confirmLabel }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.danger-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.danger-modal {
  background: linear-gradient(180deg, rgba(29, 18, 44, 0.98), rgba(19, 13, 31, 0.98));
  border: 1px solid rgba(255, 82, 82, 0.2);
  border-radius: 18px;
  padding: 1.4rem 1.6rem;
  width: min(420px, 92vw);
  display: flex;
  flex-direction: column;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  font-family: 'Rajdhani', sans-serif;
  color: var(--text-color);
  animation: slideUp 0.15s ease;
}

@keyframes slideUp {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.danger-modal__title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  color: rgba(255, 100, 100, 0.7);
  margin-bottom: 1rem;
}

.danger-modal__desc {
  font-size: 0.82rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 0.5rem;
}

.danger-modal__warning {
  font-size: 0.74rem;
  color: rgba(255, 150, 100, 0.75);
  margin-top: 0.25rem;
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

.danger-modal__toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: space-between;
  margin-top: 0.6rem;
  font-size: 0.78rem;
  color: rgba(220, 210, 255, 0.75);
  cursor: pointer;
}

.toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  cursor: pointer;
  flex-shrink: 0;
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

.danger-modal__actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.danger-modal__btn {
  padding: 0.42rem 0.9rem;
  border-radius: 8px;
  font-size: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-family: 'Rajdhani', sans-serif;
  transition: background 0.15s, color 0.15s;
}

.danger-modal__btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-color);
}

.danger-modal__btn--danger {
  border-color: rgba(255, 82, 82, 0.4);
  background: rgba(255, 82, 82, 0.12);
  color: #ff6b6b;
}

.danger-modal__btn--danger:hover:not(:disabled) {
  background: rgba(255, 82, 82, 0.25);
}

.danger-modal__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

</style>
