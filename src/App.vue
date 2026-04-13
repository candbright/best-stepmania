<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

type CursorVisualState =
  | "default"
  | "pointer"
  | "text"
  | "not-allowed"
  | "move"
  | "crosshair"
  | "wait"
  | "help"
  | "progress"
  | "resize-x"
  | "resize-y"
  | "resize-nesw"
  | "resize-nwse";
import { useRoute, useRouter } from "vue-router";
import MusicPlayer from "@/components/MusicPlayer.vue";
import AppLoadingOverlay from "@/components/AppLoadingOverlay.vue";
import { useGameStore } from "@/stores/game";
import { useBlockingOverlayStore } from "@/stores/blockingOverlay";
import type { RhythmSfxStyle } from "@/api/config";
import {
  playMenuBack,
  playMenuConfirm,
  playMenuMove,
  setGameplaySfxEnabled,
  setGameplaySfxVolume,
  setRhythmSfxGain,
  setRhythmSfxStyle,
  setUiSfxEnabled,
  setUiSfxStyle,
  setUiSfxVolume,
} from "@/utils/sfx";

const router = useRouter();
const route = useRoute();
const game = useGameStore();
const blockingOverlay = useBlockingOverlayStore();

type CursorRipple = {
  id: number;
  x: number;
  y: number;
};

function mapCssCursorToVisualState(raw: string): CursorVisualState {
  const value = (raw || "").toLowerCase();

  if (value.includes("not-allowed") || value.includes("no-drop")) return "not-allowed";
  if (value.includes("wait")) return "wait";
  if (value.includes("progress")) return "progress";
  if (value.includes("help")) return "help";
  if (value.includes("crosshair")) return "crosshair";
  if (value.includes("text") || value.includes("vertical-text")) return "text";
  if (value.includes("move") || value.includes("grab") || value.includes("grabbing") || value.includes("all-scroll")) return "move";

  if (value.includes("ew-resize") || value.includes("col-resize") || value.includes("e-resize") || value.includes("w-resize")) {
    return "resize-x";
  }
  if (value.includes("ns-resize") || value.includes("row-resize") || value.includes("n-resize") || value.includes("s-resize")) {
    return "resize-y";
  }
  if (value.includes("nesw-resize") || value.includes("sw-resize") || value.includes("ne-resize")) return "resize-nesw";
  if (value.includes("nwse-resize") || value.includes("se-resize") || value.includes("nw-resize")) return "resize-nwse";

  if (value.includes("pointer")) return "pointer";
  return "default";
}

const cursor = ref({
  x: window.innerWidth * 0.5,
  y: window.innerHeight * 0.5,
  visible: false,
});
const cursorVisualState = ref<CursorVisualState>("default");
const cursorRipples = ref<CursorRipple[]>([]);
let rippleId = 0;

const shouldRenderCursorLayer = computed(() => true);
const cursorPresetClass = computed(() => (game.cursorStylePreset === "b" ? "preset-b" : "preset-a"));

/** 始终隐藏系统光标，强制使用自定义鼠标 */
const shouldHideSystemCursor = computed(() => true);

/** 同步光标隐藏类到 document */
function syncGlobalCursorClass(enable: boolean) {
  if (enable) {
    document.documentElement.classList.add("hide-system-cursor-global");
    document.body.classList.add("hide-system-cursor-global");
  } else {
    document.documentElement.classList.remove("hide-system-cursor-global");
    document.body.classList.remove("hide-system-cursor-global");
  }
}

/** 光标始终可见：强制全局使用自定义鼠标 */
const isCursorVisible = computed(() => true);

function preventContextMenu(e: MouseEvent) {
  e.preventDefault();
}

function findTextFieldFromEventTarget(start: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  let el = start as HTMLElement | null;
  for (; el; el = el.parentElement) {
    if (el instanceof HTMLTextAreaElement) {
      return el;
    }
    if (el instanceof HTMLInputElement) {
      const ty = (el.type || "text").toLowerCase();
      if (
        ty === "text" ||
        ty === "search" ||
        ty === "number" ||
        ty === "email" ||
        ty === "password" ||
        ty === "tel" ||
        ty === "url" ||
        ty === ""
      ) {
        return el;
      }
    }
  }
  return null;
}

function handleGlobalPointerMove(e: PointerEvent) {
  if (e.pointerType !== "mouse") return;

  const target = e.target as HTMLElement | null;
  let state: CursorVisualState = "default";

  if (target) {
    const textField = findTextFieldFromEventTarget(target);
    if (textField) {
      if (textField.disabled || textField.readOnly) {
        state = "not-allowed";
      } else {
        state = "text";
      }
    } else {
      const interactive = target.closest(
        'button, a, [role="button"], input[type="checkbox"], input[type="radio"], input[type="range"], select, summary, [draggable="true"], [data-sfx], label',
      ) as HTMLElement | null;

      if (interactive) {
        if (interactive.hasAttribute("disabled") || interactive.getAttribute("aria-disabled") === "true") {
          state = "not-allowed";
        } else {
          state = "pointer";
        }
      } else {
        const computedCursor = window.getComputedStyle(target).cursor;
        state = mapCssCursorToVisualState(computedCursor);
      }
    }
  }

  cursorVisualState.value = state;
  cursor.value = {
    x: e.clientX,
    y: e.clientY,
    visible: true,
  };
}

