# 批次与 IAB 执行器

模型负责资格判断、新问题及异常。原始证据完整落盘，确定性工具处理队列、精确答案匹配、材料选择、表单和状态校验。人物事实仍只来自 profile。

## 采集与判断

用 scan --plan --summary、scan --summary、triage --run --summary。完整报告写在返回的路径，模型只看数量、异常和本批 ID。未完成覆盖及 review 队列不会被截断。

用 batch --stage assess --limit 10 获取本批 manifest 和 task。读取 agent-context.json 和其 factsFile，共用包每批读一次。完整 JD 保留；经历索引只用于检索，实际判断和写作前读取相关经历原文。context.json 是完整审计快照，不默认读整份。

先完成全部14项 KO。FAIL/MARGINAL 可按 gate.schema.json 输出简版，不生成 A–G、问答或材料；PASS 仍按 assessment.schema.json 完整评估和路由。海投必须选已经核验的简历；池为空时保留待决定，不假定存在材料。保存每条 assessment 和状态后继续其他岗位。

新的阶段会话可直接读取交接文件，不需要原聊天历史。命令不会自动删除上下文或创建聊天，“忘记前文”也不保证缩小输入。独立会话用于阶段交接，不逐字段新开会话。

## IAB 操作

1. batch --stage submit --limit 10 列出已审核岗位并按域名分组。使用 IAB；跨域 ATS 入口先保存实际入口及跳转证据，更新该岗位 capture 的 finalUrl，不能任意指定另一页面。
2. 会话开始运行 apply --iab-script，将返回代码直接放入 cua_repl 执行一次，之后复用 applicationExecutor 和已有 IAB tab。不要用 eval/动态导入加载：当前 REPL 禁止字符串代码生成。脚本只调用当前 IAB 文档接口，不启动另一浏览器，不要求在 cua_repl 导入本地模块。
3. 运行 `await applicationExecutor.inspectIabForm(tab)`，把返回 JSON 保存到工作区。多个 form 时从实际 DOM 确认目标 scope 并作为第二个参数传入；不得猜选择器。
4. apply --id ID --prepare --form FILE 返回 plan.json。工具核对审核快照和授权，匹配来源、实际选项及材料；同域同结构模板复用，每次仍检查当前页面。模板不保存候选人答案。
5. 运行 `await applicationExecutor.executeIabPlan(tab, plan)`。先上传，跳过正确字段，再批量填写和核对。简历解析或条件字段改变结构时返回新 form，重新 prepare；不执行旧结构。每页一次批量，随后观察新页。
6. 对未知问题按原文、选项和 profile 核实。复用答案用 apply --answers FILE 注册数组，条目为 `{questions:["完整问题及已核验别名"],answer:"答案"或布尔值,status:"confirmed",sources:[{path:"个人资料/profile/...",quote:"完整原文"}]}`。记录只引用事实；引用文件改变后失效。许可、现在/未来 sponsorship 和否定句不模糊合并。未知身份声明不得猜测。
7. 未识别按钮由 Agent 根据实际页面判断后，用 --action next|submit --control 完整按钮名选择。工具拒绝未观察到或不唯一的控件；同结构复用绑定。iframe、特殊 autocomplete 及未知日期/数字格式保留给 Agent。
8. ready-to-submit 结果落盘后，紧接着 apply --id ID --arm --result FILE。重新核对事实、材料、答案和授权，先保存唯一 attempt 并进入 submission-unconfirmed，返回5分钟有效的 permit.json。这是持久化和质量核对，不要求用户逐岗位批准。
9. 运行 `await applicationExecutor.executeIabPlan(tab, plan, {permit})`，最终按钮只点击一次。结果保存后 apply --id ID --record FILE。只有本次新增明确成功文字、同源原始 DOM 凭证和对应 attempt，才由原 state 工具进入 submitted 并同步 Dashboard。成功区过大或跨域时另保存截图/确认邮件，使用既有 receipt 流程。
10. batch --stage reconcile 只处理未核验尝试。先读平台状态、成功页或批量查询 Gmail 确认邮件；不再次点击提交。发生中断，即使不确定是否点击也先核验。

## 修复与指标

文件选择器先监听，再触发；可见关联 label 优先点击，其他控件按 Enter/点击各最多一次。下一页无变化时在相同已观察按钮上最多尝试一次 Enter；最终提交不重试。失败保存具体步骤，继续其他岗位，不反复探索同一个卡点。

IAB 可能省略 FileList/原生 validity 属性，文件用选择器完成事件及所选文件名核验，格式用 :invalid 检查。邮箱/电话显示 `<redacted>` 时，只在本次已按事实来源成功 fill 后接受浏览器格式校验，并在 ready 结果列出 redactedFields；不会猜测遮蔽内容或绕过隐私屏蔽。无法逐字确认的联系方式会重新填写，其他已正确字段仍跳过。

