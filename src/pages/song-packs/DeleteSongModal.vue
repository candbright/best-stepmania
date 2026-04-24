<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@/shared/i18n";
import * as api from "@/shared/api";
import type { SongListItem } from "@/shared/api";
import { BaseModal } from "@/shared/ui";

const props = defineProps<{
  song: SongListItem | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "success"): void;
  (e: "error", msg: string): void;
  (e: "loading", val: boolean): void;
}>();

const { t } = useI18n();
const deletingSong = ref(false);

async function doDeleteSong() {
  if (!props.song || deletingSong.value) return;
  deletingSong.value = true;
  emit("loading", true);
  try {
    await api.deleteSong(props.song.path);
    emit("success");
  } catch (e: unknown) {
    emit("error", String(e));
  } finally {
    deletingSong.value = false;
    emit("loading", false);
  }
}

function onOpenChange(open: boolean) {
  if (!open && !deletingSong.value) emit("close");
}
</script>

<template>
  <BaseModal
    :model-value="song !== null"
    :title="t('songPacks.confirmDeleteSong')"
    :close-disabled="deletingSong"
    width="min(440px, 92vw)"
    @update:model-value="onOpenChange"
  >
    <div class="form-modal-fields">
      <p class="delete-song-title">{{ song?.title || song?.path.split('/').pop() }}</p>
      <p class="modal-path">{{ song?.path }}</p>
      <p class="delete-song-warning">{{ t('songPacks.confirmDeleteSongDetail') }}</p>
    </div>

    <template #footer>
      <div class="form-modal-footer-inner">
        <button type="button" class="form-modal-btn" :disabled="deletingSong" @click="emit('close')">{{ t('cancel') }}</button>
        <button
          type="button"
          class="form-modal-btn form-modal-btn--primary"
          :disabled="deletingSong"
          @click="doDeleteSong"
        >
          <span v-if="deletingSong" class="form-modal-btn-spinner" aria-hidden="true" />
          <span :class="{ 'form-modal-btn-label--hidden': deletingSong }">{{ t('songPacks.deleteSong') }}</span>
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.delete-song-title {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--text-color);
}

.modal-path {
  margin: 0.15rem 0 0;
  font-family: monospace;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.3);
  word-break: break-all;
}

.delete-song-warning {
  margin: 0.55rem 0 0;
  font-size: 0.74rem;
  color: rgba(255, 180, 140, 0.8);
}

</style>
