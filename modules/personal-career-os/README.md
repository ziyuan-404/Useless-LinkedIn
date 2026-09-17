# Personal Career OS

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Pluto-Mo/personal-career-os?style=social)](https://github.com/Pluto-Mo/personal-career-os)

**一套跑在 AI Agent（Claude Code / Codex / Cursor / workbuddy / zcode 等）里的个人求职操作系统。**

核心思路一句话：**经历只沉淀一次，之后每个 JD 自动调用**——你不再维护 N 版简历，而是维护一个关于你自己的结构化记忆库，每次投递由 agent 现场定制出一页简历 + 投递邮件 + 全部配套材料，复制粘贴即可发送。

![经历只沉淀一次，之后按不同 JD 随时调用](assets/career-os-illustrations/01-experience-library.png)

> A job-application OS that runs inside coding agents: build a structured memory of your experiences once, then have the agent tailor a one-page resume, cover email, and full application kit for every JD. Chinese-first.

现在它以一个纯 Agent Skill 的形式交付：从零建档或导入现有简历，研究职位与 JD，并生成 Word、PDF、图片和投递正文。


## 一句话开始

在一个新 Agent 里直接说：

> 安装并启动 `Pluto-Mo/personal-career-os`。

Agent 应识别这是一个根目录即 Skill 的仓库，完成整包获取、读取 `MODULE.md` 并只展示功能指南。此时它不初始化个人空间、不读取材料、不提问，也不自动开始工作。用户不需要先 clone、不需要知道 Skill 路径或名称、不需要记命令，也不需要配置运行时。

## 安装后的第一次

安装后，Skill 只显示一次功能指南，等待用户明确说“开始”：

> Personal Career OS 已安装。下面只是功能介绍；我不会自动开始，也不会向你提问。
>
> 1. 建立经历库——从零梳理经历，或导入已有简历
> 2. 深挖补充经历——把某一段经历补成可复用的素材
> 3. 直接粘贴 JD——分析岗位要求、匹配点、缺口和命名规则
> 4. 确认投递后再导出——选择 Word/PDF/图片，决定是否附邮件正文和平台短消息；材料自动遵循 JD 的命名要求
>
> 准备好后，请说“开始”，再告诉我你想从哪一项开始。

例如：“开始，从零建档”“开始，导入简历”或“开始，研究这个 JD”。只有这时，Skill 才初始化个人空间并开始处理材料。

已经安装后，可以直接调用：

> `$personal-career-os` 开始，研究一下这个岗位：〔JD〕

也可以直接说自然语言：

- “我没有简历，帮我从零开始。”
- “把这份 PDF 简历导入建档，以后投递都从这里取事实。”
- “按这个 JD 生成完整投递包：〔JD〕。”
- “深挖一下 XX 那段经历。”
- “把标准简历导出成 Word、PDF 和图片。”
- “看看我最近的投递进度。”

“研究、看看、分析匹配度”默认只读；只有明确要求“投、生成、定制”时才创建材料。

## 手动安装（仅作兜底）

优先让 Agent 自己安装。对于支持本地 Agent Skills 的 Codex，也可以把仓库直接放进用户 Skills 目录：

```bash
git clone https://github.com/Pluto-Mo/personal-career-os.git "$HOME/.agents/skills/personal-career-os"
```

如果使用内置 Skill Installer，可让它安装：

```text
repo: Pluto-Mo/personal-career-os
path: .
name: personal-career-os
```

仓库根目录本身就是 Skill 根目录，不需要寻找子项目，也不需要插件清单。

## 获取后发生什么

首次运行时，Skill 自动在当前工作目录创建 `.career-os/`：

```text
.career-os/
├── profile/                 # 个人事实库
│   ├── _index.md
│   ├── basics.md
│   ├── preferences.md
│   ├── links.md
│   └── experiences/
├── template/
│   ├── resume.html         # 标准版内容与 HTML 排版源
│   ├── resume.docx         # 建档后生成的可编辑 Word 版
│   ├── resume.pdf          # 正式附件
│   └── resume.png          # 手机端图片
├── applications/_log.md    # 投递台账
└── archive/                 # 用户提供的原始材料
```

这里才存真实个人数据。Skill 安装目录始终保持只读模板状态，升级 Skill 不会覆盖用户资料。`.career-os/.gitignore` 默认阻止个人信息进入当前 Git 仓库。

## 功能

- 研究 JD：硬性门槛、关键词、岗位语言、匹配证据与真实缺口。
- 建立经历库：支持从零访谈，也支持导入 PDF、DOCX、MD、TXT 简历。
- 定制投递：每个 JD 建一个独立投递包目录，生成 HTML/DOCX/PDF/PNG、投递正文、JD 分析和备注。
- 深挖经历：只追问事实，把确认后的信息沉淀为可复用表述。
- 随时导出：标准版或任一岗位版都能按需导出 Word、PDF 或图片。
- 保真：不编数字、不升级头衔，不把模板示例当成用户经历。

Skill 只准备本地材料，不会代替用户发送邮件、提交申请或推送个人数据。

![把真实经历翻译为岗位语言、数据证据和 JD 对齐材料](assets/career-os-illustrations/02-industry-translation.png)

## Skill 结构

```text
personal-career-os/
├── MODULE.md                    # 唯一运行入口与自然语言路由
├── agents/openai.yaml          # 可选 UI/调用元数据，不是运行时
├── references/
│   ├── workflows/              # apply / intake / dig / export
│   └── methodology/            # 简历、岗位、企业风格、问题库
├── assets/workspace/           # 首次运行复制的空白个人空间
├── scripts/                    # DOCX 导出、PDF/PNG 渲染与隐私检查
└── README.md
```

## 产物与运行环境

完整投递包默认包含：

```text
resume.html
同名简历.docx
同名简历.pdf
同名简历.png
email.md
jd.md
notes.md
```

生成 PDF/PNG 时需要本机可用的 Chrome、Chromium 或 Edge；生成和校验 DOCX 时由 Agent 使用自己的文档运行时。Codex 自带所需文档依赖，最终用户不需要手动安装 Python 包。缺少某种渲染能力时，Agent 必须明确标记未验证的格式，不能拿损坏的转换文件冒充成品。

![JD 驱动生成 PDF、Word、图片和投递正文，并按要求命名](assets/career-os-illustrations/03-one-stop-delivery.png)

## 隐私

- 不要把 `.career-os/` 推到公开仓库。
- 发送、上传、发布、删除资料或 git push 前，Agent 必须先获得明确授权。
- 分享日志、截图或 Issue 前，先运行 Skill 自带的隐私检查。

## 贡献与许可

方法论与工作流改进见 [CONTRIBUTING.md](CONTRIBUTING.md)，示例见 [docs/EXAMPLES.md](docs/EXAMPLES.md)。本项目采用 [MIT License](LICENSE)。
