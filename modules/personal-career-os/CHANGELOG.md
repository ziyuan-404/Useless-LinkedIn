# Changelog

本项目的所有重要变更都会记录在此文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增

- 根目录 `MODULE.md`：仓库本身可作为 `personal-career-os` Skill 安装和自然语言调用
- `agents/openai.yaml`：Skill 列表与默认调用提示元数据
- 首次调用自动从 `assets/workspace/` 初始化本地 `.career-os/` 工作区
- 首次安装后的简短入门指南：明确“从零建档 / 导入简历”两个入口，并提示 JD 研究、深挖、导出和台账等自然语言用法
- `references/workflows/export.md` 与 `scripts/export-docx.py`：从定稿 HTML 生成原生可编辑 DOCX，并与 PDF/PNG 共用同一份内容
- 完整投递包默认包含 HTML、DOCX、PDF、PNG、投递正文、JD 分析和备注
- 隐私检查现在会解压扫描 DOCX 正文、批注和核心元数据

- **零起点冷启动**：没有简历、没有任何材料也能开始使用——`references/workflows/intake.md` 新增「1b. 零起点建库」（访谈式六轮普查代替材料，可中断续跑），`MODULE.md` 新增对应自然语言入口
- **首次建库收尾步骤**：建完库用真实内容替换 `template/resume.html` 并渲染验证，产出第一份标准版简历
- `references/methodology/简历方法论.md` 新增「零实习简历」内容策略：区块按素材改名不留空、课程项目按实习规格写、一页是上限不是 KPI
- `references/methodology/挖掘问题库.md` B 节新增「降级问法」：用户答「没有」时换更具体的场景再问
- `references/workflows/apply.md` 新增空库分流：研究继续、投递先建档，禁止用模板示例内容投递

### 变更

- 工作流与方法论移入 `references/`，空白用户空间移入 `assets/workspace/`
- 移除 Claude 专用命令包装；`MODULE.md` 成为唯一运行入口
- “研究一下”默认只读，明确要求准备投递后才生成文件
- 空库不再阻断只读 JD 研究；只有准备投递时才要求先建档
- 零起点首次提问改为每轮 3-5 问，电话和邮箱推迟到生成简历时再补

## [1.0.0] - 2026-07-08

### 新增

**核心功能**
- 三大工作流：投递（apply）、沉淀（intake）、深挖（dig）
- 结构化经历库（`profile/`）：一次沉淀，所有投递自动调用
- 一页 A4 硬校验：渲染管线自动检测超页并报错
- 全套材料生成：PDF + PNG + 邮件正文 + 投递台账
- **自动按 JD 命名要求生成**：JD 分析自动提取文件命名格式（如「姓名-学校-专业」），生成时直接按要求命名，无需手动调整

**方法论体系**
- 简历改写方法论：排雷（信息卫生）→ 价值翻译 → 深挖六问
- 风格库：券商金融 / 大厂 / 国央企 / 外企四种企业性质的写法差异
- 岗位速查：常见岗位的专业术语和结构模板
- 挖掘问题库：面试官式深挖问题清单（按经历类型 + 六轮普查）

**Agent 通用性**
- AGENTS.md 规范：目录约定、交互路由、铁律、红线
- 跨平台渲染脚本：PowerShell (Windows) + Bash (macOS/Linux)，零外部依赖
- 意图路由：用户直接说话，agent 自动识别并执行对应工作流

**开发者工具**
- 脱敏检查脚本：自动扫描手机号、邮箱、身份证等敏感信息
- Claude Code 快捷命令：`/apply` `/intake` `/dig`（可选，其他 agent 可跳过）

### 文档

- README.md：项目介绍、使用方式、工作原理、隐私提醒
- AGENTS.md：Agent 工作规范（开放标准）
- CONTRIBUTING.md：贡献指南（Bug 报告、功能建议、PR 规范）
- workflows/*.md：三大工作流的详细执行手册
- methodology/*.md：四份方法论文档（简历方法论、风格库、岗位速查、挖掘问题库）

### 模板

- `profile/`：基础信息、经历库、链接库模板（含占位符 【待填】）
- `template/resume.html`：A4 一页简历模板（含超页自检红色警告条）
- `applications/_log.md`：投递台账模板

---

## 版本说明

- **Major (1.x.x)**：不兼容的 API 或规范变更（如 AGENTS.md 结构大改）
- **Minor (x.1.x)**：新增功能（如新增工作流、新增方法论章节）
- **Patch (x.x.1)**：Bug 修复、文档优化、脚本改进

---

[1.0.0]: https://github.com/Pluto-Mo/personal-career-os/releases/tag/v1.0.0
