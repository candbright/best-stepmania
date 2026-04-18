<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{
  /** 暴露内部可滚动元素，供 scrollIntoView / querySelector 等使用 */
  setScrollEl?: (el: Element | ComponentPublicInstance | null) => void;
  /** 滚动条轨道宽度（px） */
  scrollbarWidth?: number;
}>();

const trackWidthPx = computed(() => props.scrollbarWidth ?? 6);

const viewportRef = ref<HTMLElement | null>(null);
const trackRef = ref<HTMLElement | null>(null);

const thumbHeightPx = ref(0);
const thumbTopPx = ref(0);
const trackVisible = ref(false);

let dragging = false;
let dragStartClientY = 0;
let dragStartScrollTop = 0;

function scrollMetrics() {
  const el = viewportRef.value;
  const track = trackRef.value;
  if (!el || !track) {
    return {
      scrollHeight: 0,
      clientHeight: 0,
      scrollTop: 0,
      maxScroll: 0,
      trackHeight: 0,
    };
  }
  const scrollHeight = el.scrollHeight;
  const clientHeight = el.clientHeight;
  const scrollTop = el.scrollTop;
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const trackHeight = track.clientHeight;
  return { scrollHeight, clientHeight, scrollTop, maxScroll, trackHeight };
}

function updateThumbFromScroll() {
  const el = viewportRef.value;
  const track = trackRef.value;
  if (!el || !track) return;

  const { scrollHeight, clientHeight, scrollTop, maxScroll, trackHeight } = scrollMetrics();

  if (maxScroll <= 0 || scrollHeight <= clientHeight) {
    trackVisible.value = false;
    thumbHeightPx.value = 0;
    thumbTopPx.value = 0;
    return;
  }

  trackVisible.value = true;
  const minThumb = 24;
  const thumbH = Math.max(minThumb, (clientHeight / scrollHeight) * trackHeight);
  const maxThumbTop = Math.max(0, trackHeight - thumbH);
  thumbHeightPx.value = thumbH;
  const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
  thumbTopPx.value = ratio * maxThumbTop;
}

function onViewportScroll() {
  updateThumbFromScroll();
}

function onThumbPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  const el = viewportRef.value;
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  dragging = true;
  dragStartClientY = e.clientY;
  dragStartScrollTop = el.scrollTop;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onThumbPointerMove(e: PointerEvent) {
  if (!dragging) return;
  const el = viewportRef.value;
  if (!el) return;

  const { maxScroll, trackHeight } = scrollMetrics();
  const thumbH = thumbHeightPx.value;
  const maxThumbTop = Math.max(0, trackHeight - thumbH);
  if (maxThumbTop <= 0 || maxScroll <= 0) return;

  const delta = e.clientY - dragStartClientY;
  const deltaScroll = (delta / maxThumbTop) * maxScroll;
  el.scrollTop = Math.min(Math.max(0, dragStartScrollTop + deltaScroll), maxScroll);
}

function onThumbPointerUp(e: PointerEvent) {
  if (!dragging) return;
  dragging = false;
  try {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

function onTrackPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement | null;
  if (target?.classList.contains("custom-scroll-thumb")) return;

  const track = trackRef.value;
  const el = viewportRef.value;
  if (!track || !el) return;

  const rect = track.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const { maxScroll, trackHeight } = scrollMetrics();
  const thumbH = thumbHeightPx.value;
  const maxThumbTop = Math.max(0, trackHeight - thumbH);
  if (maxThumbTop <= 0 || maxScroll <= 0) return;

  const clickRatio = Math.min(Math.max(0, (y - thumbH / 2) / maxThumbTop), 1);
  el.scrollTop = clickRatio * maxScroll;
}

let ro: ResizeObserver | null = null;

function bindObservers() {
  ro?.disconnect();
  const el = viewportRef.value;
  const track = trackRef.value;
  if (!el || !track) return;
  ro = new ResizeObserver(() => {
    updateThumbFromScroll();
  });
  ro.observe(el);
  ro.observe(track);
}

function reportScrollEl() {
  props.setScrollEl?.(viewportRef.value);
}

onMounted(() => {
  reportScrollEl();
  bindObservers();
  updateThumbFromScroll();
});

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
  props.setScrollEl?.(null);
});

</script>

<template>
  <div class="custom-scroll-area">
    <div
      ref="viewportRef"
      class="custom-scroll-viewport"
      @scroll.passive="onViewportScroll"
    >
      <slot />
    </div>
    <div
      ref="trackRef"
      class="custom-scroll-track"
      :class="{ 'is-collapsed': !trackVisible }"
      :style="{ width: trackVisible ? `${trackWidthPx}px` : '0px' }"
      @pointerdown="onTrackPointerDown"
    >
      <div
        class="custom-scroll-thumb"
        :style="{
          height: `${thumbHeightPx}px`,
          transform: `translateY(${thumbTopPx}px)`,
        }"
        @pointerdown="onThumbPointerDown"
        @pointermove="onThumbPointerMove"
        @pointerup="onThumbPointerUp"
        @pointercancel="onThumbPointerUp"
      />
    </div>
  </div>
</template>

<style scoped>
.custom-scroll-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  overflow: hidden;
}

.custom-scroll-viewport {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.custom-scroll-viewport::-webkit-scrollbar {
  display: none;
}

.custom-scroll-track {
  flex-shrink: 0;
  position: relative;
  background: color-mix(in srgb, var(--border-color) 55%, transparent);
  border-radius: 3px;
  touch-action: none;
  transition: width 0.12s ease;
}
.custom-scroll-track.is-collapsed {
  pointer-events: none;
  background: transparent;
  min-width: 0;
}

.custom-scroll-thumb {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  border-radius: 2px;
  background: color-mix(in srgb, var(--primary-color) 45%, transparent);
  box-sizing: border-box;
  touch-action: none;
  cursor: inherit;
}

.custom-scroll-thumb:hover {
  background: color-mix(in srgb, var(--primary-color) 62%, transparent);
}
</style>
