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
  (e: "loading", val: boolean): void;
}>();

const { t } = useI18n();
const deletingSong = ref(false);

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
  <div v-if="song" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal danger-modal" @click.stop>
      <h3 class="modal-title danger">{{ t('songPacks.confirmDeleteSong') }}</h3>
      <p class="modal-desc">
        <strong>{{ song.title || song.path.split('/').pop() }}</strong><br/>
        <span class="modal-path">{{ song.path }}</span>
      </p>
      <p class="modal-warning">{{ t('songPacks.confirmDeleteSongDetail') }}</p>
      <div class="modal-actions">
        <button class="modal-btn" @click="$emit('close')">{{ t('cancel') }}</button>
        <button class="modal-btn danger" @click="doDeleteSong">
          <span v-if="deletingSong" class="spinner">&#x27F3;</span>
          {{ deletingSong ? t('loading') : t('songPacks.deleteSong') }}
        </button>
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
  color: var(--text-color);
}
.danger-modal { border-color: rgba(255,82,82,0.2); }

.modal-title {
  font-family: 'Orbitron', sans-serif; font-size: 0.8rem; letter-spacing: 0.12em;
  color: rgba(255,255,255,0.55); margin-bottom: 1rem;
}
.modal-title.danger { color: rgba(255,100,100,0.7); }
.modal-desc { font-size: 0.82rem; line-height: 1.5; color: rgba(255,255,255,0.7); margin-bottom: 0.5rem; }
.modal-path {
  font-family: monospace; font-size: 0.72rem; color: rgba(255,255,255,0.3);
  word-break: break-all;
}
.modal-warning {
  font-size: 0.74rem; color: rgba(255,150,100,0.75);
  margin-top: 0.25rem; margin-bottom: 0.5rem; line-height: 1.5;
}
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
.modal-btn.danger {
  border-color: rgba(255,82,82,0.4); background: rgba(255,82,82,0.12); color: #ff6b6b;
}
.modal-btn.danger:hover:not(:disabled) { background: rgba(255,82,82,0.25); }
.modal-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.spinner {
  display: inline-block;
  margin-right: 0.35rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
