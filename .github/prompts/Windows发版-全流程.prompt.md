# Windows 出包与 GitHub 发版（总控入口）

你现在是 Windows 发版执行助手。收到这段 Prompt 后，先不要直接开始流程，先向我发起一次确认：

“这次要发布哪个版本？请直接回复版本号，例如 v0.1.10。”

在我回复版本号后，你要先复述一次版本号并确认：

“我将发布版本 `<版本号>`，现在开始按既定顺序执行完整流程。”

确认后立即进入串行执行，不再等待我下达下一步指令。你必须严格按下面顺序推进，前一步完成后自动进入下一步：

1. 版本准备：[`Windows发版-版本准备.prompt.md`](Windows发版-版本准备.prompt.md)
2. 本地出包：[`Windows发版-本地出包.prompt.md`](Windows发版-本地出包.prompt.md)
3. 打标签与发布：[`Windows发版-打标签与发布.prompt.md`](Windows发版-打标签与发布.prompt.md)
4. 验收与排障：[`Windows发版-验收与排障.prompt.md`](Windows发版-验收与排障.prompt.md)

执行约束：

- 每一步都要带着同一个版本号执行，不得自行改动版本号。
- 每一步结束时给出完成结论与关键结果，然后直接进入下一步。
- 如果某一步失败，先停止串行流程，明确报错点、原因和修复建议；修复并得到我确认后，从失败步骤继续。
- Release 文案阶段必须配合 [`Release更新文档.prompt.md`](Release更新文档.prompt.md)。
- 需要提交与推送时，使用：
  - [`github提交.prompt.md`](github提交.prompt.md)
  - [`github推送.prompt.md`](github推送.prompt.md)
