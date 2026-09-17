# Privacy / 隐私边界

This public repository contains generic code, instructions, configuration, blank layouts/workbooks and licensed upstream resources. It is created as a fresh Git repository; no original local Git history is included.

Excluded: candidate profiles and source snapshots, original resumes/photos, contact details, education/visa/identity facts, messages, application history, real dashboards, answer banks, credentials, cookies, sessions, local audit/test outputs and machine-specific caches. The retained portrait is a neutral placeholder. Public upstream copyright and attribution are intentionally preserved.

本仓库是独立脱敏副本，原始私人工作区未修改。公开内容仅为通用代码、空白模板和许可资源，不包含求职者个人资料、申请记录或旧Git历史。公开Skill不继承原用户会话中的授权。

`.gitignore` helps protect local files but is not a security boundary. Review `git diff --cached`, tracked files, binary document metadata and history before publishing your own changes. Ignoring a file does not remove it if it was already tracked. Never commit secrets; rotate any credential accidentally disclosed and assess history cleanup separately.

Running a local tool may use third-party services: public job URLs and search terms are sent to job boards; an Agent may send selected local content to its model provider; upload or submission discloses data to the destination. This repository does not guarantee offline execution or a model provider’s retention policy. Check your runtime and services before using personal data.

运行时抓取会向网站发送URL与搜索词；Agent可能将选择的材料交给模型服务。上传与申请会向目标平台披露资料。请检查实际运行环境；“文件保存在本地”不等于“没有任何外部数据传输”。
