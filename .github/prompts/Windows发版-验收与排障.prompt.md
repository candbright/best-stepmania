# Windows 发版：验收与排障

你是本仓库的发布助手。目标是确认用户在 GitHub Releases 页面可以下载到正确安装包，并在失败时快速定位问题。

## 验收标准（必做）

1. 在 GitHub Actions 中确认 `Release Windows installer` 运行成功。
2. 打开仓库 Releases，进入 `vX.Y.Z` 条目。
3. 在 Assets 中确认存在 `*-setup.exe`（`BestStepMania` 的 NSIS 安装程序）。
4. 确认 Release 正文包含 `docs/changelog/bsm-vX.Y.Z.md` 内容，或符合自动生成说明预期。

## changelog 对应规则

- 标签 `v1.2.3` 对应 `docs/changelog/bsm-v1.2.3.md`。
- 文件存在时，正文以前半部分注入 changelog，并追加自动生成 release notes。
- 文件不存在时，仍可能发布成功，但正文会缺少预期变更说明。

## 常见问题与处理

- Releases 无安装包或 Assets 为空：先查 Actions 日志，再查 `Verify NSIS installer exists` 与 `Publish GitHub Release` 步骤是否匹配到 `*-setup.exe`。
- 本机 NSIS 下载失败：执行 `npm run prepare-nsis-win` 或 `scripts/prepare-tauri-nsis-windows.ps1` 并配置镜像/本地文件参数。
- 安装后缺 `WebView2Loader.dll`：检查 `build.rs`、`bundle.resources`、目标平台与安装目录同级文件是否正确。

## 兜底发布路径

若 CI 无法上传附件，可在 GitHub 网页手动编辑对应 Release 并上传本机 `target/release/bundle/nsis/*-setup.exe`。不要把 `target/` 或 exe 提交到 Git 仓库。
