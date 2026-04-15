<script setup lang="ts">
import { useI18n } from "@/i18n";

const { t } = useI18n();

defineProps<{
  showBackupRestore: boolean;
  showUnsavedExit: boolean;
}>();

const emit = defineEmits<{
  backupUseDisk: [];
  backupLoad: [];
  unsavedCancel: [];
  unsavedDiscard: [];
  unsavedStash: [];
  unsavedSave: [];
}>();
</script>

<template>
  <div
    v-if="showBackupRestore"
    class="modal-overlay modal-overlay--editor-prompt"
    @click.self="emit('backupUseDisk')"
  >
    <div class="modal-content editor-prompt-modal" role="dialog" aria-modal="true">
      <h3 class="editor-prompt-modal__title">{{ t("editor.backupRestoreTitle") }}</h3>
      <p v-if="t('editor.backupRestoreMessage').trim()" class="modal-desc editor-prompt-modal__desc">
        {{ t("editor.backupRestoreMessage") }}
      </p>
      <div class="modal-actions editor-prompt-modal__actions">
        <button type="button" class="tool-btn" @click="emit('backupUseDisk')">
          {{ t("editor.backupRestoreUseDisk") }}
        </button>
        <button type="button" class="tool-btn accent" @click="emit('backupLoad')">
          {{ t("editor.backupRestoreLoad") }}
        </button>
      </div>
    </div>
  </div>

  <div
    v-if="showUnsavedExit"
    class="modal-overlay modal-overlay--editor-prompt"
    @click.self="emit('unsavedCancel')"
  >
    <div class="modal-content editor-prompt-modal" role="dialog" aria-modal="true">
      <h3 class="editor-prompt-modal__title">{{ t("editor.unsavedExitTitle") }}</h3>
      <p v-if="t('editor.unsavedExitMessage').trim()" class="modal-desc editor-prompt-modal__desc">
        {{ t("editor.unsavedExitMessage") }}
      </p>
      <div class="modal-actions modal-actions--exit-choice editor-prompt-modal__actions">
        <button type="button" class="tool-btn" @click="emit('unsavedCancel')">
          {{ t("editor.unsavedCancel") }}
        </button>
        <button type="button" class="tool-btn danger" @click="emit('unsavedDiscard')">
          {{ t("editor.unsavedDontSave") }}
        </button>
        <button
          type="button"
          class="tool-btn"
          :title="t('editor.unsavedStashHint')"
          @click="emit('unsavedStash')"
        >
          {{ t("editor.unsavedStash") }}
        </button>
        <button type="button" class="tool-btn accent save-btn" @click="emit('unsavedSave')">
          {{ t("editor.unsavedSave") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-btn {
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  white-space: nowrap;
}
.tool-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-color);
}
.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tool-btn.danger {
  border-color: rgba(255, 23, 68, 0.3);
  color: #ff5252;
}
.tool-btn.danger:hover {
  background: rgba(255, 23, 68, 0.15);
}
.tool-btn.accent {
  border-color: color-mix(in srgb, var(--primary-color) 30%, transparent);
  color: color-mix(in srgb, var(--primary-color-hover) 70%, var(--text-color));
}
.tool-btn.accent:hover {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
}
.save-btn {
  background: rgba(0, 230, 118, 0.08);
  border-color: rgba(0, 230, 118, 0.2);
  color: #00e676;
}
.save-btn:hover {
  background: rgba(0, 230, 118, 0.15);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  animation: fadeIn 0.15s ease;
}
.modal-overlay--editor-prompt {
  padding: 1.25rem;
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.modal-content {
  background: var(--bg-color);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 1.5rem;
  min-width: 320px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.modal-content h3 {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: var(--text-color);
}
.editor-prompt-modal {
  width: min(100%, 28rem);
  min-width: min(100%, 17.5rem);
  max-width: 32rem;
  padding: 1.85rem 2rem 1.65rem;
  box-sizing: border-box;
  text-align: center;
}
.editor-prompt-modal__title {
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.35;
  margin: 0 0 0.75rem;
  text-align: center;
  color: var(--text-color);
}
.editor-prompt-modal__desc {
  margin: 0 auto 1.1rem;
  max-width: 26em;
  text-align: center;
  font-size: 0.95rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.78);
}
.editor-prompt-modal__actions {
  justify-content: center !important;
  margin-top: 0.25rem;
  gap: 0.55rem !important;
}
.editor-prompt-modal__actions .tool-btn {
  min-height: 2.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
}
.modal-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
  flex-wrap: wrap;
}
.modal-actions--exit-choice {
  justify-content: flex-end;
  gap: 0.4rem;
}
.modal-desc {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.72);
}
</style>
