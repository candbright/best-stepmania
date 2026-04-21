import { consoleLogSink, initLogSinks, logDebug, type LogSink } from "@/shared/lib/devLog";
import { createTauriFileLogSink, installFileLogSinkFlushOnUnload } from "@/shared/lib/fileLogSink";
import { isTauri } from "@/shared/lib/platform";

const sinks: LogSink[] = [];
// Debug/dev mode must always mirror logs to browser devtools console.
if (import.meta.env.DEV) {
  sinks.push(consoleLogSink);
}
if (isTauri()) {
  sinks.push(createTauriFileLogSink());
  installFileLogSinkFlushOnUnload();
}
// Keep console output in non-dev environments too (unless intentionally changed later).
if (!sinks.includes(consoleLogSink)) {
  sinks.unshift(consoleLogSink);
}
initLogSinks(sinks);
logDebug("Bootstrap", "logging initialized", {
  dev: import.meta.env.DEV,
  sinkCount: sinks.length,
  hasConsoleSink: sinks.includes(consoleLogSink),
});
