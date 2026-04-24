<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import { onMounted, onUnmounted, watch } from "vue";
import CustomScrollArea from "@/shared/ui/CustomScrollArea.vue";
import { usePanelResize } from "@/shared/composables/usePanelResize";
import {
  SONG_SELECT_PANEL_MIN_DETAIL_PX,
  SONG_SELECT_PANEL_WIDTH_DEFAULT_PX,
} from "@/shared/constants/songSelectPanel";
import { useSettingsStore } from "@/shared/stores/settings";

interface Props {
  title: string;
  songScrollRef?: (el: Element | ComponentPublicInstance | null) => void;
}

interface Emits {
  (e: "back"): void;
}

defineProps<Props>();

const emit = defineEmits<Emits>();

const settings = useSettingsStore();

const {
  songPanelWidth,
  isDragging,
  startDrag,
  onResizeHandleMouseEnter,
  onResizeHandleMouseLeave,
} = usePanelResize({
  initialWidth: settings.songSelectPanelWidthPx ?? SONG_SELECT_PANEL_WIDTH_DEFAULT_PX,
  onResizeCommit(w) {
    const rounded = Math.round(w);
    if (rounded === settings.songSelectPanelWidthPx) return;
    settings.songSelectPanelWidthPx = rounded;
    void settings.saveAppConfig();
  },
});

function clampSongPanelToContainer() {
  const container = document.querySelector(".sms-body") as HTMLElement | null;
  if (!container) return;
  const maxW = container.getBoundingClientRect().width - SONG_SELECT_PANEL_MIN_DETAIL_PX;
  const minW = SONG_SELECT_PANEL_WIDTH_DEFAULT_PX;
  const cur = songPanelWidth.value ?? minW;
  songPanelWidth.value = Math.max(minW, Math.min(cur, maxW));
}

watch(
  [() => settings.configLoaded, () => settings.songSelectPanelWidthPx],
  () => {
    if (!settings.configLoaded) return;
    songPanelWidth.value = Math.round(
      settings.songSelectPanelWidthPx ?? SONG_SELECT_PANEL_WIDTH_DEFAULT_PX,
    );
    requestAnimationFrame(() => clampSongPanelToContainer());
  },
  { immediate: true },
);

function onWindowResize() {
  clampSongPanelToContainer();
}

onMounted(() => {
  window.addEventListener("resize", onWindowResize);
  requestAnimationFrame(() => clampSongPanelToContainer());
});

onUnmounted(() => {
  window.removeEventListener("resize", onWindowResize);
});
</script>

<template>
  <div class="sms">
    <div class="sms-bg">
      <div class="bg-grid" />
      <div class="bg-glow g1" />
      <div class="bg-glow g2" />
    </div>

    <header class="topbar" @dragstart.prevent>
      <button class="tb-btn" @click="emit('back')">←</button>
      <div class="topbar-center">
        <span class="topbar-title">{{ title }}</span>
      </div>
      <div class="topbar-actions">
        <slot name="topbar-actions" />
      </div>
    </header>

    <slot name="import-toast" />

    <div class="sms-body">
      <div class="song-panel" :style="{ width: `${songPanelWidth}px` }">
        <CustomScrollArea class="song-scroll" :scrollbar-width="4" :set-scroll-el="songScrollRef">
          <slot name="song-panel" />
        </CustomScrollArea>
      </div>

      <div
        class="resize-handle"
        :class="{ dragging: isDragging }"
        @mousedown="startDrag"
        @mouseenter="onResizeHandleMouseEnter"
        @mouseleave="onResizeHandleMouseLeave"
      />

      <div class="detail-panel">
        <slot name="detail-panel" />
      </div>
    </div>

    <!-- 默认插槽：筛选弹窗、确认框等（Teleport 到 body，此处仅占位以挂载组件） -->
    <slot />
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Orbitron:wght@700;900&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Root ── */
.sms {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  font-family: 'Rajdhani', sans-serif;
  color: var(--text-color);
  background: linear-gradient(165deg, var(--bg-gradient-start) 0%, var(--bg-color) 48%, var(--bg-gradient-end) 100%);
  overflow: hidden;
  position: relative;
}

