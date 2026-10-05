# Privacy / 隐私边界

Independent evaluate --run sends the complete JD and necessary sourced candidate facts to the explicitly configured model endpoint. Contact details are omitted where recognized; this is not an anonymization guarantee. Local Ollama defaults to loopback and never falls back to a cloud service automatically. Cloud credentials are read from environment variables and are not written to reports. Evaluation files and caches belong in the private workspace.

独立评估仅在显式 evaluate --run 时向配置的模型端点发送完整 JD 与必要人物事实；可识别联系方式被省略，但不保证完全匿名。本地 Ollama 默认回环地址，不自动切换云端。密钥仅从环境变量读取，报告不保存密钥；评估与缓存属于私人工作区。

This public repository contains generic code, instructions, configuration, blank layouts/workbooks and licensed upstream resources. It is created as a fresh Git repository; no original local Git history is included.

The README interface GIFs in `docs/media/` are recorded in an isolated demo workspace using fictional companies, application records and document content. They contain no real candidate profile or application history. Raw recordings and test workspaces are excluded from publication.

README 中 `docs/media/` 的界面 GIF 来自独立测试工作区，使用虚构公司、申请记录和材料，不包含真实候选人档案或投递历史。原始录制文件和测试工作区不公开。

Excluded: candidate profiles and source snapshots, original resumes/photos, contact details, education/visa/identity facts, messages, application history, real dashboards, answer banks, credentials, cookies, sessions, local audit/test outputs and machine-specific caches. The retained portrait is a neutral placeholder. Public upstream copyright and attribution are intentionally preserved.

本仓库是独立脱敏副本，原始私人工作区未修改。公开内容仅为通用代码、空白模板和许可资源，不包含求职者个人资料、申请记录或旧Git历史。公开Skill不继承原用户会话中的授权。

`.gitignore` helps protect local files but is not a security boundary. Review `git diff --cached`, tracked files, binary document metadata and history before publishing your own changes. Ignoring a file does not remove it if it was already tracked. Never commit secrets; rotate any credential accidentally disclosed and assess history cleanup separately.

Running a local tool may use third-party services: public job URLs and search terms are sent to job boards; an Agent may send selected local content to its model provider; upload or submission discloses data to the destination. This repository does not guarantee offline execution or a model provider’s retention policy. Check your runtime and services before using personal data.

运行时抓取会向网站发送URL与搜索词；Agent可能将选择的材料交给模型服务。上传与申请会向目标平台披露资料。请检查实际运行环境；“文件保存在本地”不等于“没有任何外部数据传输”。

The published job-discovery regression tests use synthetic fixtures and a loopback-only fake recruitment server. Test code and CI configuration are public; generated workspaces, logs, database files, browser profiles and personal data are excluded.

公开岗位发现回归测试使用合成数据和仅监听本机的模拟招聘站。仅公开测试代码及 CI 配置；运行工作区、日志、数据库、浏览器资料及个人数据不公开。
