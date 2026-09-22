# 精投材料工作流

只在用户明确要求精投、定制或生成材料时执行。

## 必读模块规则

按顺序完整读取：

1. `modules/personal-career-os/MODULE.md`
2. `modules/personal-career-os/references/methodology/简历方法论.md`
3. `modules/resume-builder/references/Resume-Writing-Guide-LLM.md`
4. `modules/application-writing/MODULE.md`
5. 排版与渲染依 `.career-os/tools/generate-application.mjs` 和工作区模板执行。

使用 Personal Career OS 的档案与产物能力，叠加 resume-builder 的 claim-map、批量追问、模板无关内容稿、JD—证据映射和最终真实性审计。

## 生成顺序

1. 保存完整 JD；按 Job Intelligence 完成失效、重复和 Knock-out 检查。未通过时停止，除非用户明确要求继续。
2. 完成 A–H 评估，判断岗位、行业、公司性质、最终读者、硬门槛与命名要求。
3. 读取唯一事实库，建立 JD—证据映射：已覆盖、可挖、真实缺失。
4. 在本岗位目录建立 `work/claim-map.md`。只将已确认事实写入模板无关内容稿。
5. 先决定保留、压缩和舍弃的经历，再写 CV；禁止只做关键词替换。
6. 按 Application Writing 生成动机信，从同一批确认事实生成 PDF。
7. 逐页目视检查 CV 和动机信 PDF；同时核对文本、日期、数字、公司名、岗位名和文件名。
8. 检查输出文件是否含未授权披露的个人信息。通过后在 dashboard 记录实际文件路径和 `材料已准备`。

## CV 规则

- 默认一页；经历确实丰富且用户同意时可以两页。
- 真实性优先于岗位匹配，岗位匹配优先于措辞和版面。
- 每条 bullet 尽量呈现问题/场景、个人动作或判断、结果/影响。
- 数字必须有来源，团队结果不得写成个人主导。
- 强关键词应出现在有证据的经历里，不能只堆在技能栏。
- 不覆盖母版，也不覆盖已有岗位版本。

## 动机信规则

动机信不是把 CV 改成散文。默认控制在一页，使用目标岗位要求的语言，结构为：

1. 明确申请岗位和真实可用性；
2. 说明为什么该岗位/公司值得申请，只引用 JD 或已核实的公开公司事实；
3. 用 2–3 个已确认经历证据回答“为什么是我”；
4. 连接证据与岗位任务，不重复整份 CV；
5. 简洁收尾并表达面试意愿。

公司专属陈述若无法核实，改为基于 JD 的岗位动机，不编造企业文化、产品影响或团队信息。动机信中的每项候选人主张也进入 claim-map。

## 输出位置

输出到 `WORKSPACE_ROOT/CV/YYYY-MM-DD-公司-岗位/`。优先遵守 JD 的文件命名要求；否则使用：

- `姓名-CV-公司-岗位.pdf`
- `姓名-Motivation-Letter-公司-岗位.pdf`

路径字符要兼容 Windows。dashboard 中“使用简历”填写最终 CV 的绝对路径，“动机信”填写最终动机信的绝对路径。
