# 架构约定

## 一个 Skill、工作流与内部模块

根目录 `SKILL.md` 是唯一入口。`workflows/` 定义何时执行哪些步骤，内部 `MODULE.md` 定义判断规则；确定性动作由 `SKILL_ROOT/runtime/tools/` 执行。`useless-linkedin init --workspace PATH` 从 `workspace-template/` 建立独立工作区；工具和 schema 从 Skill 目录读取，个人数据从工作区读取。

`schemas/assessment.schema.json` 是流水线交给 Agent 的评估格式；`lead.schema.json` 描述现有机器线索；`state.schema.json` 从状态机的 `leadStates` 同步并在 CI 校验。`application.schema.json` 是未来迁移历史申请的目标格式，目前不代表已完成迁移。候选人事实仍为 `.useless-linkedin/profile/` 的可追溯文档，不另建 JSON 人物库。

| 模块 | 职责 | 权威数据 |
|---|---|---|
| Personal Career OS | 经历导入、访谈补全、唯一事实库 | `.useless-linkedin/profile/` |
| Resume Builder | claim-map、写作、模板、渲染和视觉 QA | 岗位目录下的内容与 QA 文件 |
| ApplyPilot | 筛选规则、简历路由、申请执行和卡点 | `.useless-linkedin/operations/` + 授权账本 |
| Job Intelligence | 有效性、去重、Knock-out、A–G 分析、H 申请回答、公司/联系人研究 | 岗位研究快照 |
| Application Writing | 动机信、申请邮件和联系人消息 | 经确认事实 + 已核实研究 |
| Pipeline Analytics | Excel 展示、跟进、漏斗、复盘 | `求职Dashboard.xlsx` + 核验过的运营记录 |

内部模块不得各自建立候选人档案或独立投递台账。用户数据和生成物不得写回 `modules/`。

## 工作区结构

```text
WORKSPACE_ROOT/
├── .useless-linkedin/
│   ├── profile/                    # 唯一候选人事实库
│   ├── template/                   # 默认模板
│   ├── archive/                    # 用户原始材料
│   ├── workspace.json             # 工作区格式版本
│   ├── applications/automation/   # 机器线索与岗位级评估
│   ├── audits/                    # 简历池审核记录
│   └── operations/
│       ├── application-rules.md
│       ├── authorizations.json      # 本地授权账本，不公开
│       ├── answer-bank.md
│       ├── resume-strategy.md
│       ├── follow-up-rules.md
│       └── automation-lessons.md
├── CV/YYYY-MM-DD-jobId-contextHash/
│   ├── 姓名-CV-公司-岗位.pdf
│   ├── 姓名-Lettre-公司-岗位.pdf
│   ├── resume.html
│   ├── motivation-letter.html
│   ├── portrait.png
│   └── work/
│       ├── claim-map.json
│       ├── resume.png
│       ├── motivation-letter.png
│       ├── *-pdf.png
│       └── qa.json
├── 海投简历/                       # 稳定 PDF 变体，只读选择
└── 求职Dashboard.xlsx
```

## 事实同步

用户确认的新事实先进入经历库，再将岗位 claim-map 对应项标为：

- `✅ 已确认`：可以写入材料；
- `❓ 待确认`：暂不写入；
- `⛔ 缺失阻塞`：关键事实不清，生成前必须解决；
- `➖ 已省略`：用户确认不写，不再追问。

claim-map 不是第二套事实库，只保存“表述—来源—状态”的索引。

## 运营数据与迁移边界

机器状态：`.useless-linkedin/applications/automation/leads.json` 保存自动发现线索及其流程阶段；`tracker.sqlite`、`list.md` 是派生索引。历史台账：尚未迁移的真实申请以 Excel 行及对应提交成功凭证核对。人用视图：`求职Dashboard.xlsx` 是当前运营界面，仍承载上述历史行；`dashboardSynced` 只表示同步状态，不是投递证据。授权位于本地 `authorizations.json`。待完成历史数据迁移和双向核验后，才能将 Excel 全面改成只读投影。公开仓库只保存空模板和规则，不保存真实台账、简历或档案。

迁移顺序：只读导入 Excel 每行并保留原表与行号；按稳定 ID、URL、招聘编号和成功凭证逐条对账；冲突保留人工复核队列；从核验后的记录生成新 Excel 副本并比较总览公式、日期页和样式；核验一致后才切换写入路径。不得直接从空 JSON 重建现有真实看板。
