# 发现岗位

1. 先运行 `node SKILL_ROOT/runtime/tools/useless-linkedin.mjs tracker --history`，用 `scan --plan` 检查实际查询/来源/地点任务，再运行 `scan`。搜索偏好只改工作区 `个人资料/portals.yml`；新发现的来源保存在 `个人资料/applications/automation/discovered-sources.json`，不写进代码或第二套候选人档案。
2. 查询取全部 `queries` 加 `query_matrix.roles × contracts`，按 `locations` 展开。每个配置的 API、列表、站内网页搜索都独立执行；还必须执行无域名限制的 Open Web 和 Company Careers 任务，发现新招聘网站、企业官网和 ATS。不能因一个平台/API 有结果就跳过其他渠道。岗位范围与用户愿意接受的合同/通勤范围分开，后者读完整 JD 后核验。
3. `scan` 执行公开 API/HTTP 读取并逐页收集；普通 HTML 识别实际 next 链接，可配置分页模板。WTTJ 按分页元数据遍历；Greenhouse/Lever 使用公开岗位接口。未知网站无需代码白名单：可配置列表或通用 JSON API，或使用 IAB/网页搜索后导入。API 自身检索窗口、重复页面、动态加载、403、限流、未知分页和空壳页面保持未完成状态，不当作零结果。
4. `scan` 结束后读取 `search-queue.json` 和 `scan-agent-task.md`，Agent 继续处理每一条未完成任务。网站页面一律用 IAB；网页搜索使用 Agent 的搜索工具。企业发现搜索除了详情页，还要收集已观察到的官网招聘入口并注册为来源，然后继续该来源的列表/搜索。不要把未执行的队列称为已完成搜索。
5. IAB 列表采集至少保存 `kind: listing`、请求 `url`、实际 `pageUrl`、`capturedAt`、`bodyText` 和 `links[{url,title,company,location,isJob}]`。`isJob: true` 只用于确实看到岗位卡片/详情链接的情况，不能给导航、培训广告或公司名录添加。分页保存 `nextUrls`；只有观察到列表结束、无更多页/无更多加载，才设置 `paginationComplete: true` 并填写 `completionEvidence`。运行 `scan --listing-capture FILE` 离线导入，不会重跑其他网络任务。
6. 新站点的详情链接直接用 `scan --import FILE --import-only` 收集，文件为 `[{url,title,company,portal,location,sourceUrl,capturedAt}]`。未知 portal 不会被丢弃；无需先登记平台。搜索摘要只证明发现了链接，不证明 JD 完整、岗位有效或已经申请。
7. 网页搜索或人工核验任务用 `scan --task-results FILE --import-only` 更新，格式 `[{id,status,capturedAt,evidence,cursor}]`。状态可取 completed/partial/blocked；completed 仅表示本任务在该时间的观察已完成，不能据此宣称全网无遗漏。部分完成或受阻时保留证据和下一页 cursor，不得伪造完成。
8. 请求/每任务页数预算配置在 `discovery.max_requests_per_run` 和 `max_pages_per_task`；`0` 为无限。预算只暂停执行，已采集整页全部保留，未执行任务及分页位置持久化。`scan --resume` 接着跑；`scan --max-requests 0 --max-pages 0` 可取消预算。没有 query 前三条或每平台结果上限；旧 `max_results_per_portal` 不再截断结果。队列按轮遍历，避免大来源占满预算。
9. 发现阶段保留已观察到的全部岗位及来源、query、地点、页面、时间；标题关键词只记录 `discoverySignals` 和 candidate/review 提示，不删除可能在 JD 才写合同/技能的岗位。排除预测招聘企业与非岗位链接。URL 精确去重时合并观察证据；疑似同岗保持独立，交后续核验，不覆盖已评估/已投递状态。
10. 新线索进入 `process-job.md` 做详情有效性、历史去重、硬条件和材料策略。扫描本身不代表投递，也不在 Dashboard 中虚构申请行。

## 注册任意企业招聘页和 API

Agent 把已核实的来源写成 JSON 数组，用 `scan --sources FILE` 注册；不要每家公司新增脚本。也可把来源加入工作区 `portals.yml`。以下均为格式示例，域名/board token/site 必须替换为观察到的真实值。

```json
[
  {"name":"Employer Careers","career_url":"https://employer.example/careers","enabled":true},
  {"name":"Employer Greenhouse","provider":"greenhouse","board_token":"observed-token","company":"Employer","career_url":"https://job-boards.greenhouse.io/observed-token"},
  {"name":"Employer Lever","provider":"lever","site":"observed-site","region":"eu","company":"Employer","career_url":"https://jobs.eu.lever.co/observed-site"},
  {"name":"Other JSON API","api_url":"https://employer.example/api/jobs?q={query}&location={location}","api":{"rows_path":"data.items","fields":{"url":"links.detail","title":"name","location":"office.city"},"pagination":{"mode":"offset","param":"offset","size_param":"limit","total_path":"data.total"},"page_size":100}}
]
```

通用 API 可用 `pagination.next_path` 指向下一页 URL，或 page/offset + param + total_path；确实返回完整列表才设 `api.exhaustive: true`。无法核实分页时保存部分结果并交 IAB。静态 HTML 也只有确认无动态加载/分页才可设 `exhaustive_listing: true`；默认不会凭第一页推断全部抓完。公开接口参考：[Greenhouse](https://docs.greenhouse.io/job-board.html)、[Lever](https://github.com/lever/postings-api)。其他 ATS（如 Workday、Taleo、SuccessFactors）通过通用配置和 IAB 任务适配，不能宣称已专门验证所有网站。
