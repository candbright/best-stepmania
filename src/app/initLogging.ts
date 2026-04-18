import { consoleLogSink, initLogSinks, type LogSink } from "@/shared/lib/devLog";
import { createTauriFileLogSink, installFileLogSinkFlushOnUnload } from "@/shared/lib/fileLogSink";
import { isTauri } from "@/shared/lib/platform";

const sinks: LogSink[] = [consoleLogSink];
if (isTauri()) {
  sinks.push(createTauriFileLogSink());
  installFileLogSinkFlushOnUnload();
}
initLogSinks(sinks);
