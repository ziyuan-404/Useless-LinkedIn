# 安装与首次配置

本文件供使用此 Skill 的 Agent 执行。下载或复制 Skill 不会自动运行安装脚本；首次使用时，Agent 应完成以下流程，用户无需手动配置环境变量或逐条安装依赖。

## 选择工作区

确认独立的个人工作区路径。已有工作区就使用原路径；首次使用且用户未指定路径时，在用户主目录下建立 `Useless-LinkedIn-workspace`。工作区不得位于 Skill 安装目录内。真实简历、档案、台账和授权记录只保存在工作区。

## 准备运行时

Agent 检查 Node.js **24+**、npm 和 Python **3.10+**。优先使用已安装的可执行文件；Codex 提供的工作区依赖路径也可以使用。缺少运行时则由 Agent 使用系统包管理器安装：Windows 的 `winget` 包为 `OpenJS.NodeJS.LTS` 与 `Python.Python.3.12`，macOS 的 Homebrew 包为 `node` 与 `python@3.12`。安装后重新定位可执行文件并确认版本；必要时用 Node 的绝对路径运行安装器，不要求用户自己复制命令或手动设置 `PATH`。如果操作系统要求管理员授权、包管理器缺失或安装失败，说明实际阻断点，继续尝试可用的本机安装途径，不把未完成的安装报告为成功。

## 一次安装

从 Skill 根目录运行，`PATH` 换为已选工作区的绝对路径：

```text
node runtime/tools/useless-linkedin.mjs install --workspace PATH
```

若自动找到的 Python 不合适，加 `--python PYTHON_EXECUTABLE`；无需让用户设置永久环境变量。安装器依次执行 `npm ci`、安装本地 PDF 用 Chromium、在 Skill 目录创建 `.venv/` 并安装 `requirements.txt`、幂等初始化个人工作区，最后检查 Node、浏览器、Python 库、数据库与启动文件。`.venv/` 和 `node_modules/` 不提交到仓库。岗位网页仍由 Agent 使用指定的浏览器访问，安装的 Chromium 只用于本地 PDF。

安装成功后，Windows 工作区根目录有 `打开Dashboard.cmd`；macOS 有 `打开Dashboard.command`。双击对应文件会启动并监测 Dashboard 与材料编辑器，默认浏览器打开 Dashboard。工作区中的资料仍需依据用户的真实材料建立；安装成功不表示档案、投递授权或岗位材料已经就绪。

重复运行安装器可以修复缺失依赖并补建启动文件，不覆盖已有个人资料。若 Skill 安装位置移动，Agent 应核对现有启动文件中的旧路径并修复；`init` 不会覆盖已有启动文件。
