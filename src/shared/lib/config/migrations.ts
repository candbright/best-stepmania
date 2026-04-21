import type { AppConfig } from "@/shared/api";

export const LATEST_CONFIG_VERSION = 1;

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.filter((v): v is string => typeof v === "string");
  return items.length > 0 ? items : fallback;
}

export function migrateConfig(input: AppConfig): AppConfig {
  // Frontend migration keeps UI/runtime safety for stale configs loaded from IPC.
  // Rust command layer performs the same clamp/default rules as persistence boundary defense.
  const next = { ...input };
  const version = toNumber(next.configVersion, 0);

  if (version < 1) {
    next.songDirectories = toStringArray(next.songDirectories, ["songs"]);
    next.targetFps = Math.round(Math.max(30, Math.min(360, toNumber(next.targetFps, 144))));
    next.uiScale = Math.max(0.75, Math.min(1.5, toNumber(next.uiScale, 1)));
    next.chartCacheSize = Math.round(Math.max(1, Math.min(64, toNumber(next.chartCacheSize, 8))));
  }

  next.configVersion = LATEST_CONFIG_VERSION;
  return next;
}
