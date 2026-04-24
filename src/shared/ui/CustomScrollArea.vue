<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { useScrollAreaCore } from "@/shared/composables/useScrollAreaCore";

const props = defineProps<{
  /** 暴露内部可滚动元素，供 scrollIntoView / querySelector 等使用 */
  setScrollEl?: (el: Element | ComponentPublicInstance | null) => void;
  /** 滚动条轨道宽度（px） */
  scrollbarWidth?: number;
  /** 是否显示上下箭头按钮 */
  showArrows?: boolean;
}>();

const trackWidthPx = computed(() => props.scrollbarWidth ?? 9);

const core = useScrollAreaCore("vertical");
const viewportRef = core.viewportRef;
const trackRef = core.trackRef;

function reportScrollEl() {
  props.setScrollEl?.(viewportRef.value);
}

onMounted(() => {
  reportScrollEl();
});

onBeforeUnmount(() => {
  props.setScrollEl?.(null);
});

watch(viewportRef, reportScrollEl);

</script>

<template>
  <div class="custom-scroll-area">
    <div
      ref="viewportRef"
      class="custom-scroll-viewport"
      @scroll.passive="core.onViewportScroll"
    >
      <slot />
    </div>
    <div
      class="custom-scroll-track"
      :class="{ 'is-collapsed': !core.trackVisible.value }"
      :style="{ width: core.trackVisible.value ? `${trackWidthPx}px` : '0px' }"
    >
      <button
        v-if="props.showArrows"
        type="button"
        class="custom-scroll-arrow custom-scroll-arrow--up"
        @click="core.nudgeScrollBy(-1)"
      >▲</button>
      <div
        ref="trackRef"
        class="custom-scroll-rail"
        @pointerdown="(e) => core.onTrackPointerDown(e, 'custom-scroll-thumb')"
      >
        <div
          class="custom-scroll-thumb"
          :style="{
            height: `${core.thumbSizePx.value}px`,
            transform: `translateY(${core.thumbOffsetPx.value}px)`,
          }"
          @pointerdown="core.onThumbPointerDown"
          @pointermove="core.onThumbPointerMove"
          @pointerup="core.onThumbPointerUp"
          @pointercancel="core.onThumbPointerUp"
        />
      </div>
      <button
        v-if="props.showArrows"
        type="button"
        class="custom-scroll-arrow custom-scroll-arrow--down"
        @click="core.nudgeScrollBy(1)"
      >▼</button>
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
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: color-mix(in srgb, var(--border-color) 55%, transparent);
  border-radius: 3px;
  touch-action: none;
  transition: width 0.12s ease;
}
.custom-scroll-rail {
  flex: 1;
  min-height: 0;
  position: relative;
}
.custom-scroll-track.is-collapsed {
  pointer-events: none;
  background: transparent;
  min-width: 0;
}
.custom-scroll-arrow {
  width: 100%;
  height: 14px;
  border: none;
  border-radius: 2px;
  padding: 0;
  line-height: 1;
  font-size: 9px;
  color: color-mix(in srgb, var(--primary-color) 70%, var(--text-color));
  background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  cursor: inherit;
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
