import { KEY_MAPS } from "./keyMaps";

/** One key combination (uses KeyboardEvent.code, e.g. KeyZ, Space). */
export interface KeyChord {
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export type KeyBinding = readonly KeyChord[];

export type ShortcutId =
  | "global.back"
  | "title.confirm"
  | "gameplay.devPanel"
  | "gameplay.pause"
  | "playerOptions.back"
  | "editor.undo"
  | "editor.redo"
  | "editor.save"
  | "editor.copy"
  | "editor.cut"
  | "editor.paste"
  | "editor.selectAll"
  | "editor.delete"
  | "editor.back"
  | "editor.playPause"
  | "editor.scrollUp"
  | "editor.scrollDown"
  | "editor.quantizeUp"
  | "editor.quantizeDown"
  | "editor.zoomIn"
  | "editor.zoomOut"
  | "editor.flipH"
  | "editor.flipV"
  | "editor.flipD"
  | "editor.routineLayer1"
  | "editor.routineLayer2"
  | "editor.noteType1"
  | "editor.noteType2"
  | "editor.noteType3"
  | "editor.noteType4"
  | "editor.noteType5"
  | "editor.noteType6"
  | "editor.clearSelection"
  | "editor.previewPlay"
  | "editor.addBeat"
  | "editor.deleteBeat";

/** 10 键 Pump Double：每轨主键（与 keyMaps 注释顺序一致）。 */
export const GAMEPLAY_10_LANE_DEFAULT_CODES: readonly string[] = [
  "KeyQ",
  "KeyE",
  "Space",
  "KeyI",
  "KeyO",
  "Numpad7",
  "Numpad8",
  "Numpad5",
  "Numpad9",
  "Numpad0",
];

export const SHORTCUT_DEFAULTS: Readonly<Record<ShortcutId, KeyBinding>> = {
  "global.back": [{ code: "Escape" }],
  "title.confirm": [{ code: "Enter" }],
  "gameplay.devPanel": [{ code: "F3" }],
  "gameplay.pause": [{ code: "Escape" }],
  "playerOptions.back": [{ code: "Escape" }],
  "editor.undo": [{ code: "KeyZ", ctrl: true, shift: false }],
  "editor.redo": [{ code: "KeyZ", ctrl: true, shift: true }],
  "editor.save": [{ code: "KeyS", ctrl: true }],
  "editor.copy": [{ code: "KeyC", ctrl: true }],
  "editor.cut": [{ code: "KeyX", ctrl: true }],
  "editor.paste": [{ code: "KeyV", ctrl: true }],
  "editor.selectAll": [{ code: "KeyA", ctrl: true }],
  "editor.delete": [{ code: "Delete" }],
  "editor.back": [{ code: "Escape" }],
  "editor.playPause": [{ code: "Space" }],
  "editor.scrollUp": [{ code: "ArrowUp" }],
  "editor.scrollDown": [{ code: "ArrowDown" }],
  "editor.quantizeUp": [{ code: "NumpadAdd" }],
  "editor.quantizeDown": [{ code: "NumpadSubtract" }],
  "editor.zoomIn": [{ code: "NumpadAdd", ctrl: true }],
  "editor.zoomOut": [{ code: "NumpadSubtract", ctrl: true }],
  "editor.flipH": [{ code: "KeyH" }],
  "editor.flipV": [{ code: "KeyJ" }],
  "editor.flipD": [{ code: "KeyK" }],
  "editor.routineLayer1": [{ code: "Digit1", alt: true }],
  "editor.routineLayer2": [{ code: "Digit2", alt: true }],
  "editor.noteType1": [{ code: "Digit1" }],
  "editor.noteType2": [{ code: "Digit2" }],
  "editor.noteType3": [{ code: "Digit3" }],
  "editor.noteType4": [{ code: "Digit4" }],
  "editor.noteType5": [{ code: "Digit5" }],
  "editor.noteType6": [{ code: "Digit6" }],
  "editor.clearSelection": [{ code: "Escape" }],
  "editor.previewPlay": [{ code: "KeyP" }],
  "editor.addBeat": [{ code: "ArrowDown", ctrl: true, shift: true }],
  "editor.deleteBeat": [{ code: "ArrowUp", ctrl: true, shift: true }],
};

export interface KeyBindingsConfig {
  gameplayPumpDoubleLanes?: string[] | null;
  shortcuts?: Partial<Record<ShortcutId, KeyChord[]>> | null;
}

function chordCtrl(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey;
}

function isPlusFromChord(c: KeyChord): boolean {
  return c.code === "NumpadAdd" || (c.code === "Equal" && !!c.shift);
}

function isPlusFromEvent(e: KeyboardEvent): boolean {
  return e.code === "NumpadAdd" || (e.code === "Equal" && e.shiftKey);
}

function isMinusFromChord(c: KeyChord): boolean {
  return c.code === "NumpadSubtract" || (c.code === "Minus" && !c.shift);
}

function isMinusFromEvent(e: KeyboardEvent): boolean {
  return e.code === "NumpadSubtract" || (e.code === "Minus" && !e.shiftKey);
}

export function eventMatchesChord(e: KeyboardEvent, c: KeyChord): boolean {
  const plusAliasMatch = isPlusFromChord(c) && isPlusFromEvent(e);
  const minusAliasMatch = isMinusFromChord(c) && isMinusFromEvent(e);
  const aliasMatch = plusAliasMatch || minusAliasMatch;

  if (!aliasMatch && e.code !== c.code) return false;
  if (!!c.ctrl !== !!chordCtrl(e)) return false;
  if (!aliasMatch && !!c.shift !== !!e.shiftKey) return false;
  if (!!c.alt !== !!e.altKey) return false;
  return true;
}

export function eventMatchesBinding(e: KeyboardEvent, binding: KeyBinding): boolean {
  return binding.some((c) => eventMatchesChord(e, c));
}

export function mergeShortcutBindings(
  user: Partial<Record<ShortcutId, KeyChord[]>> | null | undefined,
): Readonly<Record<ShortcutId, KeyBinding>> {
  const out = { ...SHORTCUT_DEFAULTS } as Record<ShortcutId, KeyBinding>;
  if (!user) return out;
  for (const id of Object.keys(user) as ShortcutId[]) {
    const v = user[id];
    if (v && v.length > 0) out[id] = v;
  }
  return out;
}

/** 从 lanes 生成 10 键位图：先去掉每轨在默认表中的映射，再挂上当前主键。 */
export function buildGameplayMapFromLanes(lanes: readonly string[]): Record<string, number> {
  const base = { ...(KEY_MAPS[10] as Record<string, number>) };
  for (let lane = 0; lane < 10; lane++) {
    for (const [code, track] of Object.entries(base)) {
      if (track === lane) delete base[code];
    }
    const c = lanes[lane]?.trim();
    if (c) base[c] = lane;
  }
  return base;
}

export function resolveGameplayPumpDoubleLanes(stored: string[] | null | undefined): string[] {
  if (stored && stored.length === 10) return [...stored];
  return [...GAMEPLAY_10_LANE_DEFAULT_CODES];
}

export function resolveGameplayKeyMap10(storedLanes: string[] | null | undefined): Readonly<Record<string, number>> {
  if (!storedLanes || storedLanes.length !== 10) {
    return KEY_MAPS[10] as Readonly<Record<string, number>>;
  }
  return buildGameplayMapFromLanes(storedLanes);
}

export function cloneChord(c: KeyChord): KeyChord {
  return { code: c.code, ctrl: c.ctrl, shift: c.shift, alt: c.alt };
}

export function bindingToChordList(b: KeyBinding): KeyChord[] {
  return b.map(cloneChord);
}

export function shortcutsToSerializable(
  merged: Readonly<Record<ShortcutId, KeyBinding>>,
  defaults: Readonly<Record<ShortcutId, KeyBinding>>,
): Partial<Record<ShortcutId, KeyChord[]>> | undefined {
  const out: Partial<Record<ShortcutId, KeyChord[]>> = {};
  for (const id of Object.keys(defaults) as ShortcutId[]) {
    const cur = merged[id];
    const def = defaults[id];
    if (!bindingsEqual(cur, def)) {
      out[id] = bindingToChordList(cur);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function bindingsEqual(a: KeyBinding, b: KeyBinding): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.code !== y.code || !!x.ctrl !== !!y.ctrl || !!x.shift !== !!y.shift || !!x.alt !== !!y.alt) {
      return false;
    }
  }
  return true;
}

const CODE_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  Space: "Space",
  Escape: "Esc",
  Enter: "Enter",
  Delete: "Del",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Equal: "=",
  Minus: "-",
  NumpadAdd: "+",
  NumpadSubtract: "-",
  Numpad0: "Num0",
  Numpad5: "Num5",
  Numpad7: "Num7",
  Numpad8: "Num8",
  Numpad9: "Num9",
};

export function formatChord(c: KeyChord): string {
  const parts: string[] = [];
  if (c.ctrl) parts.push("Ctrl");
  if (c.alt) parts.push("Alt");
  if (c.shift) parts.push("Shift");
  let key = CODE_LABEL_OVERRIDES[c.code];
  if (!key) {
    if (c.code.startsWith("Key")) key = c.code.slice(3);
    else if (c.code.startsWith("Digit")) key = c.code.slice(5);
    else if (c.code.startsWith("Numpad")) key = c.code.replace("Numpad", "Num");
    else key = c.code;
  }
  parts.push(key);
  return parts.join(" ");
}

export function formatBinding(b: KeyBinding): string {
  return b.map(formatChord).join(" / ");
}
