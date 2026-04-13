<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { useI18n } from "@/i18n";
import * as api from "@/utils/api";
import type { SongListItem } from "@/utils/api";

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

// ESC key closes the modal
function onEscKey(e: KeyboardEvent) {
  if (e.key === "Escape" && props.song) {
    e.stopPropagation();
    e.preventDefault();
    emit("close");
  }
}
watch(() => props.song, (val) => {
  if (val) window.addEventListener("keydown", onEscKey, true);
  else window.removeEventListener("keydown", onEscKey, true);
});
onUnmounted(() => window.removeEventListener("keydown", onEscKey, true));

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
</script>

<template>
  <div v-if="song" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <h3 class="modal-title">{{ t('songPacks.editSong') }}</h3>
      <label class="modal-label">{{ t('editor.metaTitle') }}</label>
      <input v-model="editTitle" class="modal-input" />
      <label class="modal-label">{{ t('editor.metaSubtitle') }}</label>
      <input v-model="editSubtitle" class="modal-input" />
      <label class="modal-label">{{ t('editor.metaArtist') }}</label>
      <input v-model="editArtist" class="modal-input" />
      <label class="modal-label">{{ t('editor.metaGenre') }}</label>
      <input v-model="editGenre" class="modal-input" />
      <div class="modal-actions">
        <button class="modal-btn" @click="$emit('close')">{{ t('cancel') }}</button>
        <button class="modal-btn primary" :disabled="savingMeta" @click="saveEditSong">{{ t('confirm') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Orbitron:wght@700&display=swap');

.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: linear-gradient(180deg, rgba(29,18,44,0.98), rgba(19,13,31,0.98)); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 18px; padding: 1.4rem 1.6rem;
  width: min(420px, 92vw); display: flex; flex-direction: column;
  box-shadow: 0 30px 80px rgba(0,0,0,0.45);
  font-family: 'Rajdhani', sans-serif;
}
.modal-title {
  font-family: 'Orbitron', sans-serif; font-size: 0.8rem; letter-spacing: 0.12em;
  color: rgba(255,255,255,0.55); margin-bottom: 1rem;
}
.modal-label {
  display: block; margin-top: 0.5rem; margin-bottom: 0.22rem;
  font-size: 0.7rem; color: rgba(220,210,255,0.7);
}
.modal-input {
  width: 100%; padding: 0.38rem 0.5rem; box-sizing: border-box;
  border-radius: 7px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05); color: var(--text-color);
  font-family: 'Rajdhani', sans-serif; font-size: 0.88rem;
}
.modal-input:focus { outline: none; border-color: var(--primary-color); }
.modal-actions {
  margin-top: 1rem; display: flex; justify-content: flex-end; gap: 0.5rem;
}
.modal-btn {
  padding: 0.42rem 0.9rem; border-radius: 8px; font-size: 0.8rem;
  border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.6); cursor: pointer;
  font-family: 'Rajdhani', sans-serif;
}
.modal-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: var(--text-color); }
.modal-btn.primary {
  border: none; background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-secondary) 100%); color: var(--text-on-primary);
}
.modal-btn:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
