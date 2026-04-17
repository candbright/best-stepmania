<script setup lang="ts">
import { ref, watch } from "vue";
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
}>();

const { t } = useI18n();

const editTitle = ref("");
const editSubtitle = ref("");
const editArtist = ref("");
const editGenre = ref("");
const savingMeta = ref(false);

watch(() => props.song, (newSong) => {
  if (newSong) {
    editTitle.value = newSong.title;
    editSubtitle.value = newSong.subtitle;
    editArtist.value = newSong.artist;
    editGenre.value = newSong.genre;
  }
});

async function saveEditSong() {
  if (!props.song) return;
  savingMeta.value = true;
  try {
    await api.updateSongMetadata(props.song.path, {
      title: editTitle.value.trim() || undefined,
      subtitle: editSubtitle.value.trim() || undefined,
      artist: editArtist.value.trim() || undefined,
      genre: editGenre.value.trim() || undefined,
    });
    emit("success");
  } catch (e: unknown) {
    emit("error", String(e));
  } finally {
    savingMeta.value = false;
  }
}

function onOpenChange(open: boolean) {
  if (!open) emit("close");
}
</script>

<template>
  <BaseModal
    :model-value="song !== null"
    :title="t('songPacks.editSong')"
    width="min(440px, 92vw)"
    @update:model-value="onOpenChange"
  >
    <div class="form-modal-fields">
      <label class="form-modal-label">{{ t('editor.metaTitle') }}</label>
      <input v-model="editTitle" class="form-modal-input" />

      <label class="form-modal-label">{{ t('editor.metaSubtitle') }}</label>
      <input v-model="editSubtitle" class="form-modal-input" />

      <label class="form-modal-label">{{ t('editor.metaArtist') }}</label>
      <input v-model="editArtist" class="form-modal-input" />

      <label class="form-modal-label">{{ t('editor.metaGenre') }}</label>
      <input v-model="editGenre" class="form-modal-input" />
    </div>

    <template #footer>
      <div class="form-modal-footer-inner">
        <button type="button" class="form-modal-btn" @click="emit('close')">{{ t('cancel') }}</button>
        <button
          type="button"
          class="form-modal-btn form-modal-btn--primary"
          :disabled="savingMeta"
          @click="saveEditSong"
        >
          {{ t('confirm') }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>
