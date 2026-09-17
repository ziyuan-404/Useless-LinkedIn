# 贡献指南

感谢你对 Personal Career OS 的关注！这份指南帮助你了解如何参与贡献。

## 项目定位

本项目专注于**求职场景**的 AI Agent 工作流。核心价值是「经历只沉淀一次，之后每个 JD 自动调用」——通过结构化记忆库和可执行方法论，让 Agent 为每次投递定制全套材料。

**不在范围内**：泛化成其他场景（学术 CV、项目文档、自由职业等）。如果你想将本项目的思路应用到其他领域，欢迎 fork 后自行改造。

## 如何贡献

### 报告问题（Bug Report）

发现 bug？[创建 Issue](../../issues/new?template=bug_report.md) 并提供：

- 你使用的 Agent（Claude Code / Codex / Cursor 等）
- 复现步骤
- 预期行为 vs 实际行为
- 相关日志或截图

**隐私提醒**：提交 issue 前，请确保截图和日志中不含个人敏感信息（姓名、手机、邮箱、公司名等）。

### 功能建议（Feature Request）

有想法？[创建 Issue](../../issues/new?template=feature_request.md) 并说明：

- 要解决什么问题（现有流程哪里卡住了？）
- 你期望的解决方式
- 是否有可参考的实践（比如某个 HR 顾问的建议、某篇方法论文章）

### 方法论贡献

`references/methodology/` 下的内容来自实践沉淀，欢迎补充：

- **简历方法论**：信息卫生排雷、价值翻译公式、量化维度等
- **风格库**：不同企业性质的写法差异（券商金融 / 大厂 / 国央企 / 外企）
- **岗位速查**：特定岗位的专业术语和结构（如投研 / 数据分析 / 产品运营）
- **挖掘问题库**：面试官式深挖问题清单

**标准**：
1. **可执行**：Agent 能直接按你的描述操作，不是泛泛而谈
2. **有依据**：来自你自己的实践 / 行业共识 / 可溯源的专业建议
3. **保持克制**：不堆砌「赋能、打造、深耕」等空洞词汇

### 代码贡献（Pull Request）

#### 提交前检查

- [ ] 跑通脚本验证：
  - Windows: `pwsh scripts/render.ps1 -Html assets/workspace/template/resume.html`
  - macOS/Linux: `bash scripts/render.sh assets/workspace/template/resume.html`
- [ ] 用包含 `python-docx` 的文档 Python 运行 `python scripts/export-docx.py assets/workspace/template/resume.html`，并渲染查看生成的 DOCX
- [ ] 跑脱敏检查：`bash scripts/check-privacy.sh assets/workspace` 或 `pwsh scripts/check-privacy.ps1 -Root assets/workspace`
- [ ] 如果改动了 `assets/workspace/`，确认仍是模板状态（占位符未被真实信息替换）

#### PR 规范

1. **Fork 后提交**：不要直接在主仓库开分支
2. **一个 PR 做一件事**：bug 修复、新功能、文档优化分开提交
3. **Commit message 格式**：
   ```
   feat: 添加岗位速查 - 金融工程岗
   fix: 修复渲染脚本在 macOS 上的路径问题
   docs: 补充 EXAMPLES.md 中的深挖工作流示例
   ```
4. **说明改动原因**：PR 描述里写清楚「解决什么问题」，而不只是「改了什么」

#### 代码风格

- **脚本**：兼容 PowerShell 7+ (Windows) 和 Bash (macOS/Linux)，不新增项目级 npm/pip 安装；DOCX 使用宿主 Agent 自带的 `python-docx` 文档运行时
- **Markdown 文档**：中文为主，代码示例用英文，保持「可执行」特性（Agent 能直接按步骤操作）
- **文件命名**：Markdown / 文档用中文短名（如 `简历方法论.md`），脚本 / 代码用英文（如 `render.ps1`）

### 文档改进

欢迎改进：

- README 中的错别字、不清晰的表述
- EXAMPLES.md 中的使用案例（真实场景优先，但需脱敏）
- MODULE.md / references/workflows/*.md 中的执行步骤优化

## 行为准则

- **尊重隐私**：不在 issue / PR / 讨论中泄露他人的真实个人信息
- **建设性反馈**：指出问题时，尽量给出改进建议或替代方案
- **保持专业**：本项目关注求职场景的工程实现，避免偏离主题的讨论

## 许可证

本项目采用 [MIT License](LICENSE)。你的贡献将以相同许可证发布。

---

有疑问？[在 Discussions 里提问](../../discussions) 或 [查看已有 Issues](../../issues)。
