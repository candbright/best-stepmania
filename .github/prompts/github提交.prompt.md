请帮我分析当前的 Git 更改，并根据功能模块合理划分成多次提交。

## Commit message 规范（必须遵守）

**首行格式（仅允许这一种）：**

```text
<type>(<scope>): <subject>
```

- **`<type>` 白名单（仅此 11 类，禁止 invent 新前缀）**：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`。
- **`<scope>` 必填**：必须出现**成对英文括号** `()`，且括号内为**非空**简短范围名（小写，建议 kebab-case），与本次改动模块一致，例如 `gameplay`、`editor`、`tauri`、`i18n`、`ui`、`docs`、`ci`、`deps`、`api`、`engine`、`song-packs` 等。**禁止**写成 `feat: xxx`、禁止 `feat(): xxx`、禁止省略括号。
- **`<subject>`**：简短祈使句，**英文**、**首字母小写**、**句末不加句号**（与 Conventional Commits 常见习惯一致）。
- **破坏性变更**：若本次提交不兼容旧行为/数据，使用 `feat!` 或 `fix!` 等形式，并在正文说明（如 `BREAKING CHANGE: ...`），仍须满足 `(scope)` 必填，例如 `feat!(api): change chart load contract`。
- **禁止示例**：`update(ui): ...`、`wip: ...`、`misc: ...`、`feat 无括号`、`chore: bump`（无 scope）等均视为不合规，须改写为白名单 `type` + 非空 `scope`。

**正文（可选）与署名：**

- 需要补充说明时，首行下空一行再写正文。
- 必须包含 **Co-authored-by** 行：`Co-authored-by: <name>`，其中 `<name>` 为当前执行提交任务的模型名称（可与 `Co-authored-by: Name <email>` 形式并存）。
- **Co-authored-by 必须单独新起一行**，不得与正文内容写在同一行，建议放在 commit message 正文的最后一行。
- **禁止添加 `Made-with`**（例如 `Made-with: xxx`），commit message 中只保留规范正文与 `Co-authored-by` 署名。

---

执行步骤：

1. 执行 `git status` 和 `git diff --stat`，列出所有更改的文件。
2. 分析更改内容，按功能/模块进行分组，每组应包含逻辑相关的文件变更。
3. 对每个分组分别执行：
   - `git add [相关文件列表]`
   - 生成**符合上文规范**的 commit message（首行必须为 `type(scope): subject`）
   - `git commit -m "首行" -m "可选正文与 Co-authored-by"`

分组原则：

- 不同功能/模块的更改分开提交。
- 格式化、代码风格调整可单独成组（优先 `style` 或 `chore`，按是否仅格式选择白名单类型）。
- 配置文件与 CI 相关改动可用 `ci` / `build` / `chore` 等合适类型，**仍须带 scope**。
- 不要将不相关的更改放在同一个 commit 中。

请先列出你的分组计划与**每条将使用的完整首行 message**（自检 type 在白名单、scope 非空），并直接执行提交。
