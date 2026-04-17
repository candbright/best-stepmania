/**
 * Keyboard-to-track mappings for all supported step modes.
 *
 * Extracted from GameplayScreen for separation of concerns — the engine layer
 * should not depend on a specific screen component. By placing mappings here,
 * new modes (e.g. solo-6panel, techno) can be added in one place and
 * automatically picked up by any screen that imports KEY_MAPS.
 *
 * Key: number of tracks
 * Value: map of KeyboardEvent.code → zero-based track index
 */
export const KEY_MAPS: Readonly<Record<number, Readonly<Record<string, number>>>> = {
  // dance-threepanel
  3: { ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 },

  // dance-single
  4: { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 },

  // pump-single / pump-halfdouble
  // 列顺序: 0=左下, 1=左上, 2=中心, 3=右上, 4=右下
  5: {
    KeyQ: 0, KeyW: 0,      // 左下 (Q 或 W)
    KeyE: 1, KeyR: 1,      // 左上
    Space: 2, KeyC: 2,     // 中心
    KeyU: 3, KeyI: 3,      // 右上
    KeyO: 4, KeyP: 4,      // 右下
    // 备用: 数字键行
    Digit7: 0, Digit8: 1, Digit9: 2, Digit0: 3,
    // 备用: 箭头键映射 (测试用)
    ArrowLeft: 0, ArrowUp: 1, ArrowDown: 2, ArrowRight: 4,
  },

  6: { KeyA: 0, KeyS: 1, KeyD: 2, KeyJ: 3, KeyK: 4, KeyL: 5 },

  7: { KeyA: 0, KeyS: 1, KeyD: 2, Space: 3, KeyJ: 4, KeyK: 5, KeyL: 6 },

  8: { KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyJ: 4, KeyK: 5, KeyL: 6, Semicolon: 7 },

  9: { KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, Space: 4, KeyJ: 5, KeyK: 6, KeyL: 7, Semicolon: 8 },

  // pump-double (10键): P1=列0-4, P2=列5-9
  // 主键: Z Q S E C 1 7 5 9 3（字母行 + 数字行）
  10: {
    KeyZ: 0, KeyQ: 1, KeyS: 2, KeyE: 3, KeyC: 4,
    Digit1: 5, Digit7: 6, Digit5: 7, Digit9: 8, Digit3: 9,
    // 备用（与 pump-single 类似）；小键盘数字与 Digit* 等同，由 keyMapLookupTrack 互认
    KeyW: 0, KeyR: 1, Space: 2, KeyI: 3, KeyO: 4,
    KeyA: 0, KeyD: 2, KeyF: 3, KeyG: 4,
    KeyH: 5, KeyJ: 6, KeyK: 7, KeyL: 8, Semicolon: 9,
  },
} as const;