/* ── Background ── */
.sms-bg { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.bg-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--primary-color) 14%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--primary-color) 14%, transparent) 1px, transparent 1px);
  background-size: 40px 40px;
  animation: gridDrift 20s linear infinite;
}
@keyframes gridDrift { to { background-position: 40px 40px; } }
.bg-glow {
  position: absolute; border-radius: 50%;
  filter: blur(80px); opacity: 0.18;
  animation: glowPulse 8s ease-in-out infinite alternate;
}
.g1 { width: 500px; height: 500px; background: var(--primary-color); top: -100px; left: -100px; }
.g2 { width: 400px; height: 400px; background: var(--primary-color-hover); bottom: -100px; right: 20%; animation-delay: -4s; }
@keyframes glowPulse { from { opacity: 0.12; } to { opacity: 0.22; } }

/* ── Topbar ── */
.topbar {
  position: relative;
  z-index: 1001;
  flex-shrink: 0;
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.6rem 1rem;
  background: color-mix(in srgb, var(--bg-color) 82%, transparent);
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(12px);
  user-select: none;
}

.topbar-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.topbar-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.75rem; letter-spacing: 0.35em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
  -webkit-user-drag: none;
}
.topbar-actions {
  margin-left: auto;
  display: flex;
  gap: 0.4rem;
}
.tb-btn {
  padding: 0.35rem 0.65rem; border-radius: 6px;
  background: var(--section-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem; font-family: 'Rajdhani', sans-serif;
  transition: all 0.15s;
}
.tb-btn:hover {
  background: var(--primary-color-bg);
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  color: var(--text-color);
}
.tb-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.tb-btn.active {
  background: color-mix(in srgb, var(--primary-color) 18%, var(--section-bg));
  border-color: var(--primary-color);
  color: var(--text-color);
}
.tb-icon-btn {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 6px;
  background: var(--section-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.tb-icon-btn:hover:not(:disabled) {
  background: var(--primary-color-bg);
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  color: var(--text-color);
}
.tb-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.sort-btn,
.filter-btn {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
}
.filter-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.filter-badge {
  margin-left: 0.35rem;
  min-width: 1.15em;
  padding: 0.04rem 0.32rem;
  border-radius: 999px;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.2;
  background: color-mix(in srgb, var(--accent-secondary) 35%, transparent);
  color: var(--text-on-primary);
}
.spinner { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Body ── */
.sms-body {
  flex: 1; display: flex; overflow: hidden;
  position: relative; z-index: 1;
}

/* ── Song panel ── */
.song-panel {
  flex-shrink: 0;
  display: flex; flex-direction: column;
  border-right: 1px solid var(--border-color);
  overflow: hidden;
  background: var(--section-bg);
  /* 供选歌列表 #歌曲列表 随分隔栏宽度切换 1/2/3 列网格 */
  container-type: inline-size;
  container-name: song-panel;
}
.song-scroll {
  flex: 1;
  min-height: 0;
}
.song-scroll :deep(.custom-scroll-viewport) {
  padding: 0 0 0.5rem 0;
}

/* ── Resize handle ── */
.resize-handle {
  width: 6px;
  flex-shrink: 0;
  background: var(--border-color);
  cursor: col-resize;
  transition: background 0.15s;
  position: relative;
}
.resize-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 2px;
  height: 32px;
  background: color-mix(in srgb, var(--primary-color) 40%, transparent);
  border-radius: 1px;
  opacity: 0;
  transition: opacity 0.15s;
}
.resize-handle:hover,
.resize-handle.dragging {
  background: color-mix(in srgb, var(--primary-color) 50%, var(--border-color));
}
.resize-handle:hover::after,
.resize-handle.dragging::after {
  opacity: 1;
}
.resize-handle.dragging {
  background: var(--primary-color);
}

/* ── Detail panel ── */
.detail-panel {
  flex: 1; display: flex; flex-direction: column;
  overflow: hidden;
  background: color-mix(in srgb, var(--section-bg) 65%, transparent);
}
.detail-panel::-webkit-scrollbar { width: 4px; }
.detail-panel::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--primary-color) 35%, transparent);
  border-radius: 2px;
}
.detail-panel-inner {
  flex: 1; overflow-y: auto; overflow-x: hidden;
}

@media (max-width: 880px) {
  .sms-body { flex-direction: column; }
  .song-panel { width: 100% !important; min-height: 42vh; border-right: none; border-bottom: 1px solid var(--border-color); }
  .detail-panel { min-height: 0; }
  .resize-handle { display: none; }
}
@media (max-width: 640px) {
  .topbar { flex-wrap: wrap; }
  .topbar-center {
    position: static;
    left: auto;
    transform: none;
    order: 3;
    width: 100%;
  }
}
</style>
