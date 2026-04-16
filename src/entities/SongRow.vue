<script setup lang="ts">
import type { SongListItem } from "@/utils/api";

withDefaults(
  defineProps<{
    song: SongListItem;
    index: number;
    isSelected: boolean;
    isFavorite: boolean;
    bannerUrl?: string | null;
    showNoChartsBadge?: boolean;
    t?: (key: string) => string;
  }>(),
  {
    bannerUrl: null,
    showNoChartsBadge: false,
  },
);

const emit = defineEmits<{
  (e: "select"): void;
  (e: "toggleFavorite"): void;
  (e: "dblclick"): void;
}>();

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    emit("dblclick");
  } else if (e.key === " ") {
    e.preventDefault();
    emit("select");
  }
}
</script>

<template>
  <div
    class="song-row"
    :class="{
      selected: isSelected,
      'song-row--no-charts': showNoChartsBadge && (song.charts?.length ?? 0) === 0,
    }"
    role="button"
    tabindex="0"
    @click="emit('select')"
    @dblclick="emit('dblclick')"
    @keydown="onKeyDown"
  >
    <button
      class="fav-star"
      :class="{ active: isFavorite }"
      @click.stop="emit('toggleFavorite')"
    >★</button>
    <div class="song-thumb">
      <img v-if="bannerUrl" :src="bannerUrl" class="thumb-img" />
      <div v-else class="thumb-ph" :style="{ '--h': index * 37 % 360 }">{{ song.title[0] }}</div>
    </div>
    <div class="song-text">
      <div class="song-name">{{ song.title }}</div>
      <div class="song-artist">{{ song.artist }}</div>
    </div>
    <span
      v-if="showNoChartsBadge && (song.charts?.length ?? 0) === 0"
      class="song-no-charts-pill"
    >{{ t?.('editorSelect.noChartsBadge') }}</span>
    <div class="song-bpm">{{ song.displayBpm }}</div>
  </div>
</template>

<style scoped>
.song-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.45rem 0.75rem;
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 55%, transparent);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
  position: relative;
}
.song-row:hover {
  background: var(--section-bg);
}
.song-row.selected {
  background: linear-gradient(
    90deg,
    var(--primary-color-bg),
    color-mix(in srgb, var(--primary-color-bg) 40%, transparent)
  );
  border-left: 3px solid color-mix(in srgb, var(--primary-color) 82%, white);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 34%, transparent),
    inset 0 0 16px color-mix(in srgb, var(--primary-color) 20%, transparent);
}
.song-row:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.song-row--no-charts {
  opacity: 0.78;
}
.fav-star {
  position: absolute;
  top: 0.25rem;
  left: 0.25rem;
  background: none;
  border: none;
  font-size: 0.9rem;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.125rem;
  opacity: 0.4;
  transition: opacity 0.15s, color 0.15s;
  z-index: 1;
}
.fav-star:hover {
  opacity: 0.8;
}
.fav-star.active {
  color: #ffd740;
  opacity: 1;
}

.song-thumb { width: 48px; height: 32px; border-radius: 4px; overflow: hidden; flex-shrink: 0; }
.thumb-img { width: 100%; height: 100%; object-fit: cover; }
.thumb-ph {
  width: 100%; height: 100%;
  background: hsl(var(--h), 45%, 22%);
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; font-weight: 700; color: rgba(255,255,255,0.3);
}
.song-text { flex: 1; min-width: 0; }
.song-name {
  font-size: 0.85rem; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--text-color);
}
.song-artist {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 1px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.song-bpm {
  font-size: 0.65rem;
  color: var(--primary-color);
  font-weight: 700;
  flex-shrink: 0;
}
.song-no-charts-pill {
  flex-shrink: 0;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: color-mix(in srgb, #ff9800 14%, var(--section-bg));
  border: 1px solid color-mix(in srgb, #ff9800 38%, transparent);
  color: color-mix(in srgb, #ffb74d 82%, var(--text-color));
  font-size: 0.62rem;
  font-weight: 700;
}
</style>
