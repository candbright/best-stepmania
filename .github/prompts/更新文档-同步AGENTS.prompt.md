# 更新文档 - 同步 AGENTS.md

## 任务目标

将 `AGENTS.md` 与项目最新代码结构、技术栈、命令规范同步更新。

---

## 输入

- 当前 `AGENTS.md` 文件
- 当前代码（`src/`、`src-tauri/`、`crates/`）
- 上一版本到当前 HEAD 的所有变更

---

## 执行步骤

### 1. 扫描项目结构变更

**新增 / 删除 / 重命名的目录**

```bash
# 前端目录 (FSD 结构)
ls -la src/
ls -la src/screens/
ls -la src/shared/
ls -la src/shared/ui/
ls -la src/shared/layout/
ls -la src/shared/composables/
ls -la src/shared/stores/
ls -la src/shared/services/tauri/
ls -la src/shared/lib/
ls -la src/entities/
ls -la src/widgets/
ls -la src/features/
ls -la src/api/

# Rust 目录
ls -la crates/
ls -la src-tauri/src/
ls -la src-tauri/src/commands/
```

**新增 / 删除 / 重命名的 Rust crate**

```bash
cat Cargo.toml  # workspace members
cat src-tauri/Cargo.toml  # dependencies
```

### 2. 扫描 API 层变更

**新增 IPC 命令**

```bash
grep -r "#[tauri::command]" src-tauri/src/commands/ -l
```

**新增 / 变更的 API wrapper**

```bash
ls -la src/api/
```

### 3. 扫描游戏引擎变更

**新增 / 变更的引擎模块**

```bash
ls -la src/engine/
```

### 4. 扫描配置与常量

```bash
# 版本号
cat package.json | grep version
cat src-tauri/Cargo.toml | grep version
cat src-tauri/tauri.conf.json | grep '"version"'
cat src/constants/appMeta.ts
```

---

## 更新检查清单

### 代码风格

| 章节 | 检查项 | 状态 |
|-----|-------|------|
| TypeScript/Vue3 | 新增规范是否需要补充 | 是/否 |
| Rust | 新增规范是否需要补充 | 是/否 |
| General | 新增通用规范是否需要补充 | 是/否 |

### 架构

| 章节 | 检查项 | 状态 |
|-----|-------|------|
| Frontend Architecture | 新增组件/目录是否需要补充到分层表 | 是/否 |
| Pinia Stores | 新增 store 是否需要补充 | 是/否 |
| Rust Crate Dependencies | crate 依赖图是否需要更新 | 是/否 |
| IPC Command Pattern | 新增命令模式是否需要补充 | 是/否 |
| Known Patterns | 新增模式是否需要补充 | 是/否 |

### 构建命令

| 章节 | 检查项 | 状态 |
|-----|-------|------|
| Frontend | 新增命令是否需要补充 | 是/否 |
| Tauri | 新增命令是否需要补充 | 是/否 |
| Rust | 新增命令是否需要补充 | 是/否 |

### 新功能指南

| 章节 | 检查项 | 状态 |
|-----|-------|------|
| Adding New Features | 新增功能模式是否需要补充 | 是/否 |

---

## 生成更新报告

```markdown
## AGENTS.md 更新报告

### 需要更新的章节
| 章节 | 当前内容 | 建议修改 |
|-----|---------|---------|
| Rust Crate Dependencies | 缺少 xxx | 新增 xxx crate |

### 需要新增的章节
| 章节 | 位置 | 内容 |
|-----|------|------|
| 新增模式 | Known Patterns | xxx 模式说明 |

### 需要删除的章节
| 章节 | 原因 |
|-----|------|
| xxx | 已废弃 |
```

---

## 执行更新

**更新原则**
- 保持现有格式风格一致
- 版本号仅在明确需要时更新（通常在 Release 时同步）
- 中英双语保持一致（如适用）

**更新检查**
- [ ] 目录结构与实际一致
- [ ] crate 依赖图与 Cargo.toml 一致
- [ ] 命令与 package.json / Cargo.toml 一致
- [ ] IPC 命令模式与实际代码一致
- [ ] 无拼写错误或格式问题

---

## 输出

```markdown
## AGENTS.md 更新完成摘要

| 章节 | 变更类型 | 变更内容 |
|-----|---------|---------|
| Rust Crate Dependencies | 更新 | 新增 xxx crate |
| IPC Command Pattern | 新增 | xxx 命令说明 |
```

[建议的 diff 或完整更新内容]
