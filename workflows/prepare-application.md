# 准备材料

1. 精投按 `references/precision-workflow.md`、`modules/resume-builder/MODULE.md`、`modules/resume-builder/cv.md` 和 `modules/application-writing/MODULE.md` 生成岗位专属材料。使用唯一事实库中的完整引用和共享 `generate-application.mjs`；不得新增公司脚本或覆盖母版。
2. 海投按 `个人资料/operations/resume-strategy.md` 选简历，使用 `useless-linkedin.mjs resume select --family FAMILY` 核对 verified 状态和当前 SHA256；同 family 有多个 verified 版本时先用 `resume activate --id ID` 指定唯一版本。
3. 核对最终 PDF 文本、事实语义和页面截图。机器检查通过只到 `materials-pending-review`；Agent 进入 `review-required`，完成来源、合同路线、版面、文件名和大小的审查后，用具体审查依据进入 `approved`。这是质量检查，不是向用户索取逐次提交许可；检查不通过则修复或标记该岗位受阻，继续其他岗位。
4. 关键事实缺失时转 `needs-decision`，记录 `reason=missing_fact` 和具体待确认项；不补造或误写为准备完成。

批量材料默认先 materials --plan 核对入口/有效性/学校渠道，再按需 compose 共用已确认条目与岗位定制文字，用 materials --run 批量渲染、压缩、文本与溢出检查。不变产物散列校验后复用；事实或模板变化重新准备。生成器不评估任意改写的语义；阅读最终 PDF review.json、目视 review.png，异常查看高清单页后再按既有流程批准。详见 [本地脚本入口](../references/batch-application.md)。
