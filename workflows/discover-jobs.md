# 发现岗位

1. 先运行 `node SKILL_ROOT/runtime/tools/useless-linkedin.mjs tracker --history`，再运行 `node SKILL_ROOT/runtime/tools/useless-linkedin.mjs scan`；搜索配置只改 `00-个人资料/portals.yml`。
2. API、HTTP、Playwright 都无法提供公开列表时，按 `scan-agent-task.md` 在当前 Agent 可用的浏览器读取实际列表，使用 `scan --listing-capture FILE --no-browser` 导入。仍受阻时用网页搜索找详情链接，打开完整 JD 后以 `scan --import FILE --import-only` 导入。
3. 搜索摘要只是线索。保留来源、时间和失败原因，不把不可访问解释为岗位关闭或零结果。
4. 新线索进入 `process-job.md`；扫描本身不代表投递，也不在 Dashboard 中虚构申请行。
