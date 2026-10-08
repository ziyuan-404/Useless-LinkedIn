# 发现岗位

用户指定岗位族/合同类型时先写本次 scope JSON，再调用 `research --run --scope FILE --zero-token --concurrency 4`。平台探测、公开 API、本地 HTTP/Playwright、断点重放和全文分拣由脚本执行。按 manifest.executionPolicy 继续当前批次或发现检查点，不另起重复广泛搜索；仅异常交 Agent。只读取有界 manifest 与相关完整 JD；未知覆盖和访问阻断不得丢弃。具体输入、公司缓存与邮件凭证见 [共享交接](../references/company-cache-and-receipts.md)，平台配置见 [career-ops-integration.md](../references/career-ops-integration.md)。

正常运行只需本节及 [搜索运行交接](../references/research-handoff.md)，下面是配置/故障诊断参考，按需读取。不要启动时先读材料、提交、源码和整份台账。research 已完成本批全文初筛与历史查重；下一批用 executionPolicy.next，发现续跑用 discoveryNext，同一任务配置/ID保持稳定。人工搜索默认短摘要，完整岗位正文落盘并读当前必要 JD；处理后统一 --record 回写，不能只写 results.md。缺官方凭据或访问门槛保持未完成，不重复逐查询确认同一原因。

1. 统一入口为 research；需要独立诊断计划时再用 `scan --plan --summary`。持久默认偏好在 `个人资料/portals.yml`，本轮目标通过 scope 文件覆盖；来源注册在 `个人资料/applications/automation/discovered-sources.json`，不建立第二套候选人事实库。
2. API/列表取全部 `queries` 加 `query_matrix.roles × contracts`，按去除完全重复项后的 `locations` 展开。没有前三条 query 或每平台结果截断。`discovery.web_queries` 可单独指定覆盖合同/岗位族的组合网页查询；移除此项即逐条使用完整查询矩阵。默认只用 France 避免同一全国检索再乘地区和空地点；任何地点组合都可配置。
3. 默认按未执行/上次执行时间轮转，同等情况下 API 优先。渠道默认独立；明确配置 `listing_mode: fallback` 或 `web_search: fallback` 的渠道在主渠道受阻或覆盖不足时启用，不为重复 SPA 列表白耗预算。Open Web 与 Company Careers 始终是独立的发现任务。不得把后备未启用、待执行或预算暂停描述为已完成搜索。
4. 公开 API/HTTP 遵守 robots、同域间隔和服务器 Retry-After。408/425/429/5xx、超时和断网为 `retry-wait`，保存原因、次数和 `nextRetryAt`，到期后 scan 或 scan --resume 自动重试；403、登录和挑战为 blocked。旧 needs-agent 的明确临时错误会升级为可重试。预算耗尽保留 cursor。`--retry-agent` 可主动重新尝试非临时 Agent 任务，仍遵守退避和访问规则。
5. 选择适合平台的访问工具，不强制 IAB。`renderer: http` 只读静态页面；`auto` 在识别动态空壳后尝试隔离的 Playwright；`playwright` 显式渲染；`agent` 留给可用交互浏览器。`--no-browser` 禁用自动渲染。Playwright 不导入用户 Cookie/会话，遇访问挑战保留 blocked；没有足够页面证据时交 Agent，不尝试绕过验证码。动态 load-more、复杂交互和任意未覆盖平台可使用当前可用浏览器采集、注册来源和导入，无平台白名单。
6. WTTJ 按 nbPages/nbHits 翻页；Greenhouse、Lever、Ashby 使用公开接口。Greenhouse 默认轻量列表不含 JD，`include_description: true` 请求 content=true；正文仍不能代替详情有效性核验。SmartRecruiters、Workable、Workday 注册为观察到的招聘入口并通过通用列表/渲染或 Agent 接入；只识别入口不等于已验证专用 API。识别 a、iframe、script src 中的 ATS；Greenhouse embed 从 for 参数取 board token。
   France Travail 默认走官方 OAuth/API，按最新优先增量扫描，超过检索窗口用创建时间分段继续；La Bonne Alternance 默认读取每日完整官方导出，流式收集，不使用受限网页抓取。凭据只由进程环境提供；缺凭据保留任务并启用后备，配置凭据后自动恢复。接口字段、时间窗口边界、结构化地点配置、可选受限搜索及开源组件说明见 [官方接口说明](../references/official-job-apis.md)。
