# 投递运营工作流

## 必读模块规则

按当前任务读取：

- 岗位有效性、去重、Knock-out 和 A–H：`modules/job-intelligence/MODULE.md`
- 初始化规则、简历策略或回答库：`modules/applypilot/references/setup-workflow.md`
- 操作招聘网站或 ATS：`modules/applypilot/references/application-playbook.md`
- 隐私、登录、验证码或自动化边界：`modules/applypilot/references/safety-and-boundaries.md`

忽略其中建立 Candidate Profile 和 CSV dashboard 的步骤；分别由唯一事实库和 Excel dashboard 替代。其余筛选、简历策略、回答库、执行、卡点复盘和跟进规则继续适用。

## 精投分流

通过有效性与 Knock-out、高匹配、高价值或用户点名的岗位进入精投。只有对应岗位目录中的 CV PDF 和动机信 PDF 均完成真实性与视觉检查后，才进入申请预填。长表单、Workday/Oracle 或额外问题较多的岗位，只有精投价值足够且用户确认才继续。

## 海投分流

海投只从 `WORKSPACE_ROOT/海投简历` 选择简历。根据 `resume-strategy.md` 的岗位族、允许职位、排除职位和路径匹配；没有规则时可根据文件名提出候选，但必须先确认一次再沉淀规则。

优先顺序：岗位族明确匹配 > 技能方向匹配 > 相邻方向。不得仅因为关键词重合而选择会误导候选人能力的版本。

## 投递执行

1. 确认授权、登录状态、岗位仍开放且未重复投递、实际文件和必需回答存在。
2. 填写低风险字段并上传已选文件，验证页面确实显示正确文件名。
3. 新的开放题先生成草稿；首次出现的回答模式让用户确认后才复用。
4. 遇到验证码、未知登录/2FA、与事实库冲突的高影响事实或网站异常时，记录 `待用户` 或 `受阻`。平台服务条款、Cookie及隐私协议默认自动同意，不作为阻塞项。
5. 最终提交前显示简短审阅摘要并等待批准。
6. 看到明确成功证据后更新 dashboard，关闭已完成或跳过的标签页。

## 卡点复盘和后续跟进

- 每次受阻记录页面/ATS、字段或步骤、现象、尝试过的安全修复、下一步和负责人。
- 重复卡点转为 `automation-lessons.md` 中的规则；规则不得包含 Cookie、验证码、账号密码或真实个人资料。
- dashboard 的跟进日期到期时，检查招聘方回复、面试、拒绝或结果；没有变化时只更新必要记录，不重复联系。
- 对外发送跟进消息仍需用户明确授权。
- 定期按 `modules/pipeline-analytics/MODULE.md` 统计漏斗和等待时间，结论必须带样本范围，不能把仍在等待的岗位算作拒绝。
