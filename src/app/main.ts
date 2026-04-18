import "@/app/initLogging";
import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "@/app/router";
import App from "@/app/App.vue";
import "../assets/main.css";
import { installThemeCssBridge } from "@/shared/lib/themeCssBridge";
import { logError } from "@/shared/lib/devLog";

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
app.config.errorHandler = (error, instance, info) => {
  logError("App", "Vue runtime error:", { error, instance, info });
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  renderFatalScreen(`启动失败（Vue runtime error）\n\n${info}\n\n${detail}`);
};

window.addEventListener("unhandledrejection", (event) => {
  logError("App", "Unhandled promise rejection:", event.reason);
  const detail = event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason);
  renderFatalScreen(`启动失败（Unhandled promise rejection）\n\n${detail}`);
});

window.addEventListener("error", (event) => {
  logError("App", "Global window error:", event.error ?? event.message);
  const detail = event.error instanceof Error ? event.error.stack ?? event.error.message : String(event.message);
  renderFatalScreen(`启动失败（Window error）\n\n${detail}`);
});

app.use(createPinia());
app.use(router);

void router.isReady().then(() => {
  if (router.currentRoute.value.path !== "/") {
    void router.replace("/");
  }
  app.mount("#app");
  installThemeCssBridge();
});
