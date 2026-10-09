# 自动发现、官网注册表与邮件提醒

先使用共享 research --run，不创建第二套扫描器。默认继承 portals.yml 的请求预算和并发；scan --resume 保留页面、搜索结果核验和官网文档队列。发现阶段不调用模型，零模型不代表没有网络请求、API费用或对话上下文消耗。

## 搜索来源

discovery.web_backend 支持 auto、searxng、brave、anysearch、agent。auto 优先使用配置的 SearXNG，再使用环境中的 BRAVE_SEARCH_API_KEY；没有后端时明确留待配置或 Agent，不声称脚本已搜索。APEC、JobTeaser、LesJeudis、Talent.com、StudentJob 等只有 search_domain 的来源也能走这个通用搜索与核验通道，无须先猜网站内部接口。

```yaml
discovery:
  web_backend: searxng
  searxng:
    api_url: http://127.0.0.1:8080/search
    allow_loopback: true
  companies_file: 个人资料/companies.yml
  max_requests_per_run: 80
  triage_max_requests: 40
```

SearXNG 是复用的开源搜索服务，需要独立安装并启用 JSON 输出；项目不静默安装 Docker，也不选择未核实的公共实例。allow_loopback 只允许显式配置的回环搜索服务，不放开岗位页面的内网请求保护；拒绝搜索服务重定向。参考 [官方安装](https://docs.searxng.org/admin/installation-docker.html) 和 [Search API](https://docs.searxng.org/dev/search_api.html)。

Brave 使用环境密钥与官方接口，每页至多20条、offset 0–9是供应商限制，并记录其窗口；只有 more_results_available=false 才有搜索结束证据。[官方分页说明](https://api-dashboard.search.brave.com/app/documentation/web-search/codes)。AnySearch 的10条供应商窗口仍保留且不冒充全覆盖；zero-token 允许这类无模型检索，但查询可能消耗供应商配额。SearXNG 即使返回空页，也可能有引擎失败或有限窗口，因此保留 search_end_unverified。已核验完当前窗口且无引擎失败的查询按刷新周期自动重试，不交 Agent 重做；有未核验正文或访问阻断的结果仍需处理。采集的真实岗位照常入库，未知覆盖保持未完成。

所有结果逐条获取详情。只接受实际 JobPosting 或经过正文、岗位路由和有效性验证的详情；搜索标题、摘要、分类页、广告和培训页不直接成为岗位。site 范围也在本地验证；可信 ATS 跳转另注册来源。预算暂停保存尚未核验的链接，暂时失败原位重试，来源接口恢复后不重新搜索已经保存的第一页。

## 企业官网

个人资料/companies.yml 是用户公司清单，初始为空，不虚构目标公司。真实搜索结果中的 ATS 和招聘入口自动进入 discovered-sources.json，下一轮作为注册来源运行。可将已验证入口填写到清单，每家公司一个整板任务，查询矩阵只用于本地筛选。

```yaml
version: 1
companies:
  - name: Example employer
    career_url: https://employer.example/careers
    sitemap_urls: [https://employer.example/jobs-sitemap.xml]
    job_pattern: /jobs/\d+
    renderer: auto
```

已知 URL 复用102个上游 provider 或原生 ATS 接口。官网 HTML 同时检查重定向、链接、iframe/script 和 JSON-LD/内嵌 JSON 中明确标记的 JobPosting。自定义官网启用 career_extract，依次收集实际 next 链、RSS/Atom 和 robots 中声明或配置的 sitemap；sitemap index 可以递归，URL保持同来源边界。没有证据时不把普通 JSON 的 title 字段猜成岗位。

队列按文档保存，详情需验证，预算可续跑。sitemap.lastmod 未变时复用已验证岗位键，完整复查期限到后仍会请求正文；增量扫描不重置上次完整扫描时间。XML快照完成不等于任意动态列表全覆盖，动态空壳、缺失详情和未确认末页保持未决。岗位从完整快照消失只触发 possiblyClosed 复核，详情404/410或明确关闭证据才确认失效。

Playwright 可观察 XHR，但仅自动学习同源、无 Cookie/Authorization、无签名参数、GET响应有明确 JobPosting 对象且已观察大小在预算内的 JSON接口。分页只使用实际 next 或 total 元数据，没有元数据不宣称完整。learned-job-apis.json 保存配置与证据，下一周期优先HTTP接口，HTML作为后备。关闭学习可设置 learn_observed_api=false；其他接口仍需要配置映射/适配器，不盲目回放登录请求。

## 邮件提醒

复用 [MailParser](https://nodemailer.com/extras/mailparser) 与 [ImapFlow](https://github.com/postalsys/imapflow)，均为MIT许可。alerts --eml FILE_OR_DIRECTORY 可以解析本地导出的岗位提醒；alerts --imap 只读取明确配置的邮箱文件夹，使用TLS、只读EXAMINE、BODY.PEEK，不设置已读、不发邮件。凭据仅来自环境，UID/UIDVALIDITY、消息散列和文件进度可续跑。邮箱账号和原始邮件不写入发布副本。

个人资料/operations/alerts.json 示例：

```json
{
  "allowed_hosts": ["linkedin.com", "indeed.com"],
  "allowed_senders": ["alerts@example.org"],
  "imap": {
    "host": "imap.example.org",
    "mailbox": "JobAlerts",
    "user_env": "JOB_ALERT_IMAP_USER",
    "password_env": "JOB_ALERT_IMAP_PASSWORD"
  }
}
```

使用真实提醒发件人替换示例。alerts输出的文件通过 scan --alerts FILE 或 discovery.alerts_file 接入；链接照常逐一验证，无搜索后端也可收集邮件渠道。提醒的中转链接、登录或robots阻断仍可能无法验证，邮件渠道不保证无需访问原平台，也不作服务条款保证。

## 摘要、成本和覆盖

每次scan输出digest.json：新增岗位、重复观察、review、消失复核和来源问题；research将正文分拣、当前批次历史核对和选配本地评估补入摘要。digest的新增是本轮差量，不是虚构自然日统计；research生成有界卡片，Agent不用读取全部岗位台账或大摘要。

research默认在标题筛选之前分配一部分正文请求预算给review，避免合同/技能仅在JD里的岗位永远留在未匹配队列；余下预算用于当前候选批次。分拣不评估人物资格。source-health.json记录请求失败、连续失败、最近成功/观察和零结果异常；连续失败熔断保留任务与重试时间，scan --retry-agent 可重探，仍遵守访问规则。数量异常会出现在摘要，不能把它当作已下架证明。

已显式配置本地Ollama后可用 research --run --evaluate-local，先检查服务与模型；不可用则记录延后，不自动改用云端。模型结果仍是需审查草稿，不自动批准KO或申请，也不删除低分线索。常规 research --run 仍没有模型调用。

每日调度可将上述共享 research --run 命令交给用户已有的任务计划程序；resume只用于续跑当前周期，不能每天resume已完成周期。安装本次修复不创建系统计划任务，因为运行时刻、邮箱账户与搜索服务尚未配置。HelloWork/Indeed/LinkedIn 的分页只根据实际页面证据配置，不能用猜测的页码规则把拦截或未知第一页标为完成。

公司/标题/地点相似只作疑似重复，真实同岗依赖原始链接、岗位ID或已观察申请跳转证据；已证明同岗优先雇主原链接。摘要和本地模型不能替代完整14项KO、表单核验与提交成功凭证。

自动回归 tests/discovery-autonomous.test.mjs 使用真实启动的HTTP招聘站、Chromium和TLS IMAP服务器。覆盖超过10条结果、预算续跑、503恢复、XML/订阅、内嵌JSON、接口学习、正文独有匹配、只读邮件和闭环增量。CI安装Chromium后运行，不依赖真实账户和真实平台。
