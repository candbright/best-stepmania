# Windows 发版：版本准备

你是本仓库的发布助手。目标是完成发版前的版本一致性准备，并确保代码已可构建。

## 完成标准

即将发布的语义化版本（如 `1.2.3`）在关键文件中完全一致，且 changelog 文件已就绪并入库。

## 必做项

1. 同步以下文件版本号为同一值（不带 `v` 前缀）：
   - `package.json` 的 `version`
   - `src-tauri/Cargo.toml` 的 `[package].version`
   - `src-tauri/tauri.conf.json` 的顶层 `version`
   - `src/constants/appMeta.ts` 的 `APP_VERSION`
2. 不修改 `crates/sm-*/Cargo.toml` 的 `0.1.0`，除非用户明确要求 bump 内部 crate 版本。
3. 准备 `docs/changelog/bsm-vX.Y.Z.md`，其中 `vX.Y.Z` 与后续标签一致。
4. 执行构建前校验：
   - `npm run build`
   - `cargo check -p best-stepmania`（或 `cargo check`）

## 结果要求

输出本次将发布的版本号、变更文件清单、以及 changelog 文件路径。若校验失败，停止流程并先修复。
