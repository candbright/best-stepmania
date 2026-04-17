<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@/shared/i18n";
import * as api from "@/shared/api";
import type { SongListItem } from "@/shared/api";
import BaseDangerModal from "@/shared/ui/BaseDangerModal.vue";

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
</script>

<template>
  <BaseDangerModal
    :model-value="song !== null"
    :title="t('songPacks.confirmDeleteSong')"
    :description="song ? `<strong>${song.title || song.path.split('/').pop()}</strong><br/><span class='modal-path'>${song.path}</span>` : ''"
    :warning="t('songPacks.confirmDeleteSongDetail')"
    :confirm-label="t('songPacks.deleteSong')"
    :loading="deletingSong"
    @update:model-value="(v) => !v && emit('close')"
    @confirm="doDeleteSong"
  >
    <template #description>
      <strong>{{ song?.title || song?.path.split('/').pop() }}</strong>
      <br />
      <span class="modal-path">{{ song?.path }}</span>
    </template>
  </BaseDangerModal>
</template>

<style scoped>
.modal-path {
  font-family: monospace;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.3);
  word-break: break-all;
}
</style>
