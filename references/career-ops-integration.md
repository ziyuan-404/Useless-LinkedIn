# career-ops 移植与零 Token 扫描

上游固定版本 `a156d4dfa18cbc3a10da6ebf2a3466ed57e681f8`。代码、完整 MIT 许可、逐文件来源散列与修改说明位于 `runtime/vendor/career-ops/`。未建立第二个人物库、申请台账或 Skill。

## 主力扫描

`node SKILL_ROOT/runtime/tools/useless-linkedin.mjs research --run --zero-token --concurrency 4 --max-requests 80 --triage-requests 80`

research 默认零 Token 扫描。本地脚本完成 API/HTTP/隔离 Playwright、分页、去重、全文、失效、关键词分拣与落盘，扫描本身不调用模型。启动命令和读取摘要仍消耗对话上下文。`zero-token-scan.json` 保存模型调用 0、实际请求和覆盖情况。

零 Token 模式可运行配置的 SearXNG、Brave、AnySearch 无模型搜索并逐条核验详情。未配置后端、供应商窗口、未知网页覆盖和访问阻断保留队列，不能伪称完成。`--resume` 恢复，0 请求预算表示无限。并发 1–16，API 类任务优先，同类任务受限并发，同主机共享 robots 查询并遵守间隔；旧串行调用仍保持轮转公平性。官网注册表、sitemap/订阅、公开接口学习、邮件提醒和摘要见 [自动发现](autonomous-discovery.md)。

## 102 个公开适配器

`providers --list` 写出清单，`providers --detect URL` 无网络识别网址。覆盖 Greenhouse、Lever、Ashby、Workday、SmartRecruiters、BambooHR、Personio、Teamtailor、WTTJ 等。适配器存在不意味着当前每个平台都可访问。

沿用 portals.yml 的 portals，配置 provider 与真实 career_url；专用选项放在 career_ops 对象，字段按对应上游模块定义。未指定 provider 的 career_url 自动探测。所有 helper 和 ctx HTTP 都经过宿主预算、robots、超时。成功响应持久化；预算中断后重放已抓取页面，新扫描周期重新请求。

已有 WTTJ、Greenhouse、Lever、Ashby 原生读取保留已验证分页；career_ops.enabled=true 可显式选上游实现。France Travail、La Bonne Alternance 官方接口保留。返回数组不代表全部分页抓完：覆盖未知保留待核实，仅经过验证或显式确认的完整来源作为完整快照。

## 全文与早期门禁

`fetch-jd --url URL` 仅输出路径与摘要。capture、triage、pipeline 共用 Greenhouse（含 gh_jid 嵌入）、Lever、Ashby、Workday、SmartRecruiters API 全文优先，不截断 JD；不确定时回退页面。Lever API 404 不视为关闭，canApply=false 等明确关闭信号阻止材料。

API 岗位存在与真实表单入口分开记录，不伪造 Apply 控件。材料前仍需观察入口与学校路线。operations/blacklist.json 使用精确 company、domain（含子域）或精确 url 与 reason；扫描和直接 pipeline 在候选人事实/模型前执行。默认空，不代替个人运营规则。

## 独立模型评估

`evaluate --doctor` 检查服务和配置，不显示密钥；`evaluate --plan --ids FILE` 预检；`evaluate --run --ids FILE --backend ollama --model INSTALLED_MODEL` 批量评估。也支持 Gemini、OpenAI、OpenRouter、OpenAI 兼容端点，配置在个人资料/operations/evaluation.json，模型名须明确设置，密钥仅环境变量读取。

默认每轮最多 10 次，每岗位一次请求，暂时失败保存下一重试时间。输入超预算不截断硬条件；完整 JD、来源事实、规则保留，联系方式和无关索引省略。缓存按输入/规则/模型/实现散列；资料变化先刷新 pipeline。指标用服务实际返回的 token 和延迟，缺失为 null。

必须全部 14 KO，PASS 时完整 A–G、要求证据矩阵与原文引用；关键条件不能靠推断，未知保留 UNKNOWN。整体评分低于 3.5 建议复核后跳过、3.5–4 普通复核、>=4 优先精投；不机械加权，信息不足无法评分。

评估标 evaluation.reviewRequired=true，不能直接进入正式 pipeline、材料或批准提交。Agent 复核原文和语义，记录结论后解除标记，再执行 pipeline --assessment FILE --defer-materials。模型仅返回 JSON，不执行工具和命令。

Ollama 需要可用服务与合适模型；云端免费与否取决于服务和账号，外部服务会收到 JD 和必要人物事实。未假设特定免费模型或费率。

## 材料与台账

复用现有 Playwright HTML/PDF、materials、Python QA、缓存及最终审阅，保留法文模板和定制要求。未另装 LaTeX 引擎、Go 看板。SQLite、终端 tracker、网页 Dashboard 与编辑器继续同一套记录，提交仍须真实凭证。
