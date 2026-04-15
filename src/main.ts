import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import App from "./App.vue";
import "./assets/main.css";
import { installThemeCssBridge } from "./utils/themeCssBridge";

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
  console.error("Vue runtime error:", { error, instance, info });
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  renderFatalScreen(`启动失败（Vue runtime error）\n\n${info}\n\n${detail}`);
};

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  const detail = event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason);
  renderFatalScreen(`启动失败（Unhandled promise rejection）\n\n${detail}`);
});

window.addEventListener("error", (event) => {
  console.error("Global window error:", event.error ?? event.message);
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
