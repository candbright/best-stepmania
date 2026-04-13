/**
 * Judgment display data — names and colours for every judgment type.
 *
 * Extracted from GameplayScreen so the mapping can be reused by any component
 * (HUD, evaluation chart, replay viewer, etc.) without importing the screen.
 *
 * Adding a new judgment tier only requires changing this file + the engine types.
 */
import type { JudgmentType } from "./types";

export const JUDGMENT_NAMES_DDR: Record<JudgmentType, string> = {
  W1: "Marvelous",
  W2: "Perfect",
  W3: "Great",
  W4: "Good",
  W5: "Boo",
  Miss: "Miss",
};

export const JUDGMENT_NAMES_ITG: Record<JudgmentType, string> = {
  W1: "Fantastic",
  W2: "Excellent",
  W3: "Great",
  W4: "Decent",
  W5: "Way Off",
  Miss: "Miss",
};

export const JUDGMENT_COLORS: Record<JudgmentType, string> = {
  W1: "#00e5ff",
  W2: "#ffea00",
  W3: "#00e676",
  W4: "#ff9100",
  W5: "#ff5252",
  Miss: "#616161",
};

/** Returns the localized label for a judgment under the given style. */
export function getJudgmentName(
  judgment: JudgmentType,
  style: "ddr" | "itg",
): string {
  return (style === "itg" ? JUDGMENT_NAMES_ITG : JUDGMENT_NAMES_DDR)[judgment];
}
