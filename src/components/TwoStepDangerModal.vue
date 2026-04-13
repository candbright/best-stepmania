<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";

const props = defineProps<{
  modelValue: boolean;
  title: string;
  step1Message: string;
  step2Message: string;
  continueLabel: string;
  cancelLabel: string;
  backLabel: string;
  confirmLabel: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  confirm: [];
}>();

const step = ref<1 | 2>(1);

function close() {
  emit("update:modelValue", false);
}

function onEscKey(e: KeyboardEvent) {
  if (!props.modelValue) return;
  if (e.key === "Escape") {
    e.stopPropagation();
    e.preventDefault();
    close();
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      step.value = 1;
      window.addEventListener("keydown", onEscKey, true);
    } else {
      window.removeEventListener("keydown", onEscKey, true);
    }
  },
  { immediate: true },
);

onUnmounted(() => window.removeEventListener("keydown", onEscKey, true));

function goStep2() {
  step.value = 2;
}

function goStep1() {
  step.value = 1;
}

function onConfirm() {
  emit("confirm");
  close();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-overlay" @click.self="close">
      <div class="modal danger-modal" role="dialog" aria-modal="true" :aria-labelledby="'tsdm-title'" @click.stop>
        <h3 id="tsdm-title" class="modal-title danger">{{ title }}</h3>
        <p v-if="step === 1" class="modal-desc">{{ step1Message }}</p>
        <p v-else class="modal-desc modal-desc--emphasis">{{ step2Message }}</p>
        <div class="modal-actions">
          <template v-if="step === 1">
            <button type="button" class="modal-btn" @click="close">{{ cancelLabel }}</button>
            <button type="button" class="modal-btn accent" @click="goStep2">{{ continueLabel }}</button>
          </template>
          <template v-else>
            <button type="button" class="modal-btn" @click="goStep1">{{ backLabel }}</button>
            <button type="button" class="modal-btn danger" @click="onConfirm">{{ confirmLabel }}</button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Orbitron:wght@700&display=swap");

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 12000;
}
.modal {
  background: linear-gradient(180deg, rgba(29, 18, 44, 0.98), rgba(19, 13, 31, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  padding: 1.4rem 1.6rem;
  width: min(440px, 92vw);
  display: flex;
  flex-direction: column;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  font-family: "Rajdhani", sans-serif;
  color: var(--text-color, rgba(255, 255, 255, 0.9));
}
.danger-modal {
  border-color: rgba(255, 82, 82, 0.2);
}
.modal-title {
  font-family: "Orbitron", sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 1rem;
}
.modal-title.danger {
  color: rgba(255, 100, 100, 0.75);
}
.modal-desc {
  font-size: 0.84rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.72);
  margin-bottom: 0.25rem;
}
.modal-desc--emphasis {
  color: rgba(255, 180, 140, 0.88);
}
.modal-actions {
  margin-top: 1.1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.modal-btn {
  padding: 0.42rem 0.9rem;
  border-radius: 8px;
  font-size: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  font-family: "Rajdhani", sans-serif;
}
.modal-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-color, #fff);
}
.modal-btn.accent {
  border-color: color-mix(in srgb, var(--primary-color, #a78bfa) 45%, transparent);
  background: color-mix(in srgb, var(--primary-color, #a78bfa) 18%, transparent);
  color: var(--text-color, #fff);
}
.modal-btn.danger {
  border-color: rgba(255, 82, 82, 0.45);
  background: rgba(255, 82, 82, 0.14);
  color: #ff8a80;
}
.modal-btn.danger:hover {
  background: rgba(255, 82, 82, 0.28);
}
</style>
