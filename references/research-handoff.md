# 搜索运行交接

一次读取当前 scope 和 research 返回的 handoff.json，确定性操作交脚本。handoff 是精简的当前卡片/执行命令；manifest 是续跑和审计文件，直接交 --continue/--manifest，不默认整份读入模型。完整 JD、来源、历史与未完成覆盖留在文件；不读取运行源码、全部 ID/台账或预读提交模块。

## 入口与续跑

```text
research --run --scope FILE --zero-token --concurrency 4 --limit 10
research --continue MANIFEST
research --plan --manifest MANIFEST
research --run --resume --scope SCOPE_FILE --config CONFIG_FILE
research --screen-only --manifest MANIFEST
research --tasks --manifest MANIFEST --limit 5
research --tasks --manifest MANIFEST --query "EXACT_TEMPORARY_QUERY"
research --record RECORD_FILE --manifest MANIFEST
research --capture --id ID --file FILE --cached --manifest MANIFEST
research --link ROUTE_FILE --manifest MANIFEST
leads --ids FILE --check-history
```

续批/续跑采用 manifest.executionPolicy 原命令与配置。--continue 不再扫描，继承批量大小、任务配置和 no-browser；--screen-only 重新包装当前证据并只核实本批。已提交/未确认申请由本地历史保护，不重投。若旧证据散列不一致，仅处理相应凭证，不重新搜索岗位。历史文件是 items，不是 jobs。

--tasks 优先交接可处理的网页/企业发现任务，并轮换平台；缺凭据和未来 nextRetryAt 的任务只计入 deferred，仍保存原状态和游标，不逐条要求 Agent 重试。返回 taskBatch 和 recordTemplate；直接填写模板，不重建字段。必须按准确 query 搜索，每个已发任务均记录实际状态、时间、证据，completed 另填实际 endCondition。未回写的批次再次调用复用模板，续跑提示先完成交接；partial/blocked 关闭本次交接但保留未完成覆盖。

scope 支持 queries、query_matrix{roles,contracts}、web_queries、locations 及 role_keywords/include_keywords/exclude_keywords/keyword_aliases。显式 queries 替换旧查询和未提供的旧矩阵；显式 query_matrix 与 queries 合并。只给岗位/合同关键词时脚本生成查询。独立 API、列表、Open Web、Company Careers 渠道保持，未完成覆盖不会被隐藏。

临时查询先用 --tasks --query 注册准确文本，取得任务 ID 和回写模板，再检索；已有未回写批次先完成交接。临时任务挂在当前 scope 的网页发现任务上，准确查询相同则复用 ID；partial/blocked 不被退休或当作完成。未启用网页发现的 scope 先启用该渠道，不能把临时查询塞入无关任务。

合同命中优先；合同未知仍可审阅。明确其他合同或标题排除词命中、未匹配线索分层延后，保留在 deferred 文件；需要时显式 --include-unmatched，不能把延后等同候选人 KO FAIL。

## 后备核实与统一回写

只有 --tasks 返回的未决查询或当前卡片的受阻详情需要 Agent。先看 sourceIssues 的缺凭据/robots/403 汇总；不对同一门槛反复试探。网页搜索默认短输出，新链接落盘后调用本地抓取/初筛。确实需浏览器时只取完整 JD、身份与申请控件/关闭证据，不保留截图、页面快照、Base64 或导航历史。

回写数组均可省略；任务批次沿用生成模板的 taskBatch：

```json
{
  "version": 1,
  "imports": [{"url":"https://employer.example/jobs/123","title":"Alternance Agent IA","company":"Observed employer","sourceUrl":"https://employer.example/careers","capturedAt":"CURRENT_ISO_TIME"}],
  "captures": [{"id":"EXISTING_LEAD_ID","captureFile":"observed-jd.json"}],
  "decisions": [{"id":"EXISTING_LEAD_ID","status":"excluded","evidence":"Exact observed JD quote","captureFile":"observed-jd.json"}],
  "tasks": [{"id":"CURRENT_TASK_ID","query":"EXACT_ISSUED_QUERY","status":"completed","capturedAt":"CURRENT_ISO_TIME","evidence":"Observed coverage for this query","endCondition":"Actual observed end of this query"}]
}
```

新 URL 可在同一输入里 imports，并用 url 替代 captures/decisions 的 id，由脚本匹配新 ID；返回 importedIdsFile 可直接交给批次命令。也可先导入后按已有 ID 回写。同一岗位不要同时提交 captures 与 decisions。只记录实际观察到的工作：任务没查完写 partial，受阻写 blocked；completed 不证明全网穷尽，更不证明申请成功。重复相同输入/证据会复用，改动证据会重新验证；输入失败不会把其任务标 completed。

captureFile 是工作区内的结构化正文 JSON：kind=full-page、url、实际 finalUrl（如果有）、capturedAt、完整 jd、包含该 JD 的 bodyText、实际观察到的 applyControls[]。这是岗位正文与控件证据，不是截图或 HTML 页面快照。活跃 JD 至少300字符；明确关闭页允许短文本及空控件。脚本重新判断状态，不信任输入自称 active/expired。身份不一致、旧捕获、伪引文或工作区外文件拒绝导入。

本地已注册并散列未变的抓取可用 --cached 直接回写（卡片已有完整命令）。HTTP/JSON-LD 正文不必由 Agent 追加到 bodyText；公开 ATS API 发布的完整 JD 可保留发布状态，但空控件始终不证明表单入口已核实。--cached 拒绝来源未注册、内容改变或过期的文件，不能靠输入自称缓存绕过校验。

实际观察到跨平台申请链接时保存 JSON：kind=posting-route、fromUrl、toUrl、observedHref、action=apply-link 或 redirect、capturedAt；URL 必须来自真实观察，不可由标题推测。两端岗位先导入，再 --link；证据路径和散列持久保存，urlAliases 供历史和入口检查复用。此动作不复制提交状态或凭证。

重复学校/学历条款用卡片的 requirements 文件取完整原文；可回写 constraintReviews:[{id,groupId,interpretation}]。脚本核实来源注册、准确原文和散列；解释缓存只对同一条款适用，绝不生成候选人 KO 决定。更改/丢失来源即失效。

captures 自动按当前搜索规则分拣；decisions 是有 JD 引文的人工初筛，不能宣称候选人 KO PASS。日期/学历/节奏等资格判断继续用 batch assess 和完整事实/简版 gate，结果保存后进入已有状态流程。材料和提交凭证规则不变。

batch --stage assess 返回每岗 gate-draft.json，已含真实 contextHash、14项 UNKNOWN 和 draft/reviewRequired 标记。Agent 填判断及原文引用，完成审核后将标记改为 false；不要复制其他公司 gate 或默认 PASS。可用 batch --stage assess --commit FILE（[{id,file}]）统一校验保存，每项独立返回结果，任一失败退出非零；--limit 控制本批，remaining 提示续批。PASS 使用完整评估 schema，简版草稿不是完整评估替代。

CLI 返回短结果；长诊断在文件。正常运行使用 --help 或此输入合同，不能猜内部模块文件名。执行未结束时每次等待30–60秒（最多60秒），不每几秒轮询，也不把等待时间填满源码阅读。
