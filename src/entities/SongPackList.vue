<script setup lang="ts">
import SongPackGroup, { type SongGroup } from "./SongPackGroup.vue";

defineProps<{
  groups: SongGroup[];
  rootPackKey: string;
  collapsedPacks: Set<string>;
  selectedIndex: number;
  bannerCache: Record<string, string>;
  isCurrentRootEmpty: boolean;
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
  <SongPackGroup
    v-for="group in groups"
    :key="group.packKey"
    :group="group"
    :rootPackKey="rootPackKey"
    :isCollapsed="collapsedPacks.has(group.packKey)"
    :isCurrentRootEmpty="isCurrentRootEmpty"
    :selectedIndex="selectedIndex"
    :bannerCache="bannerCache"
    :isFavorite="isFavorite"
    :noSongsLabel="noSongsLabel"
    @togglePack="emit('togglePack', $event)"
    @selectSong="emit('selectSong', $event)"
    @confirmSong="emit('confirmSong')"
    @toggleFavorite="emit('toggleFavorite', $event)"
  />
</template>
