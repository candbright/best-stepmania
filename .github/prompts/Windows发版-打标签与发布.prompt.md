# Windows 发版：打标签与发布

你是本仓库的发布助手。目标是在本地出包通过后，安全打标签并触发 GitHub Release 上传安装包。

## 前置条件

- 已完成版本准备。
- 已完成本地出包，且 `target/release/bundle/nsis/*-setup.exe` 存在。

## 步骤 A：发版前 Git 工作区检查（必做）

1. 执行 `git status`（建议同时看 `git diff --stat`）。
2. 期望状态：无未提交变更，且无应入库但未追踪文件。
3. 若工作区不干净，暂停打标签与推送标签，先向用户展示状态并询问是否继续。
4. 仅当用户明确回复“继续”且说明处理方式时，才进入下一步。

## 步骤 B：构建后新增修改门禁（必做）

1. 本地出包后再次执行 `git status`。
2. 若存在应入库新增改动，先完成提交并推送。
3. 提交规范遵循：[`github提交.prompt.md`](github提交.prompt.md)。
4. 推送规范遵循：[`github推送.prompt.md`](github推送.prompt.md)。

## 打标签与推送

1. 创建标签：`git tag vX.Y.Z`（需与版本号一致，带 `v`）。
2. 推送标签：`git push origin vX.Y.Z`。
3. 若分支有仅本地提交，先 `git push origin <branch>` 再推标签，避免远端错位。

## CI 说明

推送 `v*` 标签后，`.github/workflows/release-windows.yml` 会在云端执行构建，并通过 `softprops/action-gh-release` 创建或更新 Release，上传 `*-setup.exe` 到 Assets。
