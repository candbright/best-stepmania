export type ArrowDirection =
  | "left"
  | "down"
  | "up"
  | "right"
  | "upLeft"
  | "upRight"
  | "downLeft"
  | "downRight";

const TRACK_LABELS: Record<number, string[]> = {
  4: ["←", "↓", "↑", "→"],
  5: ["↙", "↖", "●", "↗", "↘"],
  6: ["↙", "↖", "●", "↗", "↘", "●"],
  10: ["↙", "↖", "●", "↗", "↘", "↙", "↖", "●", "↗", "↘"],
};

const TRACK_COLORS_DEFAULT: Record<number, string[]> = {
  3: ["#e040fb", "#448aff", "#69f0ae"],
  4: ["#e040fb", "#448aff", "#ff1744", "#69f0ae"],
  5: ["#448aff", "#ff1744", "#ffeb3b", "#ff1744", "#448aff"],
  6: ["#ff4081", "#40c4ff", "#ffeb3b", "#40c4ff", "#ff4081", "#ffeb3b"],
  10: [
    "#448aff",
    "#ff1744",
    "#ffeb3b",
    "#ff1744",
    "#448aff",
    "#448aff",
    "#ff1744",
    "#ffeb3b",
    "#ff1744",
    "#448aff",
  ],
};

const TRACK_COLORS_P2: Record<number, string[]> = {
  4: ["#00e5ff", "#ffab00", "#ff00ea", "#00e676"],
  5: ["#00e5ff", "#ff00ea", "#ffeb3b", "#ff9100", "#76ff03"],
  6: ["#00e5ff", "#ff00ea", "#ffeb3b", "#ff9100", "#76ff03", "#b388ff"],
};

const TRACK_DIRECTIONS: Record<number, string[]> = {
  3: ["left", "down", "right"],
  4: ["left", "down", "up", "right"],
};

const DIRECTION_ROTATIONS: Record<string, number> = {
  up: 0,
  upRight: Math.PI / 4,
  right: Math.PI / 2,
  downRight: (Math.PI * 3) / 4,
  down: Math.PI,
  downLeft: -(Math.PI * 3) / 4,
  left: -Math.PI / 2,
  upLeft: -Math.PI / 4,
};

const PUMP_DIRECTIONS: Record<number, Array<ArrowDirection | null>> = {
  5: ["downLeft", "upLeft", null, "upRight", "downRight"],
  10: ["downLeft", "upLeft", null, "upRight", "downRight", "downLeft", "upLeft", null, "upRight", "downRight"],
};

export function getDirectionRotation(direction: ArrowDirection): number {
  return DIRECTION_ROTATIONS[direction] ?? 0;
}

export function getTrackDirection(numTracks: number, col: number): ArrowDirection | null {
  const dirs = TRACK_DIRECTIONS[numTracks];
  return dirs ? (dirs[col] as ArrowDirection) : null;
}

export function getPumpDirection(numTracks: number, col: number): ArrowDirection | null {
  const dirs = PUMP_DIRECTIONS[numTracks];
  return dirs ? dirs[col] : null;
}

export function getTrackColors(numTracks: number, isDouble: boolean, player?: 1 | 2): string[] {
  if (!isDouble && player === 2 && numTracks <= 6) {
    const p2colors = TRACK_COLORS_P2[numTracks];
    if (p2colors) return p2colors;
  }
  const custom = TRACK_COLORS_DEFAULT[numTracks];
  if (custom) return custom;
  return TRACK_COLORS_DEFAULT[5]!;
}

export function getColumnLabel(numTracks: number, col: number): string {
  const labels = TRACK_LABELS[numTracks] ?? TRACK_LABELS[5]!;
  return labels[col % 5] ?? "●";
}

export function isCenterColumn(numTracks: number, col: number): boolean {
  if (numTracks === 5) return col === 2;
  if (numTracks === 10) return col === 2 || col === 7;
  return false;
}
