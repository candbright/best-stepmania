# Windows 发版 - 本地出包

## 任务目标

在推送标签前完成一次可复现的本地 NSIS 出包。

## 输入

- 目标版本号（如 `v1.2.0`）
- 版本准备已完成

## 完成标准

`target/release/bundle/nsis/` 下出现 `*-setup.exe`，并确认构建过程中产生的应入库改动已处理。

---

## 执行步骤

### 1. 环境确认

```bash
# 检查 Node 版本
node --version  # 建议 22+

# 检查 Rust 版本
rustc --version  # stable

# 检查 WebView2
# Windows 10/11 通常预装，无需手动检查
```

### 2. 安装依赖

```bash
npm ci
# 或 npm install
```

### 3. 图标门禁（构建前必做）

```bash
# 检查图标配置
grep -A5 '"icon"' src-tauri/tauri.conf.json

# 若主图已更新，执行图标生成
npm run tauri icon src-tauri/icons/app-icon.svg

# 确认图标已生成
ls -la src-tauri/icons/
```

### 4. NSIS 准备（若下载超时）

```bash
# 方式一：使用 npm 脚本
npm run prepare-nsis-win

# 方式二：使用 PowerShell 脚本
powershell -ExecutionPolicy Bypass -File scripts/prepare-tauri-nsis-windows.ps1

# 如有需要，传入参数
# -NsisZipPath: NSIS zip 路径
# -UtilsDllPath: UtilsDll 路径
```

### 5. 正式出包

```bash
npm run tauri build
```

### 6. 构建产物验证

```bash
# 确认 exe 存在
ls -la target/release/bundle/nsis/*.exe

# 确认构建产物路径
# 通常为 BestStepMania-*-setup.exe
```

### 7. 自检

检查构建过程是否产生应入库改动：

```bash
git status
git diff --stat
```

**需处理的情况**：
- `Cargo.lock` 更新 → 应提交
- 图标文件更新 → 应提交
- 脚本文档更新 → 应提交

**不应提交的文件**：
- `target/` 目录
- `dist/` 目录
- `node_modules/` 目录
- `bundle-extra/WebView2Loader.dll`

---

## 约束

- **不把 `target/`、`dist/`、`node_modules/`、`bundle-extra/WebView2Loader.dll` 提交进 Git**
- **不跳过本地出包直接打标签**
- **不跳过图标门禁**

---

## 输出

```markdown
## 本地出包完成摘要

目标版本：vX.Y.Z

### 环境状态
- Node: v22.x.x
- Rust: stable
- WebView2: 已安装

### 构建产物
| 文件 | 路径 |
|-----|------|
| NSIS 安装包 | target/release/bundle/nsis/BestStepMania-*-setup.exe |

### 应入库改动
- 无 / 已提交 / 需手动处理

### 状态
- 构建: 成功/失败
- 产物验证: 通过/失败
```
