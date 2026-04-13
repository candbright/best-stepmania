<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from "vue";
import { useI18n } from "@/i18n";

const props = defineProps<{
  show: boolean;
  existingPacks: string[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "confirm", packName: string): void;
}>();

const { t } = useI18n();

const packName = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

// Validation states
const validationError = computed(() => {
  const name = packName.value.trim();
  
  if (!name) {
    return t("songPacks.packNameRequired");
  }
  
  // Only allow letters, numbers, spaces, hyphens, and underscores
  const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
  if (!validPattern.test(name)) {
    return t("songPacks.packNameInvalidChars");
  }
  
  // Check for duplicates (case-insensitive)
  if (props.existingPacks.some(p => p.toLowerCase() === name.toLowerCase())) {
    return t("songPacks.packNameExists");
  }
  
  return null;
});

const isValid = computed(() => packName.value.trim() !== "" && validationError.value === null);

// Reset form when modal opens
watch(() => props.show, async (isShowing) => {
  if (isShowing) {
    packName.value = "";
    await nextTick();
    inputRef.value?.focus();
  }
});

// ESC key closes the modal
function onEscKey(e: KeyboardEvent) {
  if (e.key === "Escape" && props.show) {
    e.stopPropagation();
    e.preventDefault();
    handleClose();
  }
}

// Enter key confirms
function onEnterKey(e: KeyboardEvent) {
  if (e.key === "Enter" && isValid.value) {
    e.preventDefault();
    handleConfirm();
  }
}

watch(() => props.show, (val) => {
  if (val) {
    window.addEventListener("keydown", onEscKey, true);
    window.addEventListener("keydown", onEnterKey, true);
  } else {
    window.removeEventListener("keydown", onEscKey, true);
    window.removeEventListener("keydown", onEnterKey, true);
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", onEscKey, true);
  window.removeEventListener("keydown", onEnterKey, true);
});

function handleConfirm() {
  if (isValid.value) {
    emit("confirm", packName.value.trim());
  }
}

function handleClose() {
  packName.value = "";
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div v-if="show" class="modal-overlay" @click.self="handleClose">
        <div class="modal-box">
          <h3 class="modal-title">{{ t("songPacks.createEmptyPack") }}</h3>
          
          <div class="form-group">
            <label class="form-label">{{ t("songPacks.packName") }}</label>
            <input
              ref="inputRef"
              v-model="packName"
              type="text"
              class="form-input"
              :placeholder="t('songPacks.packNamePlaceholder')"
              autocomplete="off"
              spellcheck="false"
            />
            <p v-if="validationError" class="validation-error">
              {{ validationError }}
            </p>
          </div>

          <p class="form-hint">
            {{ t("songPacks.packNameHint") }}
          </p>

          <div class="modal-actions">
            <button class="btn-cancel" @click="handleClose">{{ t("cancel") }}</button>
            <button
              class="btn-confirm"
              :disabled="!isValid"
              @click="handleConfirm"
            >
              {{ t("songPacks.create") }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-bg, rgba(13, 13, 26, 0.8));
  backdrop-filter: blur(10px);
}

.modal-box {
  width: min(400px, calc(100% - 2rem));
  padding: 1.5rem;
  background: var(--section-bg, rgba(20, 12, 40, 0.95));
  border: 1px solid var(--border-color, color-mix(in srgb, var(--primary-color) 30%, transparent));
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}

.modal-title {
  margin: 0 0 1.25rem 0;
  font-family: "Orbitron", sans-serif;
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--text-color);
  text-align: center;
}

.form-group {
  margin-bottom: 0.75rem;
}

.form-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.4rem;
  text-transform: uppercase;
}

.form-input {
  width: 100%;
  padding: 0.6rem 0.85rem;
  font-size: 0.85rem;
  font-family: "Rajdhani", sans-serif;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: var(--text-color);
  outline: none;
  transition: border-color 0.15s;
}

.form-input:focus {
  border-color: var(--primary-color);
}

.form-input::placeholder {
  color: rgba(255, 255, 255, 0.25);
}

.validation-error {
  margin: 0.5rem 0 0 0;
  font-size: 0.72rem;
  color: rgba(255, 100, 100, 0.9);
  line-height: 1.4;
}

.form-hint {
  margin: 0.5rem 0 0 0;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1.25rem;
}

.btn-cancel {
  padding: 0.5rem 1.25rem;
  font-size: 0.8rem;
  font-family: "Rajdhani", sans-serif;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s;
}

.btn-cancel:hover {
  border-color: rgba(255, 255, 255, 0.3);
  color: var(--text-color);
  background: rgba(255, 255, 255, 0.05);
}

.btn-confirm {
  padding: 0.5rem 1.25rem;
  font-size: 0.8rem;
  font-weight: 700;
  font-family: "Orbitron", sans-serif;
  letter-spacing: 0.1em;
  background: linear-gradient(135deg, var(--primary-color), var(--accent-secondary));
  border: none;
  border-radius: 8px;
  color: var(--text-on-primary);
  cursor: pointer;
  transition: filter 0.15s;
}

.btn-confirm:hover:not(:disabled) {
  filter: brightness(1.15);
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>