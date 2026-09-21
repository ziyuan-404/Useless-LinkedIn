# 投递申请

1. 读取 `references/application-operations.md`、`policies/authorization.md` 和该岗位当前授权记录。核实岗位仍开放、未投过、材料版本及必需问答。
2. 在当前用户已授权的范围内预填、上传、核对回显并提交；遇到 CAPTCHA、未知登录/2FA、付费或与事实库冲突的高影响事实时暂停对应步骤。
3. 点击按钮后先标 `submission-unconfirmed`。只有成功页、确认邮件或明确平台状态等证据，才用 `career.mjs state --id ID --to submitted --evidence EVIDENCE` 转为 `submitted`。
4. 依据 `references/dashboard-workflow.md` 同步 Excel 并记录跟进日期。同步失败保留待同步标记，不重复提交。
