# 处理单个岗位

本地黑名单与 API 全文/存活门禁先执行。独立评估服务就绪时使用 evaluate 批量生成 KO/A–G 草稿与证据矩阵；复核 evaluation.reviewRequired 标记及原文后才进入 pipeline。服务未配置时继续既有有界 Agent 评估，不声称免费模型已启用。详见 [移植说明](../references/career-ops-integration.md)。

1. discoveryDisposition=review 的线索先通过 `triage --run` 或 pipeline 自动单岗位分拣读取完整 JD；合同/技能只出现在正文也可提升 candidate。未解决、访问受阻或已排除的线索跳过候选人事实库/A–G，仍在 `triage --list-review` 和 list.md 可见。possiblyClosed 必须先用详情证据复核；仅列表消失不能标 expired。candidate 也不代表资格通过。
2. 保存 URL、时间、完整 JD 和实际可见的申请入口；核验原始雇主或 ATS 的开放状态。
3. 按 `modules/job-intelligence/MODULE.md` 与 `个人资料/operations/application-rules.md` 查重、执行 14 项 Knock-out。FAIL/MARGINAL 保存 gate 后结束本岗位评估；PASS 才做 A–G 分析，需要准备申请时另做 H 申请回答草稿。未知硬条件不得写 PASS；疑似重复不自动合并。
4. URL 路径运行 `node SKILL_ROOT/runtime/tools/useless-linkedin.mjs pipeline --url URL`。若进入 `awaiting-agent`，读取 agent-task.md、agent-context.json 及其共用 factsFile；按 JD 检索相关经历原文，不默认读完整 context.json。FAIL/MARGINAL 只读取 gate.schema.json 提前结束；PASS 才读取 schema.json 完整评估。完成 assessment 后运行 `pipeline --id ID --assessment FILE`。多岗位用 batch --stage assess。
5. 抓取受阻时仅用实际看到的完整页面构造 `web-capture.json`；重新提交评估时带同一份仍有效的捕获。不要以搜索摘要伪造页面或申请控件。
6. FAIL、失效、确定重复转终止状态；MARGINAL 转待决定。PASS 按规则分流精投或海投，不能把适合申请等同于授权提交。
