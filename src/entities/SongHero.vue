<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    artist: string;
    displayBpm: string;
    bannerUrl?: string | null;
    hue: number;
    isFavorite: boolean;
    t: (key: string) => string;
  }>(),
  {
    subtitle: "",
    bannerUrl: null,
  },
);

const emit = defineEmits<{
  (e: "toggleFavorite"): void;
}>();
</script>

<template>
  <div class="hero" @dragstart.prevent>
    <div class="hero-art">
      <img v-if="bannerUrl" :src="bannerUrl" class="hero-img" draggable="false" />
      <div v-else class="hero-ph" :style="{ '--h': hue }">{{ title[0] }}</div>
      <button
        type="button"
        class="hero-fav-tag"
        :class="{ active: isFavorite }"
        @click.stop="emit('toggleFavorite')"
        :aria-label="t('select.favorites')"
      >
        <span class="hero-fav-tag-icon" />
      </button>
      <div class="hero-fade" />
    </div>
    <div class="hero-info">
      <h2 class="hero-title">{{ title }}</h2>
      <p v-if="subtitle" class="hero-subtitle">{{ subtitle }}</p>
      <p class="hero-artist">{{ artist }}</p>
      <span class="bpm-badge">♪ {{ displayBpm }} {{ t('select.bpmUnit') }}</span>
    </div>
  </div>
</template>

<style scoped>
.hero { position: relative; min-height: 160px; flex-shrink: 0; overflow: hidden; }
.hero-art { position: absolute; inset: 0; }
.hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.5;
  -webkit-user-drag: none;
  user-select: none;
}
.hero-ph {
  width: 100%; height: 100%;
  background: linear-gradient(135deg, hsl(var(--h),45%,18%), hsl(calc(var(--h) + 40),45%,12%));
  display: flex; align-items: center; justify-content: center;
  font-size: 4rem; font-weight: 900; color: rgba(255,255,255,0.08);
  font-family: 'Orbitron', sans-serif;
}
.hero-fav-tag {
  position: absolute;
  top: 5%;
  right: 3%;
  z-index: 2;
  border: none;
  background: transparent;
  padding: 0;
  width: 1.5rem;
  height: 1.875rem;
  color: color-mix(in srgb, var(--text-muted) 92%, transparent);
  cursor: pointer;
  transition: color 0.15s, transform 0.15s, filter 0.15s;
}
.hero-fav-tag-icon {
  display: block;
  width: 100%;
  height: 100%;
  background: currentColor;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 74%, 0 100%);
  filter: drop-shadow(0 2px 5px color-mix(in srgb, var(--border-color) 55%, transparent));
}
.hero-fav-tag:hover {
  transform: translateY(-1px);
}
.hero-fav-tag.active {
  color: var(--primary-color);
  filter: drop-shadow(0 0 10px var(--primary-color-glow));
}
.hero-fade {
  position: absolute; inset: 0;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--bg-color) 12%, transparent) 0%,
    color-mix(in srgb, var(--bg-color) 78%, transparent) 60%,
    var(--bg-color) 100%
  );
}
.hero-info { position: relative; z-index: 1; padding: 1rem 1.25rem 1.25rem; margin-top: 60px; }
.hero-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.15rem; font-weight: 900;
  color: var(--text-color); line-height: 1.2;
  text-shadow: 0 2px 12px rgba(0,0,0,0.8);
}
.hero-subtitle { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.15rem; }
.hero-artist { font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem; }
.bpm-badge {
  display: inline-block; margin-top: 0.5rem;
  padding: 0.2rem 0.65rem;
  background: var(--primary-color-bg);
  border: 1px solid color-mix(in srgb, var(--primary-color) 38%, transparent);
  border-radius: 20px; font-size: 0.72rem; font-weight: 700;
  color: var(--primary-color-hover);
  letter-spacing: 0.05em;
}
</style>
