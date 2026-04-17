/**
 * render/renderQuality.ts
 *
 * Adaptive render quality state machine.
 * Downgrades from "high" → "medium" → "low" when frames run slow,
 * and recovers upward when frames are consistently fast.
 *
 * Usage:
 *   const quality = createQualityState();
 *   tickRenderQuality(quality, frameMs);
 *   // read quality.level for current tier
 */

import type { QualityLevel } from "./drawers";

export interface QualityState {
  level: QualityLevel;
  /** Internal: consecutive poor-frame counter. */
  poorCount: number;
  /** Internal: consecutive good-frame counter. */
  goodCount: number;
}

export function createQualityState(): QualityState {
  return { level: "high", poorCount: 0, goodCount: 0 };
}

/**
 * Call once per rendered frame with the frame duration in milliseconds.
 * Mutates `state.level` in place when thresholds are crossed.
 */
export function tickRenderQuality(state: QualityState, frameMs: number): void {
  if (frameMs > 18) {
    state.poorCount++;
    state.goodCount = Math.max(0, state.goodCount - 2);
  } else if (frameMs < 12) {
    state.goodCount++;
    state.poorCount = Math.max(0, state.poorCount - 1);
  } else {
    state.poorCount = Math.max(0, state.poorCount - 1);
    state.goodCount = Math.max(0, state.goodCount - 1);
  }

  // Degrade
  if (state.level === "high" && state.poorCount >= 25) {
    state.level = "medium";
    state.poorCount = 0;
    return;
  }
  if (state.level === "medium" && state.poorCount >= 35) {
    state.level = "low";
    state.poorCount = 0;
    return;
  }

  // Recover
  if (state.level === "low" && state.goodCount >= 90) {
    state.level = "medium";
    state.goodCount = 0;
    return;
  }
  if (state.level === "medium" && state.goodCount >= 120) {
    state.level = "high";
    state.goodCount = 0;
  }
}
