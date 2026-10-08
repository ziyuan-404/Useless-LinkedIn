# 岗位发现修复与可复现验证

实现依据运行代码及本地模拟招聘站，不依赖 README 宣称；具体操作和配置见 [发现岗位](../workflows/discover-jobs.md)。

## 审查结果与修复

| 问题 | 处理与边界 |
|---|---|
| A 临时失败永久 needs-agent / 错误被吞 | HTTP 状态、网络原因和 Retry-After 向上传递；临时故障持久退避自动重试，访问挑战单独 blocked；旧明确临时失败可迁移 |
| B 跨域广告当岗位 | 普通列表默认同域，allowed_hosts 可显式扩大；外部 ATS 先注册真实招聘入口；直接观察导入仍支持任意平台 |
| C CTA 覆盖岗位标题 | 同规范化 URL 选有岗位内容的标题、合并非空元数据，CTA-only 不造岗位；未评估旧 CTA 标题可在重发现时修复 |
| D 分类页误收 | 排除常见分类路由；未知路径需岗位 ID、岗位 slug、配置 pattern 或明确卡片/JSON-LD 证据；无法单凭所有 URL 判断一切网站 |
| E 语言/域名别名去重及雇主链接 | 规范化 WTTJ/LinkedIn/Greenhouse 和语言参数；旧 ID 保留；跨来源只按核验共同身份合并，优先已核实雇主 URL，保护历史申请 |
| F observations 与每页全量读写 | 观察汇总首次/最近/次数，旧格式一次迁移；SQLite 逐页事务日志，leads.json 仅批量兼容快照；不是把所有旧流程强行迁到第二套申请数据库 |
| G 每日全量 / 消失信号 | 保存页面摘要，明确 newest-first 才启用增量停止，定期全量；完整快照缺失只标 possiblyClosed，不自动 expired；未知排序继续全量 |
| H 默认任务成本 | 相同地点去重、默认 France 单层地点、独立配置覆盖岗位族的 OR 网页查询、API 优先及可选按需后备；完整显式 query 和矩阵仍执行，无硬截断 |
| I review 成本 | 完整 JD 轻量分拣可自动提升 candidate；无关/不完整/受阻线索不进入候选人分析；批量队列/决定与 list.md 可见，保留所有岗位 |
| J HTML 未完成 | 已观察 next 链上的静态末页可记录结束，可配置要求更严；动态/第一页/空页/重复页仍需核验 |
| K ATS/嵌入正文 | 检测 Greenhouse、Lever、Ashby、SmartRecruiters、Workable、Workday 的入口与 iframe/script src；GH embed token 修复；Ashby 公开 API，后三者走通用渲染/Agent，不宣称已验证其私有接口；GH content=true 可配置且默认轻量列表明确不是 JD |
| L 可复现测试 | tests/discovery*.test.mjs 和专用 CI 使用本地 HTTP 假站及真实 Chromium 动态页，不请求真实招聘网站；公开测试代码，排除任何运行日志、个人数据、临时工作区 |

词匹配改为 Unicode 词边界、合同同义词与 keyword_aliases，BI 不再命中 mobilite，intern 不再命中 internal/internationale。全局强制 IAB 的项目规定已移除，按站点选择 HTTP、隔离 Playwright 或适用交互浏览器；robots、host pacing、Retry-After 和真实观察证据仍保留。事务、岗位和 scan 锁均支持死亡 PID/过期旧锁恢复，存活操作不抢锁。失效措辞补充德语、西班牙语、意大利语、葡萄牙语及中文；它们仍只作为详情内容证据，不把列表消失等同失效。

## 运行验证

在开发工作区执行：

```text
npm run test:discovery
npm test
npm run check
```

Node >=24、Python/PyYAML、Playwright Chromium 由安装器准备。测试将 USELESS_LINKEDIN_WORKSPACE 指向隔离临时目录，只对本机 HTTP 假站发请求；USELESS_LINKEDIN_TEST_LOCAL 仅限测试环境。可用 USELESS_LINKEDIN_TEST_TMP 指定临时产物位置，用 USELESS_LINKEDIN_TEST_SKILL 校验另一份 Skill 实现；发布前在开发目录运行、通过后再同步。CI 单独执行搜索模拟测试，完整开发回归保留在源工作区。

模拟覆盖临时 503→恢复、持久 429 Retry-After、连接拒绝、403→浏览器采集、恶意跨域锚点、CTA 重复锚点、分类路由、4 类 URL 别名、合同同义词、30 天观察汇总、3000 岗位/60000 旧观察迁移、死亡/存活锁、HTML 末页与动态空壳、iframe/script ATS、API 描述选项、API 优先、低预算续跑、review 不触发昂贵流程、增量与全量缺失信号、SQLite 中断恢复、真实 Chromium 执行 JavaScript 本地列表，以及原来的完整矩阵、105 结果、WTTJ 多页/窗口、API 凭证跨域保护。

模拟只能证明这些确定路径的行为；不能证明 Indeed、LinkedIn、WTTJ、每个 ATS 的真实反爬或页面结构永远可用，也不能保证全网搜索无遗漏。服务端限制、robots 排除、登录/验证码、未知分页、慢于渲染等待的异步加载和复杂 load-more 都必须保留未完成证据，由适用浏览器继续核验。SQLite 日志避免逐页全量写，但兼容 JSON 快照和历史 scans 仍随真实岗位数量增长；不是常数大小存储。

API 依据：[Greenhouse Job Board](https://docs.greenhouse.io/job-board.html)、[Lever Postings](https://github.com/lever/postings-api)、[Ashby Job Postings](https://developers.ashbyhq.com/docs/public-job-posting-api)。

## 第二轮审查修复

新增 triage CLI、pipeline 自动单岗位初筛、完整 JD 缓存复用、人工批量原文决定、规则变化重开、消失复核及已投递保护。默认词库补软件/工程及法语阴性岗位词，contractHits 返回真正命中词；排除岗位等级默认仅看标题，避免 JD 中“senior mentor”误排 junior 岗位，可设 exclude_scope=full-jd 恢复全文排除。默认逐页 HTTP 条件请求保留完整覆盖；无验证器/POST 不假定能跳过页面。不同 query 共享来源/URL/读取层字段，通过 contexts 可还原；不删除查询证据。复用 impit 和 robots-parser，保留既有持久队列和隔离 Playwright。所有模拟测试运行在开发工作区，发布副本仅同步通用模拟代码。

## 第三轮审查修复

去掉四个平台默认 impit，只保留显式选择。默认新增 JavaScript/TypeScript/React/Node.js；自动排除不按周无故重抓，规则或发现内容变化才重开，人工决定保持稳定，消失复核仍可触发。France Travail 接官方 OAuth、当前 3150 条检索窗口、时间分段续搜及经证明排序的默认增量；La Bonne Alternance 接完整每日导出并复用 stream-json 流式处理，提供有明确覆盖警告的结构化搜索模式。凭据缺失后补齐可自动继续，跨域鉴权重定向被拒绝，signed URL 不持久化。公司/岗位/地点重复候选加索引，避免完整导出中为每条记录扫描全库。接口约束与未验证范围见 [官方接口说明](official-job-apis.md)。
