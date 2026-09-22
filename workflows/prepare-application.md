# 准备材料

1. 精投按 `references/precision-workflow.md`、`modules/resume-builder/MODULE.md` 和 `modules/application-writing/MODULE.md` 生成岗位专属材料。使用唯一事实库中的完整引用和共享 `generate-application.mjs`；不得新增公司脚本或覆盖母版。
2. 海投按 `.career-os/operations/resume-strategy.md` 选简历，使用 `select-resume.mjs` 核对 verified 状态和当前 SHA256。
3. 核对最终 PDF 文本、事实语义和页面截图。机器检查通过只到 `materials-pending-review`；新材料进入 `review-required`，记录审阅依据后才到 `approved`。
4. 关键事实缺失时转 `needs-decision`，记录 `reason=missing_fact` 和具体待确认项；不补造或误写为准备完成。
