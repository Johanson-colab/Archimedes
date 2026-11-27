# Q01–Q03 局部修复证据

基线 HEAD：`1f4b37581c446770d576440f9ebb9bca5c55bfb7`；本地分支：`codex/research-workflow-integrity`。环境为 macOS arm64、Node 26.13.0。本目录仅记录三类原有全套失败的局部修复，不是整仓或发布二进制验收。

```sh
node --test electron/git-state.test.cjs electron/workspace-session-model.test.cjs electron/terminal-shell.test.cjs electron/i18n-translations.test.cjs
```

- [修前聚焦](quality-prerequisites-before.log)：22 项 / 13 通过 / 9 失败。这里已加三条行为回归，且后端并行把 store 路径改为 canonical，原迁移用例的字面路径期望因此出现一项差异；原三项 Git/store 失败中的 worktree 部分已因 canonical 输入绕过。**该日志不是原版全套基线**，原版记录仍见 [quality.md](../quality.md)。
- [Git 与 shell 修后](quality-prerequisites-git-shell-after.log)：12/12 通过。真实 Git 验证别名/物理目录、分支、malformed 子 `.git` 与父仓库边界；shell 保留所有原断言并补非 C: 盘、ProgramW6432 和 LOCALAPPDATA。
- [真实 worktree 操作](quality-prerequisites-worktree-after.log)：按明确名称选择的三条相关目标均通过，包含别名打开项目→创建→真实 Git 注册→删除，及非 Git 项目拒绝；不是全文件结果。
- [最终四文件](quality-prerequisites-after.log)：22/22 通过、零跳过。后端确认 canonical 返回契约后，将原迁移断言的 expected 改为同目录 realpath；没有删除断言。Library 与 sessionSnapshot 两处仅调键序，全部译文、唯一性/合并/排序断言保留。
- [受验文件摘要](quality-prerequisites.json)：保存命令、范围、结果与七份受验代码/测试的 SHA256；后续作者改动后不能沿用这些摘要声称重新验过。

`quality-prerequisites-core-after.log` 保留中间状态：Git/shell 已过，Library 排序修复后，同一个原排序检查继续暴露原 HEAD 中 sessionSnapshot 的第二处乱序。该分片当时未被其他作者改动，不能归因于并行前端新增。

修复只让 Windows 候选路径采用 Windows 目标语义；没有操作 Windows 真机或真实 PowerShell。Git 使用本机真实 Git 与独立临时目录，无用户仓库写入、远端操作或模型费用。产品变动无可见界面差异，前后行为日志替代截图；没有编造截图对。
