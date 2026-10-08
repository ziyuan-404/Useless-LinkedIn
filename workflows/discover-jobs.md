# 发现岗位

正常执行只读本页及 [搜索交接](../references/research-handoff.md)。底层配置、来源适配器与异常诊断按需查 [运行参考](../references/discovery-runtime.md)，不预读材料和提交模块。

1. 首次搜索：用 research --run --scope FILE --zero-token --concurrency 4 --limit 10。已有本轮 manifest 时先 research --plan --manifest FILE；沿用交接命令和同一 scope，不重新广搜。执行中每次等待30–60秒。
2. 只读返回的 handoff.json、当前岗位完整 JD 和必要人物事实。完整台账、原始来源、覆盖和后续卡片保存在文件。历史和已证明的跨平台同岗由脚本检查；标题相似只能提示核实。
3. 已验证抓取直接用卡片的 recordCapture 命令；缺失正文优先 fetch-jd，仍受阻才用用户指定浏览器观察完整正文、具体条款和真实申请链接。人工捕获按共享格式保存，再 research --capture --id ID --file FILE --manifest MANIFEST；不重组已抓取的正文，不保存截图或整页 HTML。
4. 观察到原岗位的申请链接/跳转时保存 posting-route 证据，再 research --link FILE --manifest MANIFEST。同岗关联不复制投递状态和凭证；官网已关闭的同岗延后，不误判为新岗位。
5. 对当前卡片用 batch --stage assess --ids FILE。填写脚本生成的 gate-draft.json，核实完整14项 KO、来源和 contextHash；未审草稿不能提交。FAIL/MARGINAL 用简版，PASS 才做完整 A–G。未知条件保持 UNKNOWN，不因初筛或学校提示自动判通过/失败。
6. 卡片的 requirements/constraintGroups 是原文约束和重复条款索引。只在同一学校/来源、完全相同条款且来源散列未变时复用已审解释；人物条件和岗位例外仍逐项核实。学校品牌影响排序，不删除 blocked、pending 或学校线索。
7. 当前岗位处理完，按返回的下一批命令续跑。需要网页补充时 research --tasks --manifest MANIFEST --limit 5，执行准确查询，填写其 recordTemplate 并回写每个任务的真实 completed/partial/blocked 状态。只有实际结束条件才 completed；缺凭据/未来重试保留未决。

文件交接不会清空当前聊天。独立阶段会话需要用户创建或明确要求创建；不能声称 handoff、压缩或“忘记前文”降低了已累计上下文。
