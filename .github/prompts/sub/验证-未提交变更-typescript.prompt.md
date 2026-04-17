# 用途
用于**仅审查当前工作区未提交到 Git 的 TypeScript 相关变更**。

# 适用范围（仅此文件定义边界）
1. 必须先通过 `git status -sb`、`git diff`、`git diff --cached` 确认变更范围。
2. 仅审查变更涉及的 TS/TSX/Vue 脚本与关联配置。
3. 默认排除构建产物与依赖目录（`dist/`、`node_modules/`）。

# 实际规则（须完整遵循）
@.github/prompts/sub/验证-规则-typescript.prompt.md

执行时采用该文件中的**「未提交变更模式」**（角色、审查清单、证据标准、输出格式）。
