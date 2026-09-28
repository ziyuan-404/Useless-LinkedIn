# 准备材料

1. 精投按 `references/precision-workflow.md`、`modules/resume-builder/MODULE.md`、`modules/resume-builder/cv.md` 和 `modules/application-writing/MODULE.md` 生成岗位专属材料。使用唯一事实库中的完整引用和共享 `generate-application.mjs`；不得新增公司脚本或覆盖母版。
2. 海投按 `个人资料/operations/resume-strategy.md` 选简历，使用 `useless-linkedin.mjs resume select --family FAMILY` 核对 verified 状态和当前 SHA256；同 family 有多个 verified 版本时先用 `resume activate --id ID` 指定唯一版本。
3. 核对最终 PDF 文本、事实语义和页面截图。机器检查通过只到 `materials-pending-review`；Agent 进入 `review-required`，完成来源、合同路线、版面、文件名和大小的审查后，用具体审查依据进入 `approved`。这是质量检查，不是向用户索取逐次提交许可；检查不通过则修复或标记该岗位受阻，继续其他岗位。
4. 关键事实缺失时转 `needs-decision`，记录 `reason=missing_fact` 和具体待确认项；不补造或误写为准备完成。
