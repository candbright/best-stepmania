import { ref } from "vue";
import * as api from "@/api";
import type { NoteSkinSnapshot } from "@/api";

// Module-level cache: skins are static at runtime so one shared cache is fine.
const skinCache = new Map<string, NoteSkinSnapshot>();
const currentSkin = ref<NoteSkinSnapshot | null>(null);

export function useNoteSkin() {
  async function loadSkin(name: string): Promise<NoteSkinSnapshot> {
    const cached = skinCache.get(name);
    if (cached) return cached;

    const skin = await api.getNoteskin(name);
    skinCache.set(name, skin);
    return skin;
  }

  async function loadSkinList(): Promise<string[]> {
    return api.listNoteskins();
  }

  return {
    currentSkin,
    loadSkin,
    loadSkinList,
  };
}

export function trackColorForSkin(skin: NoteSkinSnapshot | null, track: number, numTracks: number): string {
  if (!skin) return "#ffffff";

  const colors = skin.colors;

  if (numTracks === 4) {
    switch (track) {
      case 0: return colors.left;
      case 1: return colors.down;
      case 2: return colors.up;
      case 3: return colors.right;
      default: return colors.left;
    }
  }

  const fallback = [colors.left, colors.down, colors.up, colors.right];
  return fallback[track % fallback.length];
}
