import { computed, ref, watch, type Ref } from "vue";
import { useGameStore } from "@/shared/stores/game";
import { playMenuBack, playMenuConfirm, playMenuMove } from "@/shared/lib/sfx";
import { getCursorPosition } from "@/shared/lib/platform";

export type CursorVisualState =
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

export type CursorRipple = {
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
  if (value.includes("move") || value.includes("grab") || value.includes("grabbing") || value.includes("all-scroll")) {
    return "move";
  }

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

/** 同步光标隐藏类到 document */
export function syncGlobalCursorClass(enable: boolean) {
  if (enable) {
    document.documentElement.classList.add("hide-system-cursor-global");
    document.body.classList.add("hide-system-cursor-global");
  } else {
    document.documentElement.classList.remove("hide-system-cursor-global");
    document.body.classList.remove("hide-system-cursor-global");
  }
}

export function useCursorLayer() {
  const game = useGameStore();

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
  const shouldHideSystemCursor = computed(() => true);
  const isCursorVisible = computed(() => true);

  function preventContextMenu(e: MouseEvent) {
    e.preventDefault();
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

  function handleGlobalPointerLeave(e: PointerEvent) {
    if (e.clientX <= 0 || e.clientY <= 0) {
      cursor.value = {
        x: -9999,
        y: -9999,
        visible: false,
      };
    }
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

  const stopCursorClassWatch = watch(
    shouldHideSystemCursor,
    (enabled) => syncGlobalCursorClass(enabled),
    { immediate: true },
  );

  async function mountGlobalCursorListeners() {
    const pos = await getCursorPosition();
    if (pos) {
      cursor.value = { x: pos.x, y: pos.y, visible: true };
    }
    document.addEventListener("contextmenu", preventContextMenu);
    document.addEventListener("pointermove", handleGlobalPointerMove, { capture: true });
    document.addEventListener("pointerdown", handleGlobalPointerDown, { capture: true });
    document.addEventListener("pointerup", handleGlobalPointerUp, { capture: true });
    document.addEventListener("pointerleave", handleGlobalPointerLeave, { capture: true });
  }

  function unmountGlobalCursorListeners() {
    syncGlobalCursorClass(false);
    document.removeEventListener("contextmenu", preventContextMenu);
    document.removeEventListener("pointermove", handleGlobalPointerMove, { capture: true });
    document.removeEventListener("pointerdown", handleGlobalPointerDown, { capture: true });
    document.removeEventListener("pointerup", handleGlobalPointerUp, { capture: true });
    document.removeEventListener("pointerleave", handleGlobalPointerLeave, { capture: true });
  }

  function disposeCursorLayer() {
    stopCursorClassWatch();
    unmountGlobalCursorListeners();
  }

  return {
    game,
    cursor: cursor as Ref<{ x: number; y: number; visible: boolean }>,
    cursorVisualState,
    cursorRipples,
    shouldRenderCursorLayer,
    cursorPresetClass,
    isCursorVisible,
    mountGlobalCursorListeners,
    unmountGlobalCursorListeners,
    disposeCursorLayer,
  };
}
