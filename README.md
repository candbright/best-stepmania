# Best-StepMania

## English

**Best-StepMania** is a **StepMania-style** desktop rhythm game: **Vue 3 + TypeScript** UI, **Tauri 2** shell, **Rust** engine and audio (`src-tauri/`, `crates/`). Charts use **SM/SSC**; playback and scoring run in the native layer.

Install **Node.js** and **Rust** (stable), then `npm install` in the repo root. Use `npm run dev` for the web UI only, `npm run tauri:dev` for the desktop app. Build with `npm run tauri:build` (or `npm run tauri:build:clean` to clean `dist/` + release profile artifacts first via `cargo clean --profile release`). Rust checks: `cargo check`, `cargo test`, `cargo clippy` (see **AGENTS.md**).

Do not launch `target/debug/best-stepmania.exe` directly. The debug binary expects the dev server (`http://localhost:1420`) from `tauri dev`; launching it standalone causes "This page can’t be reached".

**Documentation:** [User Guide](docs/en/USER_GUIDE.md) · **Release notes:** [docs/changelog](docs/changelog) (per-version files such as `bsm-v1.0.0.md`). **License:** [LICENSE](LICENSE).

---

## 中文

**Best-StepMania** 是一款 **StepMania 风格** 桌面音游：界面为 **Vue 3 + TypeScript**，壳为 **Tauri 2**，谱面解析、音频与计分在 **Rust**（`src-tauri/`、`crates/`）。谱面格式为 **SM/SSC**。

请先安装 **Node.js** 与 **Rust**（stable），在仓库根目录执行 `npm install`。仅调试网页界面用 `npm run dev`，完整桌面应用用 `npm run tauri:dev`。桌面打包用 `npm run tauri:build`，若需先清理旧产物请用 `npm run tauri:build:clean`（会清理 `dist/`，并通过 `cargo clean --profile release` 清理 release 构建产物）。Rust 侧可用 `cargo check`、`cargo test`、`cargo clippy`（详见 **AGENTS.md**）。

不要直接双击 `target/debug/best-stepmania.exe`。该 debug 可执行文件依赖 `tauri dev` 提供的 `http://localhost:1420`，离线启动会出现“无法访问此页面”。

**文档：** [用户指南](docs/zh/USER_GUIDE.md)（中文说明均在 **docs** 下）· **版本更新：** [docs/changelog](docs/changelog)（按版本文件，如 `bsm-v1.0.0.md`）· **许可：** [LICENSE](LICENSE)。
