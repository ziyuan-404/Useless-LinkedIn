# ApplyPilot

[English](README.md) · **中文**

把零散、焦虑、容易分心的求职投递，变成一个由 AI Agent 引导执行的工作流。

ApplyPilot 不是“全自动乱投神器”，而是一个求职投递操作系统：候选人档案、dashboard、岗位筛选规则、简历策略、投递执行、卡点复盘、后续跟进。

## 让 Agent 帮你安装

如果你想让 coding agent 帮你安装并启动 ApplyPilot，把这个 repo 发给它，然后说：

```text
Clone https://github.com/yvonnehe772/applypilot and use ApplyPilot to initialize my job search workflow.
```

## 它能帮你做什么

ApplyPilot 可以帮 AI Agent：

- 先理解你的求职背景，而不是直接乱投。
- 建立 dashboard，记录每个岗位到底发生了什么。
- 判断哪些岗位值得投，哪些应该跳过。
- 根据岗位类型选择合适简历。
- 在 LinkedIn、ATS、Simplify 等流程里处理常见卡点。
- 遇到人机验证、登录、敏感法律问题时停下来交给你。

## 安装

推荐用 `git clone` 安装，这样以后更新更方便：

```bash
git clone https://github.com/yvonnehe772/applypilot.git ~/.codex/skills/applypilot
```

如果你是手动下载 repo，也可以把 `applypilot` 文件夹复制到 Codex skills 目录：

```bash
mkdir -p ~/.codex/skills
cp -R applypilot ~/.codex/skills/applypilot
```

然后新开一个 Codex 对话，说：

```text
Use $applypilot to initialize my job search workflow.
```

或者中文说：

```text
使用 $applypilot，帮我初始化我的求职投递工作流。
```

## 更新

ApplyPilot 安装后不会自动更新。

如果你是用 `git clone` 安装的，之后可以这样手动更新：

```bash
cd ~/.codex/skills/applypilot
git pull
```

如果你是手动复制文件夹安装的，就需要重新下载最新版，并替换本地的 `~/.codex/skills/applypilot` 文件夹。

## 最小启动 Prompt

你可以直接复制下面任意一句：

```text
使用 $applypilot，帮我初始化我的求职投递工作流。
```

```text
使用 $applypilot。我想海投，帮我配置 Volume mode，包括稳定简历分流、投递规则和 dashboard。
```

```text
使用 $applypilot。我想精投，帮我评估岗位匹配度、生成简历修改草稿，并在投递高价值岗位前让我确认。
```

```text
使用 $applypilot。我不确定该用海投还是精投，请先默认用海投，并告诉我哪些岗位值得升级为精投。
```

## Quick Start：第一次安全试跑

第一次不要直接自动投递。建议先让 ApplyPilot 做 lead-finding-only：

```text
使用 $applypilot 初始化我的求职工作流，然后做一次只找岗不投递的试跑：找 3-5 个岗位，筛选分类，更新 dashboard，不打开真实投递流程，不提交申请。
```

ApplyPilot 分两步：

- 找岗阶段：判断岗位值不值得记录、跳过，还是需要问用户。
- 投递阶段：只有 profile、简历、work authorization、sponsorship、薪资、账号登录等信息足够安全后再进入。

状态简单理解：

- `Pending`：值得后续 review 或投递。
- `Needs user`：缺用户信息或需要用户动作，导致不能判断，比如 sponsorship、work authorization、薪资、登录、上传、敏感回答。
- `Skipped`：按规则明确不值得投。
- `Blocked`：流程或网站操作卡住，无法安全继续。

## 第一次使用不需要填完所有东西

ApplyPilot 的 setup 是 agent 引导式的，不是让你手动读完所有文档、填完所有模板。

第一次 onboarding 应该控制在 8-10 分钟左右。先收集安全启动需要的最少信息，answer bank、self-ID、follow-up、简历精修细节可以后面遇到再补。

第一次只需要先给最小必要信息：

- 你想投什么岗位。
- 你不想投什么岗位。
- 地点和 remote/hybrid/onsite 偏好。
- work authorization / sponsorship 规则。
- 你有哪些简历文件，以及文件格式。
- 你想海投还是精投；不确定就默认海投。
- 你想把 dashboard 保存成什么形式，比如 CSV、Google Sheet、Notion 或 Excel。

然后先跑一个小 trial，看看哪里会卡住，再慢慢补 answer bank、ATS 规则、follow-up 规则。

新用户第一次试跑建议只找岗不投递：找 3-5 个岗位、筛选、分类、更新 dashboard，不打开真实投递流程，也不提交申请。

## 核心模块

### Candidate Profile

候选人档案，也就是事实源。

包括姓名、邮箱、所在地、LinkedIn、目标岗位、sponsorship、薪资范围、入职时间、简历文件、哪些事实不能让 AI 猜。

### Dashboard

整个系统的记忆。

记录岗位池、投递记录、卡点、后续跟进、简历规则和自动化经验。不要只凭感觉觉得“AI 投了很多”，一定要看哪些是真的提交了，哪些只是打开过页面。

