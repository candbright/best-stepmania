<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { useI18n } from "@/i18n";
import * as api from "@/utils/api";
import type { SongPackInfo } from "@/utils/api";

const props = defineProps<{
  pack: SongPackInfo | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "success"): void;
  (e: "error", msg: string): void;
}>();

const { t } = useI18n();

const deletePackConfirmChecked = ref(false);
const deletingPack = ref(false);

watch(() => props.pack, (newPack) => {
  if (newPack) {
    deletePackConfirmChecked.value = false;
  }
});

// ESC key closes the modal
function onEscKey(e: KeyboardEvent) {
  if (e.key === "Escape" && props.pack) {
    e.stopPropagation();
    e.preventDefault();
    emit("close");
  }
}
watch(() => props.pack, (val) => {
  if (val) window.addEventListener("keydown", onEscKey, true);
  else window.removeEventListener("keydown", onEscKey, true);
});
onUnmounted(() => window.removeEventListener("keydown", onEscKey, true));

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
  <div v-if="pack" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal danger-modal" @click.stop>
      <h3 class="modal-title danger">{{ t('songPacks.delete') }}: {{ pack.name }}</h3>
      <p class="modal-desc">
        <span class="modal-label-inline">{{ t('songPacks.packPath') }}:</span>
        <span class="modal-path">{{ pack.path }}</span>
      </p>
      <p class="modal-warning">{{ t('songPacks.confirmDeletePackWarning') }}</p>
      <div class="modal-toggle-row">
        <span>{{ t('songPacks.confirmDelete') }}</span>
        <label class="toggle-switch">
          <input type="checkbox" v-model="deletePackConfirmChecked" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="modal-actions">
        <button class="modal-btn" @click="$emit('close')">{{ t('cancel') }}</button>
        <button class="modal-btn danger" :disabled="deletingPack || !deletePackConfirmChecked" @click="doDeletePack">{{ t('songPacks.delete') }}</button>
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
.modal-label-inline { font-size: 0.7rem; color: rgba(220,210,255,0.5); margin-right: 0.4rem; }
.modal-warning {
  font-size: 0.74rem; color: rgba(255,150,100,0.75);
  margin-top: 0.25rem; margin-bottom: 0.5rem; line-height: 1.5;
}
.modal-toggle-row {
  display: flex; align-items: center; gap: 0.5rem;
  justify-content: space-between;
  margin-top: 0.6rem; font-size: 0.78rem;
  color: rgba(220,210,255,0.75); cursor: pointer;
}
.toggle-switch { position: relative; width: 36px; height: 20px; cursor: pointer; flex-shrink: 0; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; inset: 0; background: rgba(255,255,255,0.1); border-radius: 22px; transition: 0.2s; }
.toggle-slider::before { content: ""; position: absolute; width: 14px; height: 14px; left: 3px; bottom: 3px; background: rgba(255,255,255,0.5); border-radius: 50%; transition: 0.2s; }
.toggle-switch input:checked + .toggle-slider { background: var(--primary-color); }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(16px); background: var(--text-on-primary); }
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
</style>
