# 公司缓存和最小投递凭证

## 公司资料

先调用 company --plan --ids FILE 查看本批公司分组、缓存状态和下一步。官网身份由真实来源核实；不把 ATS、招聘聚合站当公司官网。同一公司名对应多个官网时返回身份未决，不自动合并。默认缓存30天，正文散列变化/过期需要重采集；更新失败不能宣称已完成研究。

company --id ID --collect --url URL 或 --urls FILE（官网 URL 数组，最多8个）用共享公开 HTTP、robots、限速和地址校验，保存正文文本、来源、日期与散列，不存 HTML 页面快照或截图。只对拟投公司采集，避免为整个发现台账逐条研究。

collected 仅表示官方资料已采集。读取返回的 research.json 和相关来源正文，Agent 一次完成语义研究。保存审核 JSON：

```json
{"sourceHash":"collect返回的sourceHash","facts":[{"text":"经核实的业务事实","sourceUrl":"实际官网来源URL","quote":"该来源正文中逐字存在的引用"}],"inferences":["明确标为推断的岗位贡献角度"]}
```

运行 company --id ID --review FILE，脚本复核文件散列和原文引用，记录 reviewedAt 并同步同公司已存在的 Dashboard 行。脚本校验来源不代表自动保证改写语义正确；Agent 必须检查事实与推断。研究文件不能作为个人经历来源；动机信只允许引用当前公司已研究且新鲜的来源文本，数字/经历仍以 profile 为准。

Dashboard 根据缓存显示尚未研究、已采集待研究、已完成、待更新、来源失效或采集失败；保存公司信息不等于研究完成。人工写过的公司信息仍受原同步规则保护。

## 邮件凭证

投递仍用 apply 共享执行器，所有结果调用 apply --record 统一记录状态与 metrics。执行器只返回短确认文字和表单校验结果，不保存投递截图、整页 HTML 或页面快照。

receipt --plan --ids FILE 本地生成本批邮件查询；邮件连接器负责查询/读取，脚本负责匹配和同步。不打开 Gmail UI，不把整个邮箱 DOM、正文/附件 Base64 打印给模型。单岗位入口为 receipt --id ID --plan。

将连接器返回存在 functions 工具存储中，receipt --id ID --email - --commit 可从 stdin 接收一行 JSON；通过 write_stdin 传递对象序列化内容，避免把邮件拼接进 shell 代码。也支持 --email FILE。stdin 使用普通管道，不使用会回显邮件的 tty。只给模型返回匹配结果、路径和计数。

脚本要求消息 ID、From/To/Date、正文、当前尝试之后的时间及匹配公司与岗位/原始 URL。验证链接邮件、草稿、其他岗位、旧邮件不能作为完成凭证；邮件路线的已发消息必须显式 --sent --recipient，且邮箱出现在实际雇主申请入口、附件名称符合审核清单。

保存原始确认文字、消息 ID、邮件头和审核附件名称，计算结构化文件散列，再走既有 state 与 Dashboard 同步。认证/跟踪链接不入库，可用消息 ID 重新读取原信。等待中的确认邮件保持 submission-unconfirmed；核对期间绝不重复提交。共享执行器观测到与当前 attempt 绑定的新增明确平台结果时，保存短文字、原岗位链接和平台域名的结构化凭证，无需截图，也不保存最终确认页的认证 URL。历史图片、HTML、EML 凭证保持兼容。

## 搜索交接

research --run 始终启用 zero-token 扫描器。--scope FILE 的 JSON 可指定本次 role_keywords、include_keywords、exclude_keywords 和 keyword_aliases；扫描来源配置沿用 portals.yml，scope 决定本次分拣/交接目标，不能自行证明资格合格。

manifest 只含本批卡片、文件路径与 executionPolicy；完整稳定队列留在 queueFile，模型不读全表。research --continue MANIFEST 继续该队列并处理剩余全文核实，不重新扫描来源；research --run --resume 延续发现检查点。角色未匹配的线索保存到 deferred-ids.json，需要补充核实用 research --screen-only --include-unmatched 分批处理。不得将其直接判失败或丢弃。
