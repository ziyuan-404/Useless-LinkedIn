# 处理单个岗位

1. 保存 URL、时间、完整 JD 和实际可见的申请入口；核验原始雇主或 ATS 的开放状态。
2. 按 `modules/job-intelligence/MODULE.md` 与 `00-个人资料/operations/application-rules.md` 查重、执行 14 项 Knock-out，再做 A–G 分析；需要准备申请时另做 H 申请回答草稿。未知硬条件不得写 PASS；疑似重复不自动合并。
3. URL 路径运行 `node SKILL_ROOT/runtime/tools/useless-linkedin.mjs pipeline --url URL`。若进入 `awaiting-agent`，读取生成的 `agent-task.md`、`context.json`、`schema.json`，完成 assessment 后运行 `pipeline --id ID --assessment FILE`。
4. 抓取受阻时仅用实际看到的完整页面构造 `web-capture.json`；重新提交评估时带同一份仍有效的捕获。不要以搜索摘要伪造页面或申请控件。
5. FAIL、失效、确定重复转终止状态；MARGINAL 转待决定。PASS 按规则分流精投或海投，不能把适合申请等同于授权提交。