/** 鼠标移出窗口时，保持可见状态以便在按钮悬停时仍显示 */
function handleGlobalPointerLeave() {
  // 保留 visible 状态，不设为 false
}

function spawnCursorRipple(x: number, y: number) {
  if (!game.cursorRippleEnabled) return;

  const id = ++rippleId;
  const duration = Math.max(120, Math.round(game.cursorRippleDurationMs || 480));
  cursorRipples.value.push({ id, x, y });
  window.setTimeout(() => {
    cursorRipples.value = cursorRipples.value.filter((r) => r.id !== id);
  }, duration + 24);
}

function handleGlobalPointerDown(e: PointerEvent) {
  if (e.defaultPrevented) return;
  if (e.pointerType !== "mouse") return;
  if (e.button !== 0) return;
  spawnCursorRipple(e.clientX, e.clientY);
}

function handleGlobalPointerUp(e: PointerEvent) {
  if (e.defaultPrevented) return;
  const target = e.target as HTMLElement | null;
  if (!target) return;

  const el = target.closest(
    'button, a, [role="button"], input[type="checkbox"], input[type="radio"], select, summary, [data-sfx]',
  ) as HTMLElement | null;
  if (!el) return;

  if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return;

  const explicitSfx = el.getAttribute("data-sfx");
  if (explicitSfx === "off") return;
  if (explicitSfx === "confirm") {
    playMenuConfirm();
    return;
  }
  if (explicitSfx === "back") {
    playMenuBack();
    return;
  }
  if (explicitSfx === "move") {
    playMenuMove();
    return;
  }

  const tag = el.tagName;
  const role = (el.getAttribute("role") || "").toLowerCase();
  const inputType = (el as HTMLInputElement).type?.toLowerCase?.() || "";
  const classAndId = `${el.id} ${el.className}`.toLowerCase();
  const text = (el.textContent || "").toLowerCase();
  const hint = `${classAndId} ${text}`;

  if (
    tag === "A" ||
    hint.includes("back") ||
    hint.includes("cancel") ||
    hint.includes("close") ||
    hint.includes("返回") ||
    hint.includes("取消") ||
    hint.includes("关闭")
  ) {
    playMenuBack();
    return;
  }

  if (
    tag === "SELECT" ||
    tag === "SUMMARY" ||
    inputType === "checkbox" ||
    inputType === "radio" ||
    role === "switch" ||
    role === "tab"
  ) {
    playMenuMove();
    return;
  }

  playMenuConfirm();
}

function handleGlobalEsc(e: KeyboardEvent) {
  if (e.defaultPrevented) return;
  if (!game.shortcutMatches(e, "global.back")) return;

  const target = e.target as HTMLElement | null;
  if (target) {
    const tag = target.tagName;
    if (tag === "INPUT") {
      // 文本/数字等输入框内 Esc 留给输入行为；range 无文本编辑，应仍能全局返回
      if ((target as HTMLInputElement).type !== "range") return;
    } else if (tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
      return;
    }
  }

  // 谱面编辑器：由 EditorScreen 的 window keydown 处理（goBack → goBackNow 含 cleanup / resumeFromEditor），
  // 勿在此仅 router.push，否则会与工具栏返回不一致且 ESC 表现为无效或状态错乱。
  if (route.path === "/editor") {
    return;
  }

  const backMap: Record<string, string> = {
    "/select-music": "/",
    "/player-options": "/select-music",
    "/options": "/",
    "/song-packs": "/options",
    "/editor-select": "/",
    "/evaluation": "/select-music",
  };

  const targetPath = backMap[route.path];
  if (!targetPath || targetPath === route.path) return;

  e.preventDefault();
  playMenuBack();
  router.push(targetPath);
}

const stopSfxWatch = watch(
  () => [game.effectVolume, game.uiSfxEnabled, game.uiSfxStyle] as const,
  ([effectVolume, enabled, style]) => {
    setUiSfxVolume((effectVolume ?? 90) / 100);
    setUiSfxEnabled(enabled ?? true);
    setUiSfxStyle((style ?? "classic") as "classic" | "soft" | "arcade");
  },
  { immediate: true },
);

const stopGameplayRhythmSfxWatch = watch(
  () => [game.effectVolume, game.rhythmSfxEnabled, game.rhythmSfxVolume, game.rhythmSfxStyle] as const,
  ([effectVol, enabled, rhythmVol, style]) => {
    setGameplaySfxVolume((effectVol ?? 90) / 100);
    setGameplaySfxEnabled(enabled ?? true);
    setRhythmSfxGain((rhythmVol ?? 100) / 100);
    setRhythmSfxStyle((style ?? "bright") as RhythmSfxStyle);
  },
  { immediate: true },
);

const stopCursorClassWatch = watch(
  shouldHideSystemCursor,
  (enabled) => syncGlobalCursorClass(enabled),
  { immediate: true },
);

