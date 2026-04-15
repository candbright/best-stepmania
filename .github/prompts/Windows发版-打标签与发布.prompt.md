# Windows 发版 - 打标签与发布

## 任务目标

在本地出包通过后，安全打标签并触发 GitHub Release 上传安装包。

## 输入

- 目标版本号（如 `v1.2.0`）
- 本地出包已完成，`target/release/bundle/nsis/*-setup.exe` 存在

## 前置条件

- 已完成版本准备
- 已完成本地出包

---

## 执行步骤

### 1. 发版前 Git 工作区检查（必做）

```bash
git status
git diff --stat
```

**期望状态**：无未提交变更，且无应入库但未追踪文件。

**若工作区不干净**：
- 暂停打标签与推送标签
- 向用户展示状态并询问是否继续
- 仅当用户明确回复"继续"且说明处理方式时，才进入下一步

### 2. 构建后新增修改门禁（必做）

本地出包后再次检查工作区：

```bash
git status
```

**若存在应入库新增改动**：
1. 先完成提交
2. 提交规范：`github提交.prompt.md`
3. 推送规范：`github推送.prompt.md`

### 3. 打标签与推送

```bash
# 创建标签（带 v 前缀）
git tag vX.Y.Z

# 推送标签
git push origin vX.Y.Z

# 若分支有仅本地提交，先推送分支
git push origin <branch>
# 再推标签
git push origin vX.Y.Z
```

### 4. 确认推送结果

```bash
# 验证标签已推送
git tag -l
git ls-remote --tags origin
```

---

## CI 说明

推送 `v*` 标签后，`.github/workflows/release-windows.yml` 会在云端执行：

1. Checkout 代码
2. 安装依赖
3. Rust + Tauri 构建
4. 上传 `*-setup.exe` 到 GitHub Release Assets

`softprops/action-gh-release` 会自动创建或更新 Release，正文注入 `docs/changelog/bsm-vX.Y.Z.md` 内容。

---

## changelog 对应规则

| 标签 | changelog 文件 |
|-----|---------------|
| `v1.2.3` | `docs/changelog/bsm-v1.2.3.md` |

- 文件存在时：正文前半部分注入 changelog，追加自动生成的 release notes
- 文件不存在时：仍可能发布成功，但正文会缺少预期变更说明

---

## 约束

- **不跳过工作区检查**
- **不打标签前确保工作区干净**
- **标签名必须与版本号一致（含 v 前缀）**

---

## 输出

```markdown
## 打标签与发布完成摘要

目标版本：vX.Y.Z

### Git 状态
- 工作区: 干净/有改动
- 标签创建: 成功/失败
- 标签推送: 成功/失败

### CI 触发
- workflow: release-windows.yml
- 预期状态: 运行中

### 下一步
进入验收与排障阶段
```