7. HTML 跟随实际 next 链接。已沿 next 链到静态末页、存在岗位且没有更多加载信号，默认可记录结束证据；`pagination.end_on_no_next: false` 要求更严格的结束核验。独立第一页没有 next、空壳、重复页、未知分页和服务端检索窗口均不能自动证明穷尽结果。静态完整列表可显式设置 exhaustive_listing。
8. 浏览器列表采集保存 `kind: listing`、请求 url、实际 pageUrl、capturedAt、bodyText 和 `links[{url,title,company,location,isJob}]`。isJob 仅代表真实观察到的岗位卡片/结构化岗位，不能给导航或广告添加。分页保存 nextUrls；paginationComplete 要有 completionEvidence。用 `scan --listing-capture FILE` 离线导入，不触发无关网站请求。普通列表默认同域，外部招聘来源另注册；确实需要跨域详情时显式配置 allowed_hosts。
9. 任意真实详情链接可用 `scan --import FILE --import-only` 导入 `[{url,title,company,portal,location,sourceUrl,capturedAt}]`。同 URL 锚点选岗位标题，舍弃 CTA 和分类导航。规范化 WTTJ 语言路径、LinkedIn job ID、Greenhouse 域名别名及语言/追踪参数，保留岗位 ID；相似标题仅标疑似重复，不自动合并。跨来源可在核验共同身份后填写 verifiedIdentity、identityEvidence；雇主原始 URL 用 employerOriginal，已投递/历史记录不改写 URL 和事实。
10. 已发现岗位全部保留，使用词边界、多语言合同别名及可配置 keyword_aliases 标 candidate/review。用 `triage --list-review --summary` 列出 review，`triage --list-closed --summary` 列出消失复核，`triage --run --summary` 在请求预算内读取完整 JD 做初筛；未完成任务保留，后续继续。完整 JD 命中合同/岗位词后提升 candidate，不匹配则保留并标 excluded，拦截/不完整内容不得当作不相关岗位排除。pipeline 默认也会先执行单岗位轻量分拣，再决定是否进入事实库/A–G。`--include-review` 仍允许主动深入处理，但不能绕过消失复核。list.md 显示搜索分拣、分拣结果及消失复核列。candidate 也不是资格通过或投递证据。
   默认 triage_refresh_hours=0：规则排除保持有效，直到规则或实际发现信息变化，或岗位消失需要复核。人工排除不被重发现覆盖。可用 `triage --id ID --reopen --run` 主动重开，或配置正数 triage_refresh_hours 定期复查。
11. 每页新增数据先事务写入 discovery.sqlite，成功后再推进分页 checkpoint。扫描结束批量合并到兼容 leads.json；异常中断的待合并页在下次事务恢复，通过 sequence 回执避免重复累计。leads.json 与 list.md 保留兼容读取；SQLite 只作为发现日志，不替代 Dashboard 权威申请台账。重复 observation 按来源/规范化 URL/query/地点/读取层汇总 firstSeenAt、lastSeenAt、count。同来源、URL、读取层的不同查询保存为 contexts，共享重复字段；`expandObservations()` 可恢复每条查询、任务、时间、次数及最近页面。旧记录首次事务迁移到 observationVersion=3，重复迁移不增加次数。真实新岗位/查询仍会增加存储，不宣称常数大小。SQLite 延迟导入，仅真正使用发现日志时才启用；Node 24 的 experimental 警告不全局屏蔽。
12. 完整快照保存页面摘要和岗位身份。仅明确配置 `incremental: {newest_first: true, stop_on_unchanged: true, full_refresh_hours: 168}`，且来源排序可靠时才在已见且未变页面结束增量扫描；周期性全量复核。默认 `discovery.conditional_requests: true` 开启 GET 的 ETag/Last-Modified 逐页条件请求：304 复用已验证页面，仍检查每个后续页，168 小时强制重新下载；POST/API 无验证器时继续完整请求，不虚构增量完成。来源可设 `incremental.conditional: false` 关闭。默认不对未知排序作提前结束推断。完整快照中缺失的旧岗位标 possiblyClosed 和 absenceSignals；增量暂停、失败、预算未完成均不作消失判断，任何消失信号都不能直接转 expired；triage 和 pipeline 会优先复核详情，真实仍活跃则清除标记，404/410 或明确关闭证据才记录 expired，并保护已投递/历史状态。
13. CLI 请求/每任务页预算为 discovery.max_requests_per_run / max_pages_per_task，0 为无限；整页结果完整保留，剩余任务和 cursor 续跑。网页/企业发现 cadence 用 web_refresh_hours；不是每日重跑全部 Agent 任务。扫描和线索事务锁识别存活 PID，恢复死亡 PID 或过期无主旧锁，不抢占运行中的操作。
14. Agent 用 `scan --sources FILE` 注册已观察来源；用 `scan --task-results FILE --import-only` 记录网页搜索或人工任务 `[{id,status,capturedAt,evidence,cursor}]`，status 为 completed/partial/blocked。completed 仅表示本任务此时观察完成，不证明全网无遗漏。只在实际处理时逐站验证真实平台。

