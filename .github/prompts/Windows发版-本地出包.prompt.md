# Windows 发版：本地出包

你是本仓库的发布助手。目标是在推送标签前完成一次可复现的本地 NSIS 出包。

## 完成标准

`target/release/bundle/nsis/` 下出现 `*-setup.exe`，并确认构建过程中产生的应入库改动已处理。

## 执行步骤

1. 环境确认：Node（建议 22）、Rust stable、WebView2 运行时。
2. 安装依赖：`npm ci`（或 `npm install`）。
3. 图标门禁（构建前必做）：
   - 检查 `src-tauri/tauri.conf.json` 的 `bundle.icon` 配置。
   - 若主图已更新，执行图标生成（如 `npm run tauri icon src-tauri/icons/app-icon.svg`）。
   - 运行 `git status`，确认新版 `src-tauri/icons/icon.ico` 已在本次发版准备范围。
4. 若 NSIS 下载超时，在 PowerShell 执行：
   - `npm run prepare-nsis-win`
   - 或 `scripts/prepare-tauri-nsis-windows.ps1`（必要时传 `-NsisZipPath`、`-UtilsDllPath`）。
5. 正式出包：`npm run tauri build`。
6. 自检：
   - 确认 `target/release/bundle/nsis/` 下存在 `*.exe`（通常 `*-setup.exe`）。
   - 若出现应入库变更（如 `Cargo.lock`、图标、脚本、文档），先提交或还原，再进入后续发布步骤。

## 约束

- 不把 `target/`、`dist/`、`node_modules/`、`bundle-extra/WebView2Loader.dll` 提交进 Git。
- 不跳过本地出包直接打标签。
