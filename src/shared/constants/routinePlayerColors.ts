/** Accent colors for pump-routine (co-op) mode — id matches session + i18n keys. */
export const ROUTINE_PLAYER_COLOR_IDS = [
  "blue",
  "red",
  "green",
  "yellow",
  "purple",
  "orange",
  "cyan",
  "pink",
  "white",
  "gray",
] as const;

export type RoutinePlayerColorId = (typeof ROUTINE_PLAYER_COLOR_IDS)[number];

export const ROUTINE_PLAYER_COLORS: ReadonlyArray<{
  id: RoutinePlayerColorId;
  hex: string;
}> = [
  { id: "blue", hex: "#00bfff" },
  { id: "red", hex: "#ff4444" },
  { id: "green", hex: "#44ff44" },
  { id: "yellow", hex: "#ffff44" },
  { id: "purple", hex: "#bb44ff" },
  { id: "orange", hex: "#ff9944" },
  { id: "cyan", hex: "#44ffff" },
  { id: "pink", hex: "#ff44bb" },
  { id: "white", hex: "#ffffff" },
  { id: "gray", hex: "#888888" },
];

export function routineColorHex(id: string | undefined): string | undefined {
  return ROUTINE_PLAYER_COLORS.find((c) => c.id === id)?.hex;
}
