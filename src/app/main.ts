import "@/app/initLogging";
import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "@/app/router";
import App from "@/app/App.vue";
import "../assets/main.css";
import { installThemeCssBridge } from "@/shared/lib/themeCssBridge";
import { logEvent } from "@/shared/lib/devLog";
import { installGlobalErrorHandling } from "@/app/errorHandling/globalErrorHandling";

function renderFatalScreen(message: string): void {
  const root = document.getElementById("app");
  if (!root) return;
  root.innerHTML = "";
  root.style.display = "grid";
  root.style.placeItems = "center";
  root.style.width = "100vw";
  root.style.height = "100vh";
  root.style.background = "#111";
  root.style.color = "#fff";
  root.style.fontFamily = "sans-serif";
  root.style.whiteSpace = "pre-wrap";
  root.style.padding = "24px";
  root.textContent = message;
}

const app = createApp(App);
installGlobalErrorHandling({ app, renderFatalScreen });

app.use(createPinia());
app.use(router);

void router.isReady().then(() => {
  logEvent({
    namespace: "Bootstrap",
    op: "router.ready",
    severity: "info",
    recoverable: true,
    context: { path: router.currentRoute.value.path },
  });
  if (router.currentRoute.value.path !== "/") {
    void router.replace("/");
  }
  app.mount("#app");
  logEvent({
    namespace: "Bootstrap",
    op: "app.mounted",
    severity: "info",
    recoverable: true,
  });
  installThemeCssBridge();
  logEvent({
    namespace: "Bootstrap",
    op: "theme.bridge.installed",
    severity: "info",
    recoverable: true,
  });
});
