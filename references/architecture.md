# 架构约定

## 一个 Skill、工作流与内部模块

根目录 `SKILL.md` 是唯一入口。`workflows/` 定义何时执行哪些步骤，内部 `MODULE.md` 定义判断规则；确定性动作由 `.career-os/tools/` 执行。

| 模块 | 职责 | 权威数据 |
|---|---|---|
| Personal Career OS | 经历导入、访谈补全、唯一事实库 | `.career-os/profile/` |
| Resume Builder | claim-map、写作、模板、渲染和视觉 QA | 岗位目录下的内容与 QA 文件 |
| ApplyPilot | 筛选规则、简历路由、申请执行和卡点 | `.career-os/operations/` + 授权账本 |
| Job Intelligence | 有效性、去重、Knock-out、A–H、公司/联系人研究 | 岗位研究快照 |
| Application Writing | 动机信、申请邮件和联系人消息 | 经确认事实 + 已核实研究 |
| Pipeline Analytics | Excel 展示、跟进、漏斗、复盘 | `求职Dashboard.xlsx` + 核验过的运营记录 |

内部模块不得各自建立候选人档案或独立投递台账。用户数据和生成物不得写回 `modules/`。

## 工作区结构

```text
WORKSPACE_ROOT/
├── .career-os/
│   ├── profile/                    # 唯一候选人事实库
│   ├── template/                   # 默认模板
│   ├── archive/                    # 用户原始材料
│   └── operations/
│       ├── application-rules.md
│       ├── authorizations.json      # 本地授权账本，不公开
│       ├── answer-bank.md
│       ├── resume-strategy.md
│       ├── follow-up-rules.md
│       └── automation-lessons.md
├── CV/YYYY-MM-DD-公司-岗位/
│   ├── cv.pdf
│   ├── motivation-letter.pdf
│   └── work/
│       ├── claim-map.md
│       ├── jd.md
│       ├── evaluation-ah.md
│       ├── company-research.md
│       └── notes.md
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

`.career-os/applications/automation/leads.json` 是自动发现线索及其工作阶段的机器状态；`tracker.sqlite`、`list.md` 是派生索引。授权位于本地 `authorizations.json`。历史真实申请目前仍以 Excel 行和对应成功凭证核对，尚未逐行迁入统一 DB；`求职Dashboard.xlsx` 继续是这些申请的人用台账。新状态机不能凭空把历史行升级为已提交，Excel 同步标志也不能代替成功凭证。待完成历史数据迁移和双向核验后，才能将 Excel 全面改成只读投影。公开仓库只保存空模板和规则，不保存真实台账、简历或档案。

迁移顺序：只读导入 Excel 每行并保留原表与行号；按稳定 ID、URL、招聘编号和成功凭证逐条对账；冲突保留人工复核队列；从核验后的记录生成新 Excel 副本并比较总览公式、日期页和样式；核验一致后才切换写入路径。不得直接从空 JSON 重建现有真实看板。
