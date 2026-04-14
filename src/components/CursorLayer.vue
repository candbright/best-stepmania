<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useCursorLayer } from "@/composables/useCursorLayer";

const {
  game,
  cursor,
  cursorVisualState,
  cursorRipples,
  shouldRenderCursorLayer,
  cursorPresetClass,
  isCursorVisible,
  mountGlobalCursorListeners,
  disposeCursorLayer,
} = useCursorLayer();

onMounted(() => {
  mountGlobalCursorListeners();
});

onUnmounted(() => {
  disposeCursorLayer();
});
</script>

<template>
  <Teleport to="body">
    <div v-if="shouldRenderCursorLayer" class="cursor-layer" aria-hidden="true">
      <div
        v-show="isCursorVisible"
        class="custom-cursor"
        :class="[cursorPresetClass, `state-${cursorVisualState}`]"
        :style="{
          left: `${cursor.x}px`,
          top: `${cursor.y}px`,
          opacity: String(game.cursorOpacity),
          transform: `translate(-2px, -2px) scale(${game.cursorScale})`,
          filter: `drop-shadow(0 0 ${4 + 10 * game.cursorGlow}px color-mix(in srgb, var(--primary-color) ${Math.round(20 + game.cursorGlow * 56)}%, transparent))`,
        }"
      >
        <svg
          v-if="(cursorVisualState === 'default' || cursorVisualState === 'pointer') && game.cursorStylePreset === 'a'"
          viewBox="0 0 24 24"
          class="cursor-icon"
        >
          <path d="M4 2L4 21L9.3 15.8L12.7 22L15 20.9L11.6 14.7H19.5L4 2Z" />
        </svg>
        <svg
          v-else-if="(cursorVisualState === 'default' || cursorVisualState === 'pointer') && game.cursorStylePreset === 'b'"
          viewBox="0 0 24 24"
          class="cursor-icon"
        >
          <path d="M4 2.6L4.2 20.8L9.1 16.1L12.2 21.4L14.7 20.2L11.6 14.8H18.4L4 2.6Z" />
          <path d="M8.1 5.8L14 10.7" class="preset-b-cut" />
        </svg>
        <svg v-else-if="cursorVisualState === 'text'" viewBox="0 0 24 24" class="cursor-icon state-glyph">
          <path d="M7 4H17V6H13V18H17V20H7V18H11V6H7V4Z" />
        </svg>
        <svg v-else-if="cursorVisualState === 'not-allowed'" viewBox="0 0 24 24" class="cursor-icon state-glyph">
          <path
            d="M12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 3 12 3ZM6.8 12C6.8 10.95 7.16 9.98 7.76 9.2L14.8 16.24C14.02 16.84 13.05 17.2 12 17.2C9.13 17.2 6.8 14.87 6.8 12ZM16.24 14.8L9.2 7.76C9.98 7.16 10.95 6.8 12 6.8C14.87 6.8 17.2 9.13 17.2 12C17.2 13.05 16.84 14.02 16.24 14.8Z"
          />
        </svg>
        <svg v-else-if="cursorVisualState === 'move'" viewBox="0 0 24 24" class="cursor-icon state-glyph">
          <path
            d="M12 3L15.5 6.5H13.5V10.5H17.5V8.5L21 12L17.5 15.5V13.5H13.5V17.5H15.5L12 21L8.5 17.5H10.5V13.5H6.5V15.5L3 12L6.5 8.5V10.5H10.5V6.5H8.5L12 3Z"
          />
        </svg>
        <svg v-else-if="cursorVisualState === 'crosshair'" viewBox="0 0 24 24" class="cursor-icon state-glyph">
          <path d="M11 3H13V8H16V10H13V14H11V10H8V8H11V3ZM11 16H13V21H11V16ZM3 11H8V13H3V11ZM16 11H21V13H16V11Z" />
        </svg>
        <svg v-else-if="cursorVisualState === 'wait' || cursorVisualState === 'progress'" viewBox="0 0 24 24" class="cursor-icon state-glyph spin-glyph">
          <path
            d="M12 4C7.58 4 4 7.58 4 12H6.2C6.2 8.8 8.8 6.2 12 6.2V4ZM12 19.8V22C16.42 22 20 18.42 20 14H17.8C17.8 17.2 15.2 19.8 12 19.8ZM4 14C4 18.42 7.58 22 12 22V19.8C8.8 19.8 6.2 17.2 6.2 14H4ZM20 12C20 7.58 16.42 4 12 4V6.2C15.2 6.2 17.8 8.8 17.8 12H20Z"
          />
        </svg>
        <svg v-else-if="cursorVisualState === 'help'" viewBox="0 0 24 24" class="cursor-icon state-glyph">
          <path
            d="M12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 3 12 3ZM12 17.2C11.23 17.2 10.6 16.57 10.6 15.8C10.6 15.03 11.23 14.4 12 14.4C12.77 14.4 13.4 15.03 13.4 15.8C13.4 16.57 12.77 17.2 12 17.2ZM13.56 11.86C13.02 12.21 12.8 12.43 12.8 13.1V13.4H11.2V12.95C11.2 12.02 11.6 11.47 12.34 10.98C12.95 10.58 13.4 10.28 13.4 9.62C13.4 8.78 12.76 8.2 11.86 8.2C10.99 8.2 10.33 8.77 10.2 9.64H8.6C8.74 7.93 10.08 6.8 11.9 6.8C13.81 6.8 15 8.02 15 9.56C15 10.72 14.28 11.39 13.56 11.86Z"
          />
        </svg>
        <svg
          v-else-if="
            cursorVisualState === 'resize-x' ||
            cursorVisualState === 'resize-y' ||
            cursorVisualState === 'resize-nesw' ||
            cursorVisualState === 'resize-nwse'
          "
          viewBox="0 0 24 24"
          class="cursor-icon state-glyph"
          :class="[
            cursorVisualState === 'resize-y' ? 'glyph-rot-90' : '',
            cursorVisualState === 'resize-nesw' ? 'glyph-rot-45' : '',
            cursorVisualState === 'resize-nwse' ? 'glyph-rot-135' : '',
          ]"
        >
          <path d="M3 12L7 8V10.7H17V8L21 12L17 16V13.3H7V16L3 12Z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" class="cursor-icon">
          <path d="M4 2L4 21L9.3 15.8L12.7 22L15 20.9L11.6 14.7H19.5L4 2Z" />
        </svg>
      </div>
      <div
        v-for="ripple in cursorRipples"
        :key="ripple.id"
        class="cursor-ripple"
        :style="{
          left: `${ripple.x}px`,
          top: `${ripple.y}px`,
          '--ripple-duration': `${game.cursorRippleDurationMs}ms`,
          '--ripple-min-scale': String(game.cursorRippleMinScale),
          '--ripple-max-scale': String(game.cursorRippleMaxScale),
          '--ripple-opacity': String(game.cursorRippleOpacity),
          '--ripple-line-width': `${game.cursorRippleLineWidth}px`,
          '--ripple-glow': String(game.cursorRippleGlow),
        }"
      />
    </div>
  </Teleport>
