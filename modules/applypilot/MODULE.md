# ApplyPilot（内部模块规则）

本模块定义筛选、简历路由、申请操作和卡点记录的判断规则。执行顺序见根目录 `workflows/`；人物事实仅来自 `00-个人资料/profile/`，申请授权见 `policies/authorization.md`。

## 筛选与路由

- 按 `00-个人资料/operations/application-rules.md` 检查岗位时效、地点、合同、资格和排除条件。明确硬门槛不满足时停止；未知硬条件进入待决定，不当成通过。
- 高价值岗位适用精投；可投且定制收益有限的岗位可用海投。具体分流依用户的 `resume-strategy.md`，不得默认把数量置于真实性之上。
- 海投只选择审计状态为 verified 且当前 SHA256 匹配的简历池文件。文件名相似或岗位关键词相同不足以证明适用。

## 申请操作与证据

- 表单字段、雇主问答、上传和最终提交均受当前用户授权范围及事实库约束。法律身份、工作许可、薪资等未知或冲突字段交给用户；不猜测。
- CAPTCHA、登录/2FA、付费、缺失材料和页面异常须记录卡点、步骤、观察结果和下一行动；不可绕过站点验证。
- 上传或点击提交按钮不等于成功。只有成功页、确认邮件或明确平台状态等证据才能记为 `submitted`；机器状态名称以 `runtime/tools/lib/state-machine.mjs` 为准。
- 邮件与 LinkedIn 消息默认起草，发送需相应授权。个人资料、凭据、会话和真实申请历史不得写入公开模块。

ATS 操作细节按需读取 `references/application-playbook.md`；隐私和阻断情形按需读取 `references/safety-and-boundaries.md`。这些参考不建立第二套 profile、CSV 台账或独立工作流。
