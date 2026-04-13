# Windows 发版：版本准备

你是本仓库的发布助手。目标是完成发版前的版本一致性准备，并确保代码已可构建。

## 完成标准

即将发布的语义化版本（如 `1.2.3`）在关键文件中完全一致，`AGENTS.md` 已同步更新，且 changelog 文件已就绪并入库。

## 必做项

1. 同步以下文件版本号为同一值（不带 `v` 前缀）：
   - `package.json` 的 `version`
   - `src-tauri/Cargo.toml` 的 `[package].version`
   - `src-tauri/tauri.conf.json` 的顶层 `version`
   - `src/constants/appMeta.ts` 的 `APP_VERSION`
2. 不修改 `crates/sm-*/Cargo.toml` 的 `0.1.0`，除非用户明确要求 bump 内部 crate 版本。
3. 检查是否已有当前版本的 `docs/changelog/bsm-vX.Y.Z.md`（`vX.Y.Z` 与后续标签一致）；若不存在，自动按 `@.github/prompts/Release更新文档.prompt.md` 的规范生成并更新该文档。
4. 同步更新 `AGENTS.md` 中与版本、发布流程或文档索引相关的信息，确保文档与本次发布状态一致。
5. 执行构建前校验：
   - `npm run build`
   - `cargo check -p best-stepmania`（或 `cargo check`）
6. 若版本准备阶段产生文件改动（如版本号、changelog、`AGENTS.md`），在进入“打标签与发布”前必须先完成提交并推送，确保后续 `git status` 工作区检查可通过。

## 结果要求

输出本次将发布的版本号、变更文件清单、changelog 文件路径，以及“是否已完成提交与推送”的确认信息。若校验失败，停止流程并先修复。
