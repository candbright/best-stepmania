import { invoke } from "./core";

/** Close splash webview and show/focus main (after first-screen bootstrap). */
export async function completeStartupSplash(): Promise<void> {
  await invoke<void>("complete_startup_splash");
}