每页结果均运行 record。application-metrics 保存各次操作次数、填写/跳过/上传数量及耗时，重复导入同一结果不重复累计。操作数不等于 token 或订阅扣费；节省比例需要实测。

当前覆盖原生文本、select、checkbox、radio、关联 label 上传、Next/Review 和显式成功页。特殊结构交 Agent；不能用本地模拟声称所有真实 ATS 兼容。没有新增 Stagehand、Browser Use、云浏览器或 ATS 私有提交接口依赖。
# 本地脚本优先的搜索与材料准备

## 搜索、核实与初筛

默认用统一入口 `research --run --limit 10 --max-requests 40 --triage-requests 40`。它顺序调用本地 scan 和完整 JD triage，保留原有公开接口、分页、去重、robots、退避、条件请求、覆盖记录及请求预算；stdout 只返回数量和文件路径。40 是本轮请求预算，不是永久截断岗位数量；预算用完的任务保留待续跑。`research --screen-only` 处理已发现线索，不重复扫描列表；无 run/screen-only 时仅生成已有证据交接。

manifest 含本批卡片、准确 JD 原文提示、完整 JD 文件、capture 来源和散列、coverage 各状态数量、remaining/nextOffset。下一批用 `--offset N`；全部队列和原始证据留在磁盘。卡片提示只帮助检索，不是资格判定；候选岗位仍读取完整 JD、最小事实包、相关经历原文并完成全部14项 KO。没有足够证据的硬条件保持 UNKNOWN/MARGINAL。FAIL/MARGINAL 的简版 gate 与 PASS 的完整 A–G 约束保持。

完整候选详情默认复用24小时内散列未变的 capture；过期/被修改/消失信号会重新核验。已被阻挡或内容不完整的检查默认保留24小时，返回给 Agent 处理，不反复碰同一个门槛，也不当成有效或失效。显式 `research --screen-only --retry-agent` 可重试当前阻挡；临时网络错误仍按 nextRetryAt，不绕过退避。真实提交前仍用 IAB 当前页面核验，24小时缓存不证明提交时仍开放。

用 `leads --query 公司 --limit 10` 查询当前公司，多个词按字面 AND 匹配公司/岗位/URL；不会把布尔判断拼成字符串。`leads --id ID` 是精确查询。默认有界输出，完整选中记录保存到 queries 文件；不打印全部台账。用 `leads --ids FILE --sync-submitted` 同步本批已提交岗位，每条仍走 dashboard 成功凭证文件/散列核验，绝不推断成功。

## 材料生成与检查

1. `materials --plan --ids FILE` 先列出可准备和延后项。有效性未知、没有真实观察到的申请控件、失效、重复未决、已申请或没有有来源的 payload 时延后；不先为没有入口的岗位批量制作材料。
2. 学校绑定提示是保守复核，不自动判诈骗/不适合。要继续，assessment 的 schoolRouteReview 必须有20字以上理由、当前 JD 的 jdQuote、人物事实 sources 原文；这仅记录核实依据，不代替学历/学校/合同 KO。
3. 对共用且有来源的条目准备 base recipe，仅对岗位文字写 tailoring recipe。`materials --compose --base FILE --tailoring FILE --out FILE` 按 selector/index 合并并核查原文来源，拒绝同一 recipe 重复索引。不要从其他公司的整封动机信批量替换公司名；每份仍根据当前 JD、真实经历写明确岗位动机和缺口。
4. assessment 为当前 full PASS，或有明确 userOverride 和 matchSources 的 user-selected-application；后者保留未决条件，不虚构 PASS。`materials --run --ids FILE` 验证完整事实快照后共享一个隔离的本地渲染器，逐岗位生成 PDF、压缩、比对文本词/数字完整性、检查页数/体积/横纵溢出，输出 review.json 和 review.png。
5. review.json 汇总两份最终 PDF 文本与机器检查信息；review.png 并排展示最终 PDF 页面，源高清单页仍保留。Agent 一次读小报告并目视查看，异常再打开局部/单页。机器不能验证任意改写的语义真实，也不能保证全部复杂视觉关系；来源语义、重要要求、合同路线和版面仍必须审核。
6. 不变材料按公司/岗位/日期、payload、全部人物事实/模板与引用来源、生成器/QA版本以及已生成文件散列复用。事实、模板、成品任一改变不复用；缓存命中仍停留在 materials-pending-review，不自动批准。已有材料不被覆盖。

入口不会自动清空聊天或创建新会话。跨阶段把文件作为交接，每段新会话只读本段小包；减少历史重复参与调用。不得把文件大小降低直接换算成订阅额度降低；真实节省需要相近岗位和模型的后续运行测量。

精投完整评估可以不附 payload，先运行 pipeline --assessment FILE --defer-materials。它仍校验全部 KO、A–G、事实快照和路由，但只保存评估/入口预检，不提前生成。随后 materials --plan 返回 routeReady 与 ready：入口可用但缺 payload 时只可准备有来源的文字，不能渲染。bulk 继续使用已核验简历池，不走精投生成器。
