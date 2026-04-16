<script setup lang="ts">
import type { SongPackGroup as SongPackGroupType } from "./SongPackGroup.vue";
import SongPackGroup from "./SongPackGroup.vue";

withDefaults(
  defineProps<{
    groups: SongPackGroupType[];
    rootPackKey: string;
    collapsedPacks: Set<string>;
    selectedIndex: number;
    favoriteSet: Set<string>;
    bannerCache: Record<string, string>;
    showNoChartsBadge?: boolean;
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
  <SongPackGroup
    v-for="group in groups"
    :key="group.packKey"
    :group="group"
    :rootPackKey="rootPackKey"
    :isCollapsed="collapsedPacks.has(group.packKey)"
    :showNoChartsBadge="showNoChartsBadge"
    :selectedIndex="selectedIndex"
    :favoriteSet="favoriteSet"
    :bannerCache="bannerCache"
    :t="t"
    @togglePack="emit('togglePack', $event)"
    @selectSong="emit('selectSong', $event)"
    @dblclickSong="emit('dblclickSong', $event)"
    @toggleFavorite="emit('toggleFavorite', $event)"
  />
</template>
