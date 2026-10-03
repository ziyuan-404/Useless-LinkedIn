# 发现岗位

1. 读取申请历史，用 `scan --plan` 检查查询、来源和地点，然后运行 `scan`。搜索偏好只在工作区 `个人资料/portals.yml` 修改；来源注册在 `个人资料/applications/automation/discovered-sources.json`，不建立第二套候选人事实库。
2. API/列表取全部 `queries` 加 `query_matrix.roles × contracts`，按去除完全重复项后的 `locations` 展开。没有前三条 query 或每平台结果截断。`discovery.web_queries` 可单独指定覆盖合同/岗位族的组合网页查询；移除此项即逐条使用完整查询矩阵。默认只用 France 避免同一全国检索再乘地区和空地点；任何地点组合都可配置。
3. 默认按未执行/上次执行时间轮转，同等情况下 API 优先。渠道默认独立；明确配置 `listing_mode: fallback` 或 `web_search: fallback` 的渠道在主渠道受阻或覆盖不足时启用，不为重复 SPA 列表白耗预算。Open Web 与 Company Careers 始终是独立的发现任务。不得把后备未启用、待执行或预算暂停描述为已完成搜索。
4. 公开 API/HTTP 遵守 robots、同域间隔和服务器 Retry-After。408/425/429/5xx、超时和断网为 `retry-wait`，保存原因、次数和 `nextRetryAt`，到期后 scan 或 scan --resume 自动重试；403、登录和挑战为 blocked。旧 needs-agent 的明确临时错误会升级为可重试。预算耗尽保留 cursor。`--retry-agent` 可主动重新尝试非临时 Agent 任务，仍遵守退避和访问规则。
5. 选择适合平台的访问工具，不强制 IAB。`renderer: http` 只读静态页面；`auto` 在识别动态空壳后尝试隔离的 Playwright；`playwright` 显式渲染；`agent` 留给可用交互浏览器。`--no-browser` 禁用自动渲染。Playwright 不导入用户 Cookie/会话，遇访问挑战保留 blocked；没有足够页面证据时交 Agent，不尝试绕过验证码。动态 load-more、复杂交互和任意未覆盖平台可使用当前可用浏览器采集、注册来源和导入，无平台白名单。
6. WTTJ 按 nbPages/nbHits 翻页；Greenhouse、Lever、Ashby 使用公开接口。Greenhouse 默认轻量列表不含 JD，`include_description: true` 请求 content=true；正文仍不能代替详情有效性核验。SmartRecruiters、Workable、Workday 注册为观察到的招聘入口并通过通用列表/渲染或 Agent 接入；只识别入口不等于已验证专用 API。识别 a、iframe、script src 中的 ATS；Greenhouse embed 从 for 参数取 board token。
7. HTML 跟随实际 next 链接。已沿 next 链到静态末页、存在岗位且没有更多加载信号，默认可记录结束证据；`pagination.end_on_no_next: false` 要求更严格的结束核验。独立第一页没有 next、空壳、重复页、未知分页和服务端检索窗口均不能自动证明穷尽结果。静态完整列表可显式设置 exhaustive_listing。
8. 浏览器列表采集保存 `kind: listing`、请求 url、实际 pageUrl、capturedAt、bodyText 和 `links[{url,title,company,location,isJob}]`。isJob 仅代表真实观察到的岗位卡片/结构化岗位，不能给导航或广告添加。分页保存 nextUrls；paginationComplete 要有 completionEvidence。用 `scan --listing-capture FILE` 离线导入，不触发无关网站请求。普通列表默认同域，外部招聘来源另注册；确实需要跨域详情时显式配置 allowed_hosts。
9. 任意真实详情链接可用 `scan --import FILE --import-only` 导入 `[{url,title,company,portal,location,sourceUrl,capturedAt}]`。同 URL 锚点选岗位标题，舍弃 CTA 和分类导航。规范化 WTTJ 语言路径、LinkedIn job ID、Greenhouse 域名别名及语言/追踪参数，保留岗位 ID；相似标题仅标疑似重复，不自动合并。跨来源可在核验共同身份后填写 verifiedIdentity、identityEvidence；雇主原始 URL 用 employerOriginal，已投递/历史记录不改写 URL 和事实。
10. 已发现岗位全部保留，使用词边界、多语言合同别名及可配置 keyword_aliases 标 candidate/review。review 默认不进入 pipeline 的完整 JD/事实库/A–G；先检查标题、合同、地点、排除原因，确需深入核验才用 --include-review。candidate 也不是资格通过或投递证据。
11. 每页新增数据先事务写入 discovery.sqlite，成功后再推进分页 checkpoint。扫描结束批量合并到兼容 leads.json；异常中断的待合并页在下次事务恢复，通过 sequence 回执避免重复累计。leads.json 与 list.md 保留兼容读取；SQLite 只作为发现日志，不替代 Dashboard 权威申请台账。重复 observation 按来源/规范化 URL/query/地点/读取层汇总 firstSeenAt、lastSeenAt、count，保留最近页面而不逐日增长。旧记录首次事务迁移。
12. 完整快照保存页面摘要和岗位身份。仅明确配置 `incremental: {newest_first: true, stop_on_unchanged: true, full_refresh_hours: 168}`，且来源排序可靠时才在已见且未变页面结束增量扫描；周期性全量复核。默认不对未知排序作这种推断。完整快照中缺失的旧岗位标 possiblyClosed 和 absenceSignals；增量暂停、失败、预算未完成均不作消失判断，任何消失信号都不能直接转 expired。
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