## 通用配置示例

```json
[
  {"name":"Employer Careers","career_url":"https://employer.example/careers","renderer":"auto","enabled":true},
  {"name":"Employer Greenhouse","provider":"greenhouse","board_token":"observed-token","include_description":true,"listing_mode":"fallback","career_url":"https://job-boards.greenhouse.io/observed-token"},
  {"name":"Employer Lever","provider":"lever","site":"observed-site","region":"eu"},
  {"name":"Employer Ashby","provider":"ashby","site":"observed-board"},
  {"name":"Other JSON API","api_url":"https://employer.example/api/jobs?q={query}&location={location}","api":{"rows_path":"data.items","fields":{"url":"links.detail","title":"name","location":"office.city"},"pagination":{"mode":"offset","param":"offset","size_param":"limit","total_path":"data.total"},"page_size":100}}
]
```

通用 API 支持 next_path URL 或 page/offset + total_path，只有确实返回完整列表才设 api.exhaustive。请求超时和响应体大小保护不会裁剪 query 或结果；超限保持未完成并交 Agent 分拆或核验。公开规范：[Greenhouse](https://docs.greenhouse.io/job-board.html)、[Lever](https://github.com/lever/postings-api)、[Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api)。

## 批量分拣与开源组件

`triage` 默认列出待处理队列，`--run --max-requests N` 做完整 JD 初筛（0 为无限；默认 40）。`--config FILE` 使用指定搜索偏好；`--no-browser` 禁用动态渲染。不读候选人资料、不生成材料。已排除规则结果默认持续复用，规则或发现内容改变后重开；正数 triage_refresh_hours 可启用定期复查。访问错误按退避时间续跑。人工批量结果用 `--decisions FILE` 导入 `[{id,status:"candidate"|"excluded",evidence:"页面原文",captureFile:"工作区内完整页面 JSON"}]`；capture 必须含 kind=full-page、正确 URL、完整 jd/bodyText、观察到的 applyControls、24 小时内 capturedAt。人工决定可用 `--id ID --reopen` 重开，不由标题重扫覆盖。分拣页面缓存用摘要校验，pipeline 仅复用近期活跃完整页面；仍执行真实候选人资格核验。

HTTP 支持 `http_client: native|impit`，全部默认原生 Fetch；impit 0.14.5（Apache-2.0）只在明确按来源配置时使用。robots-parser 3.0.1（MIT）代替手写 robots 解析。所有客户端仍经过公开地址/重定向校验、robots、限速、退避，不导入登录资料，不绕过验证码。Playwright 承担 JS 渲染；复杂交互仍可交给可用浏览器。大体积官方导出复用 stream-json 3.7.0（BSD-3-Clause）流式处理。选用轻量组件保留已有持久任务/预算，不额外接入第二套爬虫队列。组件依据：[impit](https://github.com/apify/impit)、[robots-parser](https://github.com/samclarke/robots-parser)、[stream-json](https://github.com/uhop/stream-json)。


默认先用 research --run（已有线索用 research --screen-only）统一执行 scan、候选详情有效性与完整 JD 初筛；只返回有界交接。详见 [本地脚本入口](../references/batch-application.md)。查历史公司/岗位用 leads 字面查询，不将全队列加载进模型。原始捕获、分页覆盖和未决来源保持完整；关键词原文提示不代替完整 JD 或 KO。
