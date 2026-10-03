# 投递申请

1. 读取 `references/application-operations.md`、`policies/authorization.md` 和该岗位当前授权记录。核实岗位仍开放、未投过、材料版本及必需问答。
2. 在当前用户已授权的范围内预填、上传、核对回显并提交。IAB 中按钮普通点击无响应时，先用同一语义控件的键盘激活（`Enter`/`Space`）重试；可按页面行为选择其他可用浏览器。文件上传先监听 `filechooser`，再依次尝试可见上传按钮的键盘激活、点击和原生 `Choose File` 控件；页面回显正确文件名才算上传成功。遇到 CAPTCHA、未知登录/2FA、付费、与事实库冲突的高影响事实，或所有可用浏览器上传入口都不产生文件选择事件时，记录并暂停对应岗位。
3. 点击按钮后先标 `submission-unconfirmed`。只有成功页、确认邮件或明确平台状态等证据，才保存凭证文件及其截图、邮件或页面原件，再用 `useless-linkedin.mjs state --id ID --to submitted --receipt RECEIPT.json` 转为 `submitted`。凭证 JSON 包含 `kind`（success-page / confirmation-email / platform-status）、`observedAt`、`description`、`artifactPath`；模拟文字不能代替原件。
4. 依据 `references/dashboard-workflow.md` 更新本地网页 Dashboard。核对 `匹配度`、`下一步`、`跟进日期`均已写入且与评估及成功凭证一致；同步失败保留待同步标记，不重复提交。
