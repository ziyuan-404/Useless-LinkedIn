# 架构约定

## 一个 Skill、六个内部模块

根目录 `SKILL.md` 是唯一入口。内部模块使用 `MODULE.md`，防止 Codex 将其识别成额外 Skill。

| 模块 | 职责 | 权威数据 |
|---|---|---|
| Personal Career OS | 经历导入、访谈补全、唯一事实库 | `.career-os/profile/` |
| Resume Builder | claim-map、写作、模板、渲染和视觉 QA | 岗位目录下的内容与 QA 文件 |
| ApplyPilot | 筛选规则、简历路由、申请执行和卡点 | `.career-os/operations/` + Excel |
| Job Intelligence | 有效性、去重、Knock-out、A–H、公司/联系人研究 | 岗位研究快照 |
| Application Writing | 动机信、申请邮件和联系人消息 | 经确认事实 + 已核实研究 |
| Pipeline Analytics | Excel 台账、跟进、漏斗、复盘 | `求职Dashboard.xlsx` |

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

## 运营数据

Excel 是岗位和投递状态的唯一运营台账。模块自带的 `_log.md` 或 CSV 只作为上游示例，不是总控权威记录。公开仓库只保存空模板和规则，不保存真实台账、简历或档案。
