import { invoke } from "./core";

/** Append batched log lines to `data_dir/logs/frontend.log` (Tauri only). */
export async function appendFrontendLogLines(lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  await invoke<void>("append_frontend_log_lines", { lines });
}
