<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useI18n } from "@/shared/i18n";
import { BaseModal } from "@/shared/ui";

const props = defineProps<{
  show: boolean;
  existingPacks: string[];
  submitting?: boolean;
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

function handleConfirm() {
  if (props.submitting) return;
  if (isValid.value) {
    emit("confirm", packName.value.trim());
  }
}

function handleClose() {
  if (props.submitting) return;
  packName.value = "";
  emit("close");
}

function onOpenChange(open: boolean) {
  if (!open) handleClose();
}

function onEnterKey(e: KeyboardEvent) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  handleConfirm();
}
</script>

<template>
  <BaseModal
    :model-value="show"
    :title="t('songPacks.createEmptyPack')"
    :close-disabled="props.submitting"
    width="min(440px, 92vw)"
    @update:model-value="onOpenChange"
  >
    <div class="form-modal-fields">
      <label class="form-modal-label">{{ t("songPacks.packName") }}</label>
      <input
        ref="inputRef"
        v-model="packName"
        type="text"
        class="form-modal-input"
        :placeholder="t('songPacks.packNamePlaceholder')"
        autocomplete="off"
        spellcheck="false"
        @keydown="onEnterKey"
      />
      <p v-if="validationError" class="form-modal-error">
        {{ validationError }}
      </p>

      <p class="form-modal-hint">
        {{ t("songPacks.packNameHint") }}
      </p>
    </div>

    <template #footer>
      <div class="form-modal-footer-inner">
        <button type="button" class="form-modal-btn" :disabled="props.submitting" @click="handleClose">{{ t("cancel") }}</button>
        <button
          type="button"
          class="form-modal-btn form-modal-btn--primary"
          :disabled="!isValid || props.submitting"
          @click="handleConfirm"
        >
          <span v-if="props.submitting" class="form-modal-btn-spinner" aria-hidden="true" />
          <span :class="{ 'form-modal-btn-label--hidden': props.submitting }">{{ t("songPacks.create") }}</span>
        </button>
      </div>
    </template>
  </BaseModal>
</template>
