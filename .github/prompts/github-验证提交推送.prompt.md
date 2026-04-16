# Git 验证、提交与推送（立即执行）

进入此 prompt 后，**立即执行完整流程**，不再停留在分流选择。

执行顺序固定为三步：
1. 先执行 `@.github/prompts/验证-未提交变更.prompt.md`
2. 再执行 `@.github/prompts/sub/github-提交.prompt.md`
3. 最后执行 `@.github/prompts/sub/github-推送.prompt.md`

若验证未通过，立即停止，不执行提交与推送。

若提交阶段无可提交内容，也继续执行推送阶段，用于确认当前分支与远端状态一致。
