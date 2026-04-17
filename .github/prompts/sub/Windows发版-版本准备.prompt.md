# Windows 发版 - 版本准备

## 任务目标

完成发版前的版本一致性准备，确保代码已可构建，文档已同步。

## 输入

- 目标版本号（如 `v1.2.0`）
- 当前代码状态

## 完成标准

即将发布的语义化版本在关键文件中完全一致，文档已同步，且 changelog 文件已就绪并入库。

---

## 执行步骤

### 1. 同步版本号

确保以下文件的版本号一致（不带 `v` 前缀）。设置 → 关于中的展示版本来自 `package.json`（构建时由 Vite 注入 `APP_VERSION`），**无需**再改 `src/shared/constants/appMeta.ts`。

| 文件 | 字段 |
|-----|------|
| `package.json` | `version`（前端展示与关于页同源） |
| `src-tauri/Cargo.toml` | `[package].version` |
| `src-tauri/tauri.conf.json` | 顶层 `version` |

```bash
# 验证版本一致性（三处手改 semver）
grep -r '"version"' package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
```

**注意**：不修改 `crates/sm-*/Cargo.toml` 的版本，除非用户明确要求 bump 内部 crate 版本。

### 2. 文档同步（调用更新文档流程）

执行 `更新文档.prompt.md`，完成以下任务：
- 同步 AGENTS.md
- 同步 UserGuide（中英文）
- 更新 changelog

```bash
# 检查 changelog 是否存在
ls docs/changelog/bsm-vX.Y.Z.md
```

若不存在，按 `更新文档-更新Changelog.prompt.md` 规范生成。

### 3. 构建前校验

```bash
# 前端类型检查
npm run build

# Rust 编译检查
cargo check -p best-stepmania
```

若校验失败，停止流程并先修复。

### 4. 提交与推送

若版本准备阶段产生文件改动（如版本号、changelog、`AGENTS.md`），在进入"打标签与发布"前必须先完成提交并推送：

```bash
git status
git diff --stat
```

提交规范：`github提交.prompt.md`
推送规范：`github推送.prompt.md`

---

## 输出

```markdown
## 版本准备完成摘要

目标版本：vX.Y.Z

### 版本号同步状态
| 文件 | 状态 |
|-----|------|
| package.json | ✓ |
| src-tauri/Cargo.toml | ✓ |
| src-tauri/tauri.conf.json | ✓ |
| 关于页 / `APP_VERSION`（构建注入） | ✓（与 package.json 一致即可） |

### 文档同步状态
| 文档 | 状态 |
|-----|------|
| AGENTS.md | ✓/新增 |
| docs/zh/USER_GUIDE.md | ✓/新增 |
| docs/en/USER_GUIDE.md | ✓/新增 |
| docs/changelog/bsm-vX.Y.Z.md | ✓/新增 |

### 构建校验
- npm run build: 通过/失败
- cargo check: 通过/失败

### Git 状态
- 提交: 是/否
- 推送: 是/否
```

---

## 约束

- 不修改内部 crate 版本
- 不跳过文档同步
- 不跳过构建校验
- 确保工作区干净后再进入下一步
