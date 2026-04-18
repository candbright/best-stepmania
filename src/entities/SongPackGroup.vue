<script setup lang="ts">
import type { SongListItem } from "@/shared/api";
import SongRow from "./SongRow.vue";

export interface SongPackGroup {
  packKey: string;
  packLabel: string;
  songs: { song: SongListItem; idx: number }[];
}

withDefaults(
  defineProps<{
    group: SongPackGroup;
    rootPackKey: string;
    isCollapsed: boolean;
    showNoChartsBadge?: boolean;
    selectedIndex: number;
    favoriteSet: Set<string>;
    bannerCache: Record<string, string>;
    t: (key: string) => string;
  }>(),
  {
    showNoChartsBadge: false,
  },
);

const emit = defineEmits<{
  (e: "togglePack", packKey: string): void;
  (e: "selectSong", idx: number): void;
  (e: "dblclickSong", idx: number): void;
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
        v-if="group.packKey === rootPackKey && group.songs.length === 0"
        class="empty-state empty-state--in-pack"
      >
        <div class="empty-icon">♪</div>
        <p class="empty-title">{{ t('select.noSongs') }}</p>
      </div>
      <SongRow
        v-for="{ song, idx } in group.songs"
        :key="song.path"
        :song="song"
        :index="idx"
        :isSelected="selectedIndex === idx"
        :isFavorite="favoriteSet.has(song.path)"
        :bannerUrl="bannerCache[song.path]"
        :showNoChartsBadge="showNoChartsBadge"
        :t="t"
        @select="emit('selectSong', idx)"
        @dblclick="emit('dblclickSong', idx)"
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
  display: flex; flex-direction: row; align-items: center;
  justify-content: center; height: 100%;
  gap: 0.45rem;
  color: var(--text-subtle);
  margin: 0.4rem 0.5rem;
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-elevated) 72%, transparent);
}
.empty-icon { font-size: 1rem; opacity: 0.45; }
.empty-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
}
.empty-state--in-pack {
  height: auto;
  min-height: 3rem;
}

/* 左栏宽度足够时分栏；断点与分隔栏拖动联动（song-panel 容器查询） */
@container song-panel (min-width: 520px) {
  .pack-songs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem 0.55rem;
    align-content: start;
  }
  .pack-songs :deep(.empty-state) {
    grid-column: 1 / -1;
  }
}

@container song-panel (min-width: 800px) {
  .pack-songs {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
