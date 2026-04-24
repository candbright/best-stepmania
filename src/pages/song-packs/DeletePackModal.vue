<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "@/shared/i18n";
import * as api from "@/shared/api";
import type { SongPackInfo } from "@/shared/api";
import { BaseModal } from "@/shared/ui";

const props = defineProps<{
  pack: SongPackInfo | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "success"): void;
  (e: "error", msg: string): void;
}>();

const { t } = useI18n();

const deletingPack = ref(false);
const confirmChecked = ref(false);

watch(
  () => props.pack,
  (nextPack) => {
    if (nextPack) confirmChecked.value = false;
  },
);

async function doDeletePack() {
  if (!props.pack || !confirmChecked.value || deletingPack.value) return;
  deletingPack.value = true;
  try {
    await api.deleteSongPack(props.pack.name);
    emit("success");
  } catch (e: unknown) {
    emit("error", String(e));
  } finally {
    deletingPack.value = false;
  }
}

function onOpenChange(open: boolean) {
  if (!open && !deletingPack.value) emit("close");
}
</script>

<template>
  <BaseModal
    :model-value="pack !== null"
    :title="`${t('songPacks.delete')}: ${pack?.name ?? ''}`"
    :close-disabled="deletingPack"
    width="min(440px, 92vw)"
    @update:model-value="onOpenChange"
  >
    <div class="form-modal-fields">
      <p class="modal-path-row">
        <span class="modal-label-inline">{{ t("songPacks.packPath") }}:</span>
      </p>
      <span class="modal-path">{{ pack?.path }}</span>
      <p class="delete-pack-warning">{{ t('songPacks.confirmDeletePackWarning') }}</p>

      <label class="form-modal-check">
        <span>{{ t('songPacks.confirmDelete') }}</span>
        <input v-model="confirmChecked" type="checkbox" />
      </label>
    </div>

    <template #footer>
      <div class="form-modal-footer-inner">
        <button type="button" class="form-modal-btn" :disabled="deletingPack" @click="emit('close')">{{ t('cancel') }}</button>
        <button
          type="button"
          class="form-modal-btn form-modal-btn--primary"
          :disabled="deletingPack || !confirmChecked"
          @click="doDeletePack"
        >
          <span v-if="deletingPack" class="form-modal-btn-spinner" aria-hidden="true" />
          <span :class="{ 'form-modal-btn-label--hidden': deletingPack }">{{ t('songPacks.delete') }}</span>
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.modal-path-row {
  margin: 0;
}

.modal-label-inline {
  font-size: 0.7rem;
  color: rgba(220, 210, 255, 0.5);
  margin-right: 0.4rem;
}
.modal-path {
  display: block;
  margin-top: 0.2rem;
  font-family: monospace;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.3);
  word-break: break-all;
}

.delete-pack-warning {
  margin: 0.6rem 0 0;
  font-size: 0.74rem;
  color: rgba(255, 180, 140, 0.8);
}

.form-modal-check {
  margin-top: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: 0.78rem;
  color: rgba(220, 210, 255, 0.75);
}

</style>