</template>

<style>
.cursor-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: var(--z-cursor, 2147483647);
}

.custom-cursor {
  position: fixed;
  left: 0;
  top: 0;
  width: 26px;
  height: 26px;
  transform-origin: 0 0;
  will-change: transform, left, top;
}

.cursor-icon {
  display: block;
  width: 100%;
  height: 100%;
  fill: color-mix(in srgb, var(--text-color) 82%, var(--primary-color) 18%);
  stroke: color-mix(in srgb, var(--primary-color) 72%, white 28%);
  stroke-width: 0.9;
  stroke-linejoin: round;
}

.state-glyph {
  fill: color-mix(in srgb, var(--text-color) 78%, var(--primary-color) 22%);
  stroke: color-mix(in srgb, var(--primary-color) 74%, white 26%);
}

.custom-cursor.state-pointer {
  transform-origin: 2px 2px;
}

.custom-cursor.state-text,
.custom-cursor.state-crosshair,
.custom-cursor.state-move,
.custom-cursor.state-help,
.custom-cursor.state-wait,
.custom-cursor.state-progress,
.custom-cursor.state-resize-x,
.custom-cursor.state-resize-y,
.custom-cursor.state-resize-nesw,
.custom-cursor.state-resize-nwse,
.custom-cursor.state-not-allowed {
  width: 24px;
  height: 24px;
}

.custom-cursor.state-not-allowed .cursor-icon {
  fill: color-mix(in srgb, #ff657a 62%, var(--text-color) 38%);
  stroke: color-mix(in srgb, #ff9aaa 72%, white 28%);
}

.custom-cursor.state-help .cursor-icon {
  fill: color-mix(in srgb, #87c8ff 62%, var(--text-color) 38%);
}

.custom-cursor.state-wait .cursor-icon,
.custom-cursor.state-progress .cursor-icon {
  fill: color-mix(in srgb, #8db3ff 64%, var(--text-color) 36%);
}

.spin-glyph {
  animation: cursor-spin 0.9s linear infinite;
  transform-origin: 50% 50%;
}

.glyph-rot-45 {
  transform: rotate(45deg);
  transform-origin: 50% 50%;
}

.glyph-rot-90 {
  transform: rotate(90deg);
  transform-origin: 50% 50%;
}

.glyph-rot-135 {
  transform: rotate(135deg);
  transform-origin: 50% 50%;
}

.custom-cursor.preset-a .cursor-icon {
  stroke-width: 0.9;
  filter: none;
}

.custom-cursor.preset-b .cursor-icon {
  stroke-width: 1.35;
  fill: color-mix(in srgb, var(--text-color) 68%, var(--primary-color) 32%);
  filter: drop-shadow(0 0 1.8px color-mix(in srgb, var(--primary-color) 64%, transparent));
}

.custom-cursor.preset-b .preset-b-cut {
  fill: none;
  stroke: color-mix(in srgb, var(--primary-color) 56%, white 44%);
  stroke-width: 1.25;
  stroke-linecap: round;
  opacity: 0.92;
}

.cursor-ripple {
  position: fixed;
  left: 0;
  top: 0;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  margin-top: -6px;
  border-radius: 999px;
  border: var(--ripple-line-width, 1px) solid color-mix(in srgb, var(--primary-color) 70%, white 30%);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--primary-color) 25%, transparent),
    0 0 calc(8px + 12px * var(--ripple-glow, 0.26)) color-mix(in srgb, var(--primary-color) calc(12% + var(--ripple-glow, 0.26) * 60%), transparent);
  opacity: var(--ripple-opacity, 0.7);
  will-change: transform, opacity;
  animation: cursor-ripple-expand var(--ripple-duration, 480ms) cubic-bezier(0.16, 0.7, 0.18, 1) forwards;
}

@keyframes cursor-ripple-expand {
  0% {
    transform: scale(var(--ripple-min-scale, 0.65));
    opacity: calc(var(--ripple-opacity, 0.7) * 0.75);
  }
  65% {
    transform: scale(calc(var(--ripple-max-scale, 6.2) * 0.86));
    opacity: calc(var(--ripple-opacity, 0.7) * 0.32);
  }
  100% {
    transform: scale(var(--ripple-max-scale, 6.2));
    opacity: 0;
  }
}

@keyframes cursor-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
