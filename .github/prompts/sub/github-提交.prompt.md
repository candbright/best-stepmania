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
   - 提交：优先 `git commit -F <utf8 消息文件>`；若用 `-m`，在 **PowerShell** 下首行须用**单引号**包裹（含 `(scope)` 时禁止仅用双引号）。**Windows** 若遇 `unknown option 'trailer'`，改用本文「Windows 环境注意事项」中的 `git` 路径。

分组原则：

- 不同功能/模块的更改分开提交。
- 格式化、代码风格调整可单独成组（优先 `style` 或 `chore`，按是否仅格式选择白名单类型）。
- 配置文件与 CI 相关改动可用 `ci` / `build` / `chore` 等合适类型，**仍须带 scope**。
- 不要将不相关的更改放在同一个 commit 中。

请先列出你的分组计划与**每条将使用的完整首行 message**（自检 type 在白名单、scope 非空），并直接执行提交。

---

## Windows 环境注意事项（必读，避免提交失败）

在部分 Windows 安装上会出现以下两类问题，**按下面方式执行即可稳定提交**。

### 1. `error: unknown option 'trailer'`

**现象**：执行 `git commit`（即使仅 `-m "hello"`）即报错 `unknown option 'trailer'`，与 commit message 内容无关。

**原因**：`Git for Windows` 自带的 **`E:\Git\cmd\git.exe`** 可能对 `commit` 注入了当前 Git 版本不支持的参数（与 `interpret-trailers` / 包装链路有关）；本仓库使用的 Git 2.29.x 会因此失败。

**推荐做法（任选其一）**：

- **优先**：在终端中改用 **`mingw64` 自带的 git** 完成提交（路径因安装盘符而异，常见为）：
  - `E:\Git\mingw64\bin\git.exe`
  - 示例：`& "E:\Git\mingw64\bin\git.exe" status`
  - 示例：`& "E:\Git\mingw64\bin\git.exe" commit -F .git/COMMIT_EDITMSG.txt`
- **长期**：将 `mingw64\bin` 置于 `PATH` 中且排在 `Git\cmd` **之前**，或升级 Git for Windows 到较新版本后再验证 `git commit` 是否正常。

**执行提交类提示词时**：若默认 `git` 失败，应自动改用 `mingw64\bin\git.exe` 重试，无需用户手工改环境。

### 2. PowerShell 与首行里的括号 `(scope)`

**现象**：使用双引号传 `-m "refactor(fsd): subject"` 时，PowerShell 会把 **`(fsd)` 当作子表达式**解析，导致传入 `git` 的参数被截断或变形，进而产生诡异错误。

**推荐做法**：

- 首行含 `(scope)` 时，**`-m` 使用单引号**：`-m 'refactor(fsd): relocate app shell'`；
- 或多行正文、含 `Co-authored-by` 时，**写入 UTF-8 文本文件后用 `-F`**：
  - `git commit -F path/to/commit-message.txt`
  - 文件中首行仍为 `type(scope): subject`，空一行后写正文，最后一行单独写 `Co-authored-by: ...`。

### 3. 多行 message 与 Co-authored-by

为同时满足「正文 + Co-authored-by 单独成行」与 **Windows/PowerShell 引号规则**，优先：

```powershell
git commit -F .git/COMMIT_EDITMSG.txt
```

其中 `.git/COMMIT_EDITMSG.txt` 为本次提交的完整说明（首行 + 空行 + 正文 + `Co-authored-by`）。

### 4. Hook 与 `--no-verify`

若项目或全局配置了有问题的 `commit-msg` / `pre-commit` hook，可临时使用：

`git commit --no-verify ...`

**仅在确认 hook 误报或与本任务无关时使用**；默认仍应先尝试正常提交。
