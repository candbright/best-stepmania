import type { App } from "vue";
import { logEvent } from "@/shared/lib/devLog";

function toErrorText(input: unknown): string {
  if (input instanceof Error) return input.stack ?? input.message;
  return String(input);
}

interface InstallGlobalErrorHandlingOptions {
  app: App;
  renderFatalScreen: (message: string) => void;
}

export function installGlobalErrorHandling(opts: InstallGlobalErrorHandlingOptions): void {
  const { app, renderFatalScreen } = opts;

  app.config.errorHandler = (error, _instance, info) => {
    logEvent({
      namespace: "App",
      op: "vue.runtime",
      severity: "fatal",
      recoverable: false,
      cause: error,
      context: { info },
    });
    renderFatalScreen(`启动失败（Vue runtime error）\n\n${info}\n\n${toErrorText(error)}`);
  };

  window.addEventListener("unhandledrejection", (event) => {
    logEvent({
      namespace: "App",
      op: "window.unhandledrejection",
      severity: "fatal",
      recoverable: false,
      cause: event.reason,
    });
    renderFatalScreen(`启动失败（Unhandled promise rejection）\n\n${toErrorText(event.reason)}`);
  });

  window.addEventListener("error", (event) => {
    logEvent({
      namespace: "App",
      op: "window.error",
      severity: "fatal",
      recoverable: false,
      cause: event.error ?? event.message,
    });
    renderFatalScreen(`启动失败（Window error）\n\n${toErrorText(event.error ?? event.message)}`);
  });
}
