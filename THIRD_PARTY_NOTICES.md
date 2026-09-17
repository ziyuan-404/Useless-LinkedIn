# Third-party notices

Useless LinkedIn 组合并改编了以下开源项目的工作流与资源。各上游模块目录中的许可证、归属文件和资源许可证继续保留。

| 项目 | 用途 | 固定版本 |
|---|---|---|
| [ApplyPilot](https://github.com/yvonnehe772/applypilot) | 投递运营、筛选、执行边界和卡点处理 | `1e84f9d6916afdbe41e74ec5247e5ea4929db925` |
| [Personal Career OS](https://github.com/Pluto-Mo/personal-career-os) | 经历库、JD 工作流和材料导出 | `16a26e2c6339d4f7949b5cd9ffdb5775be22eb95` |
| [resume-builder](https://github.com/StoneLL1/resume-builder) | 简历事实追溯、写作、模板和渲染 | `9aa5ca4a0a9115223b6d1361e3e71d38556777ae` |
| [career-ops](https://github.com/career-ops-hq/career-ops) | 选定代码及A–H、Knock-out、岗位完整性、写作、研究和漏斗参考 | `7c6de77e46db1935b714e1d3978831051640ea20` |

career-ops is licensed under the MIT License, Copyright (c) 2026 Santiago Fernández de Valderrama. 本项目对相关工作流进行了中文化和重组，并复用下文列出的MIT代码模块；没有将career-ops作为第二个Skill安装，也没有运行其人物库迁移命令。

resume-builder 内含多套第三方模板、字体与 Typst 包；其具体许可证和归属以 `modules/resume-builder/assets/` 下随附文件为准。使用或再发布模板前应保留这些文件。

The sanitized distribution also vendors selected MIT-licensed career-ops modules in `.career-os/vendor/career-ops` (WTTJ, liveness, URL normalization, fingerprint and tracker parsing). Their original LICENSE is retained. `.career-os/vendor/yaml` contains PyYAML 6.0.3 with its MIT license. No private upstream/local Git history is distributed.
