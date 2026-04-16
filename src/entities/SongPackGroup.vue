<script setup lang="ts">
import type { SongListItem } from "@/utils/api";
import SongRow from "./SongRow.vue";

export interface SongGroup {
  packKey: string;
  packLabel: string;
  songs: { song: SongListItem; idx: number }[];
}

defineProps<{
  group: SongGroup;
  rootPackKey: string;
  isCollapsed: boolean;
  isCurrentRootEmpty: boolean;
  selectedIndex: number;
  bannerCache: Record<string, string>;
  isFavorite: (path: string) => boolean;
  noSongsLabel: string;
}>();

const emit = defineEmits<{
  (e: "togglePack", packKey: string): void;
  (e: "selectSong", idx: number): void;
  (e: "confirmSong"): void;
  (e: "toggleFavorite", path: string): void;
}>();
</script>

<template>
  <div class="pack-group">
    <button class="pack-header" @click="emit('togglePack', group.packKey)">
      <span class="pack-arrow" :class="{ open: !isCollapsed }">▶</span>
      <span class="pack-name">{{ group.packLabel }}</span>
      <span class="pack-count">{{ group.songs.length }}</span>
    </button>
    <div v-if="!isCollapsed" class="pack-songs">
      <div
        v-if="group.packKey === rootPackKey && group.songs.length === 0 && isCurrentRootEmpty"
        class="empty-state empty-state--in-pack"
      >
        <div class="empty-icon">♪</div>
        <p class="empty-title">{{ noSongsLabel }}</p>
      </div>
      <SongRow
        v-for="{ song, idx } in group.songs"
        :key="song.path"
        :song="song"
        :index="idx"
        :isSelected="selectedIndex === idx"
        :isFavorite="isFavorite(song.path)"
        :bannerUrl="bannerCache[song.path]"
        @select="emit('selectSong', idx)"
        @confirm="emit('confirmSong')"
        @toggleFavorite="emit('toggleFavorite', song.path)"
      />
    </div>
  </div>
</template>

<style scoped>
.pack-group {
  display: flex; flex-direction: column;
}
.pack-header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: color-mix(in srgb, var(--surface-elevated) 92%, var(--bg-color));
  border: none;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer; text-align: left; width: 100%;
  font-family: 'Orbitron', sans-serif; font-size: 0.65rem; letter-spacing: 0.15em;
  position: sticky; top: 0; z-index: 10;
  transition: background 0.15s, color 0.15s;
  backdrop-filter: blur(8px);
}
.pack-header:hover {
  background: var(--primary-color-bg);
  color: var(--text-color);
}
.pack-arrow {
  font-size: 0.55rem; transition: transform 0.2s; display: inline-block;
}
.pack-arrow.open { transform: rotate(90deg); }
.pack-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pack-count {
  background: var(--primary-color-bg);
  border-radius: 10px;
  padding: 0.1rem 0.4rem;
  font-size: 0.6rem;
  color: var(--text-muted);
}

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 100%;
  gap: 0.5rem;
  color: var(--text-subtle);
  margin: 0.75rem;
  border: 1px dashed var(--border-color);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--surface-elevated), var(--section-bg));
}
.empty-icon { font-size: 3rem; opacity: 0.3; }
.empty-title { font-size: 1rem; font-weight: 700; }
.empty-state--in-pack {
  height: auto;
  min-height: 10rem;
  flex: 1;
}
</style>