### Application Rules

岗位筛选规则。

重点不只是“要投什么”，更是“不要投什么”。比如过高职级、地点不合适、不支持 sponsorship、长表单低匹配度、重复岗位、已关闭岗位。

### Resume Strategy

简历策略。初始化时需要选一个：

- Volume mode：默认。准备几份稳定简历，优先短流程岗位，减少打断。
- Precision mode：精投。只针对高匹配或高价值岗位做定制。

如果不确定，先用 Volume。某个岗位特别匹配时，再把这个岗位升级为 Precision。

如果要精修简历，建议上传可编辑源文件，比如 DOCX、Markdown、Google Docs 导出或纯文本。PDF 适合投递和评估匹配度，但不适合直接精确修改。只有 PDF 时，可以先让 agent 从 PDF 生成一个可编辑版本。

### Answer Bank

常见问题回答库。

Candidate Profile 存事实，Answer Bank 存表单里的常用表达。比如 sponsorship 怎么答、薪资怎么说、location/relocation 怎么说、Why this company 用什么结构。

它不需要让你每句话都审批。可以由你直接提供，也可以由 agent 根据 profile 起草第一版，你确认一次后复用。遇到身份、sponsorship、薪资越界、背景调查、voluntary self-ID 这类高风险问题时再停下来问你。

## 精投模式说明

Precision mode 第一版建议当作半自动流程：

1. 先评估 JD 和简历匹配度。
2. 生成修改建议。
3. 基于可编辑源文件生成 tailored draft。
4. 用户确认后再投高价值岗位。

用户信任输出以后，可以逐步放宽确认规则。但不要一开始就让 agent 自动改简历、自动提交高价值岗位。

## 工具能力边界

不同 agent 环境能做的事情不一样：

| 工具能力 | ApplyPilot 可以做什么 |
|---|---|
| 没有浏览器工具 | 根据你提供的链接筛选岗位、写规则、做简历分流、生成 answer bank、更新 dashboard。 |
| 有浏览器自动化 | 搜索岗位、填普通表单、上传简历、关闭标签页、记录结果。 |
| 有视觉 / computer use | 处理自定义下拉框、按钮遮挡、上传是否成功、页面显示和 DOM 不一致的问题。 |
| 有邮箱工具 | 在你授权后读取部分邮箱验证码。 |
| 永远不自动处理 | CAPTCHA、Cloudflare、未知账号登录/2FA、付款、敏感法律问题、缺失材料。 |

默认先用快速浏览器自动化做批量流程；遇到下拉框、遮挡、上传失败等问题，再切到视觉或 computer use。

## 示例

看 [examples/fake-demo-example](examples/fake-demo-example) 可以看到一个完整 fake demo example，包括：

- candidate profile 长什么样
- application rules 怎么写
- resume routing 怎么写
- answer bank 怎么写
- dashboard 里 `Submitted` / `Blocked` / `Skipped` / `Needs user` / `Pending` 分别长什么样

这个示例不是让你照抄，而是让你知道最终文件大概长什么样。

## 安全边界

ApplyPilot 不应该：

- 猜你的身份、签证、sponsorship、薪资、当前工作状态。
- 绕过 CAPTCHA、Cloudflare 或人机验证。
- 自动登录未知账号或处理 2FA。
- 编造经历、学历、作品集、推荐人或证书。
- 把保存岗位、tracker、autofill 状态当成已提交。
- 在身份、sponsorship、薪资、voluntary self-ID、背景调查、法律问题不清楚时自动填写。
- 把私人简历、手机号、邮箱、地址、移民文件、投递记录、浏览器 session、cookie、邮箱验证码放进 public repo。

默认投递行为：

- 基础字段清楚就自动填，比如姓名、邮箱、电话、LinkedIn、地点、简历上传。
- work authorization、sponsorship、薪资这类高风险字段，只有 profile 或 answer bank 里有明确答案才填。
- onboarding 时会问 voluntary self-ID 策略；如果用户不选择，就明确告诉用户默认留空、decline 或选 “Prefer not to say”，不会猜身份信息。
- custom question 有 answer bank pattern 就先起草；没有就只针对这个问题问用户。
- final submit 永远停下来，给用户看 summary，等用户确认。

第一次真实投递测试，LinkedIn Easy Apply 通常最安全，因为流程短、确认更清楚。Greenhouse 更适合测试 ATS 能力，因为它更容易遇到 EEO、邮箱 security code、上传和下拉框问题。

Volume mode 会优先低摩擦表单，比如不创建新账号、不是 Workday/Oracle、没有视频或长 writing sample。这个只是优先级，不是永久跳过；Precision 的高价值岗位可以在用户确认后处理 Workday、Oracle 或长表单。

## 项目状态

这是一个从个人 Codex 求职工作流整理出来的第一个 public 版本。你可以根据自己的背景、目标岗位和投递习惯，把它改成更适合自己的版本。

也欢迎大家提 issue、反馈使用体验，或者一起补充更好的规则和模板。
