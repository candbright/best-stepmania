<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { useI18n } from "@/shared/i18n";
import { formatBinding, formatChord, type KeyChord } from "@/engine/keyBindings";

const props = withDefaults(
  defineProps<{
    chords: KeyChord[];
    /** 仅记录物理键码，忽略修饰键（用于游戏轨道）。 */
    plainCodeOnly?: boolean;
  }>(),
  { plainCodeOnly: false },
);

const emit = defineEmits<{ "update:chords": [KeyChord[]] }>();
const { t } = useI18n();

const capturing = ref(false);
let removeListener: ((e: KeyboardEvent) => void) | null = null;

function stopCapture() {
  if (removeListener) {
    window.removeEventListener("keydown", removeListener, true);
    removeListener = null;
  }
  capturing.value = false;
}

onUnmounted(() => stopCapture());

function normalizeCapturedChord(chord: KeyChord): KeyChord {
  // '+' 主键与小键盘 '+' 视为同一键，统一存为 NumpadAdd。
  if (chord.code === "Equal" && !!chord.shift) {
    return { ...chord, code: "NumpadAdd" };
  }
  // 主键盘数字与小键盘数字统一存为 Digit*。
  const numpadDigit = /^Numpad([0-9])$/.exec(chord.code);
  if (numpadDigit) {
    return { ...chord, code: `Digit${numpadDigit[1]}` };
  }
  if (chord.code === "NumpadEnter") {
    return { ...chord, code: "Enter" };
  }
  if (chord.code === "NumpadDecimal") {
    return { ...chord, code: "Period" };
  }
  return chord;
}

function startCapture() {
  if (capturing.value) return;
  capturing.value = true;
  const fn = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") {
      stopCapture();
      return;
    }
    if (
      [
        "ControlLeft",
        "ControlRight",
        "ShiftLeft",
        "ShiftRight",
        "AltLeft",
        "AltRight",
        "MetaLeft",
        "MetaRight",
      ].includes(e.code)
    ) {
      return;
    }
    const chord: KeyChord = props.plainCodeOnly
      ? { code: e.code }
      : normalizeCapturedChord({
          code: e.code,
          ctrl: e.ctrlKey || e.metaKey,
          shift: e.shiftKey,
          alt: e.altKey,
        });
    emit("update:chords", [chord]);
    stopCapture();
  };
  removeListener = fn;
  window.addEventListener("keydown", fn, true);
}

function displayLabel(): string {
  if (props.plainCodeOnly && props.chords.length === 1) {
    return formatChord(props.chords[0]!);
  }
  return formatBinding(props.chords);
}
</script>

<template>
  <button
    type="button"
    class="keybind-cap"
    :class="{ capturing }"
    @click="startCapture"
  >
    {{ capturing ? t("settings.keybindings.pressKey") : displayLabel() }}
  </button>
</template>

<style scoped>
.keybind-cap {
  min-width: 7rem;
  padding: 0.35rem 0.6rem;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  cursor: pointer;
  text-align: center;
}
.keybind-cap:hover {
  border-color: var(--primary-color-hover);
  background: rgba(255, 255, 255, 0.09);
}
.keybind-cap.capturing {
  border-color: var(--primary-color-glow);
  color: var(--primary-color-glow);
}
</style>
