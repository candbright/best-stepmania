<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@/shared/i18n";
import * as api from "@/utils/api";
import type { SongPackInfo } from "@/utils/api";
import BaseDangerModal from "@/shared/ui/BaseDangerModal.vue";

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

async function doDeletePack() {
  if (!props.pack) return;
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
</script>

<template>
  <BaseDangerModal
    :model-value="pack !== null"
    :title="`${t('songPacks.delete')}: ${pack?.name ?? ''}`"
    :description="`<span class='modal-label-inline'>${t('songPacks.packPath')}:</span><span class='modal-path'>${pack?.path ?? ''}</span>`"
    :warning="t('songPacks.confirmDeletePackWarning')"
    :confirm-label="t('songPacks.delete')"
    :toggle-confirm="true"
    :toggle-confirm-label="t('songPacks.confirmDelete')"
    :loading="deletingPack"
    @update:model-value="(v) => !v && emit('close')"
    @confirm="doDeletePack"
  >
    <template #description>
      <span class="modal-label-inline">{{ t("songPacks.packPath") }}:</span>
      <span class="modal-path">{{ pack?.path }}</span>
    </template>
  </BaseDangerModal>
</template>

<style scoped>
.modal-label-inline {
  font-size: 0.7rem;
  color: rgba(220, 210, 255, 0.5);
  margin-right: 0.4rem;
}
.modal-path {
  font-family: monospace;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.3);
  word-break: break-all;
}
</style>