onMounted(() => {
  document.addEventListener("contextmenu", preventContextMenu);
  document.addEventListener("pointermove", handleGlobalPointerMove, { capture: true });
  document.addEventListener("pointerdown", handleGlobalPointerDown, { capture: true });
  document.addEventListener("pointerup", handleGlobalPointerUp, { capture: true });
  document.addEventListener("pointerleave", handleGlobalPointerLeave, { capture: true });
  window.addEventListener("keydown", handleGlobalEsc);
});

onUnmounted(() => {
  stopSfxWatch();
  stopGameplayRhythmSfxWatch();
  stopCursorClassWatch();
  syncGlobalCursorClass(false);
  document.removeEventListener("contextmenu", preventContextMenu);
  document.removeEventListener("pointermove", handleGlobalPointerMove, { capture: true });
  document.removeEventListener("pointerdown", handleGlobalPointerDown, { capture: true });
  document.removeEventListener("pointerup", handleGlobalPointerUp, { capture: true });
  document.removeEventListener("pointerleave", handleGlobalPointerLeave, { capture: true });
  window.removeEventListener("keydown", handleGlobalEsc);
});
</script>

<template>
  <div class="app-shell">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <keep-alive :include="['EditorScreen']">
          <component :is="Component" :key="route.path" />
        </keep-alive>
      </transition>
    </router-view>
    <AppLoadingOverlay
      v-model:open="blockingOverlay.open"
      :message="blockingOverlay.message"
      :error="blockingOverlay.error"
      :show-retry="blockingOverlay.showRetry"
      @cancel="blockingOverlay.invokeCancel"
      @retry="blockingOverlay.invokeRetry"
    />
    <MusicPlayer />

  </div>
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
          <path d="M12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 3 12 3ZM6.8 12C6.8 10.95 7.16 9.98 7.76 9.2L14.8 16.24C14.02 16.84 13.05 17.2 12 17.2C9.13 17.2 6.8 14.87 6.8 12ZM16.24 14.8L9.2 7.76C9.98 7.16 10.95 6.8 12 6.8C14.87 6.8 17.2 9.13 17.2 12C17.2 13.05 16.84 14.02 16.24 14.8Z" />
        </svg>
        <svg v-else-if="cursorVisualState === 'move'" viewBox="0 0 24 24" class="cursor-icon state-glyph">
          <path d="M12 3L15.5 6.5H13.5V10.5H17.5V8.5L21 12L17.5 15.5V13.5H13.5V17.5H15.5L12 21L8.5 17.5H10.5V13.5H6.5V15.5L3 12L6.5 8.5V10.5H10.5V6.5H8.5L12 3Z" />
        </svg>
        <svg v-else-if="cursorVisualState === 'crosshair'" viewBox="0 0 24 24" class="cursor-icon state-glyph">
          <path d="M11 3H13V8H16V10H13V14H11V10H8V8H11V3ZM11 16H13V21H11V16ZM3 11H8V13H3V11ZM16 11H21V13H16V11Z" />
        </svg>
        <svg v-else-if="cursorVisualState === 'wait' || cursorVisualState === 'progress'" viewBox="0 0 24 24" class="cursor-icon state-glyph spin-glyph">
          <path d="M12 4C7.58 4 4 7.58 4 12H6.2C6.2 8.8 8.8 6.2 12 6.2V4ZM12 19.8V22C16.42 22 20 18.42 20 14H17.8C17.8 17.2 15.2 19.8 12 19.8ZM4 14C4 18.42 7.58 22 12 22V19.8C8.8 19.8 6.2 17.2 6.2 14H4ZM20 12C20 7.58 16.42 4 12 4V6.2C15.2 6.2 17.8 8.8 17.8 12H20Z" />
        </svg>
        <svg v-else-if="cursorVisualState === 'help'" viewBox="0 0 24 24" class="cursor-icon state-glyph">
          <path d="M12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 3 12 3ZM12 17.2C11.23 17.2 10.6 16.57 10.6 15.8C10.6 15.03 11.23 14.4 12 14.4C12.77 14.4 13.4 15.03 13.4 15.8C13.4 16.57 12.77 17.2 12 17.2ZM13.56 11.86C13.02 12.21 12.8 12.43 12.8 13.1V13.4H11.2V12.95C11.2 12.02 11.6 11.47 12.34 10.98C12.95 10.58 13.4 10.28 13.4 9.62C13.4 8.78 12.76 8.2 11.86 8.2C10.99 8.2 10.33 8.77 10.2 9.64H8.6C8.74 7.93 10.08 6.8 11.9 6.8C13.81 6.8 15 8.02 15 9.56C15 10.72 14.28 11.39 13.56 11.86Z" />
        </svg>
        <svg
          v-else-if="cursorVisualState === 'resize-x' || cursorVisualState === 'resize-y' || cursorVisualState === 'resize-nesw' || cursorVisualState === 'resize-nwse'"
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
.app-shell {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* 使用 hide-system-cursor-global 类时隐藏系统光标 */
.hide-system-cursor-global,
.hide-system-cursor-global * {
  cursor: none !important;
}


/* 光标层 */
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
