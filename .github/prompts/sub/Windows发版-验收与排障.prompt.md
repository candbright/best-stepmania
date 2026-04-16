# Windows 发版 - 验收与排障

## 任务目标

确认用户在 GitHub Releases 页面可以下载到正确安装包，并在失败时快速定位问题。

## 输入

- 目标版本号（如 `v1.2.0`）
- 标签已推送

## 验收标准（必做）

### 1. CI 构建状态

检查 GitHub Actions 中 `Release Windows installer` workflow 运行状态：
- 状态：`completed`
- 结果：`success`

### 2. Release 存在性

打开仓库 Releases，确认 `vX.Y.Z` 条目存在。

### 3. 安装包验证

在 Assets 中确认存在 `*-setup.exe`：
- 文件格式：`BestStepMania-*-setup.exe`
- 文件大小：合理（非 0 字节）

### 4. Release 正文

确认 Release 正文包含 `docs/changelog/bsm-vX.Y.Z.md` 内容。

---

## 常见问题与处理

### 问题：Releases 无安装包或 Assets 为空

**排查步骤**：
1. 查看 Actions 日志
2. 检查 `Verify NSIS installer exists` 步骤是否匹配到 `*-setup.exe`
3. 检查 `Publish GitHub Release` 步骤是否成功上传

### 问题：本机 NSIS 下载失败

**解决方案**：
```bash
npm run prepare-nsis-win
# 或
powershell -ExecutionPolicy Bypass -File scripts/prepare-tauri-nsis-windows.ps1
```

配置镜像或传入本地文件路径：
- `-NsisZipPath`
- `-UtilsDllPath`

### 问题：安装后缺 WebView2Loader.dll

**排查步骤**：
1. 检查 `build.rs` 配置
2. 检查 `bundle.resources` 配置
3. 确认目标平台与安装目录同级文件正确

### 问题：CI 构建失败

**排查步骤**：
1. 查看 Actions 日志错误信息
2. 常见失败原因：
   - Node/Rust 版本不匹配
   - 依赖安装失败
   - Rust 编译错误
   - Tauri 配置问题

---

## 兜底发布路径

若 CI 无法上传附件：
1. 在 GitHub 网页手动编辑对应 Release
2. 上传本机 `target/release/bundle/nsis/*-setup.exe`

**注意**：不要把 `target/` 或 exe 提交到 Git 仓库。

---

## 输出

```markdown
## 验收与排障完成摘要

目标版本：vX.Y.Z

### CI 构建
- 状态: 成功/失败
- 日志: [链接]

### Release 验证
- 条目存在: 是/否
- 安装包存在: 是/否
- 正文包含 changelog: 是/否

### 问题（若有）
| 问题 | 原因 | 解决方案 |
|-----|------|---------|
| ... | ... | ... |

### 最终状态
- 验收: 通过/失败
- 可下载: 是/否
```

---

## 成功标志

全部验收项通过时，输出：

```markdown
## 🎉 发版成功

版本 vX.Y.Z 已成功发布！

- GitHub Release: [链接]
- 安装包: BestStepMania-*-setup.exe
- 文档更新: 已同步
```
