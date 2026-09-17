# Personal Career OS — 维护说明

本仓库只包含一个纯 Agent Skill。运行入口和行为真源是根目录 `MODULE.md`。

当任务是使用本项目而不是维护项目时，立即读取根目录 `MODULE.md` 并继续用户原任务；不要停在安装说明、架构介绍或要求用户重新描述需求。

## 架构边界

- 不要加入 harness、自主 Agent、CLI 路由器、MCP、服务、数据库、后台进程或包管理器。
- `MODULE.md` 只保留入口、路由、硬约束和资源导航。
- 详细流程放在 `references/workflows/`，方法论放在 `references/methodology/`。
- 空白用户空间放在 `assets/workspace/`；这里必须始终保持占位符状态，禁止写入真实个人信息。
- `scripts/` 只放 DOCX 导出、PDF/PNG 渲染和隐私检查等确定性、可选的辅助脚本。
- 用户运行时数据写到 Skill 目录外的 `.career-os/` 或用户明确指定的目录。

## 修改要求

1. 保留现有功能和保真原则，避免把简单工作流抽象成框架。
2. 新增 reference 时，从 `MODULE.md` 直接链接并说明何时读取。
3. 修改脚本后执行语法检查和代表性测试。
4. 修改 Skill 元数据后，使用当前 Agent 自带 `skill-creator` 中的 `quick_validate.py` 验证仓库根目录。
5. 删除任何 `profile/` 或 `applications/` 用户文件、发送材料、发布或 git push 前，必须先征得用户明确同意。
