# 投递申请

多岗位默认按 [批次与 IAB 执行器](../references/batch-application.md) 运行。batch --stage submit 分组，apply --prepare 匹配答案和材料，IAB 共享脚本批量填写；结构改变重新 prepare。ready-to-submit 后 apply --arm 持久化并复核，用 permit 直接提交，apply --record 核验原始凭证及同步。未核验尝试进入 batch --stage reconcile，不重复提交。

1. 读取 `references/application-operations.md`、`policies/authorization.md` 和该岗位当前授权记录。核实岗位仍开放、未投过、材料版本及必需问答。
2. 在当前用户已授权的范围内预填、上传、核对回显并提交。IAB 中按钮普通点击无响应时，先用同一语义控件的键盘激活（`Enter`/`Space`）重试；可按页面行为选择其他可用浏览器。文件上传先监听 `filechooser`，再依次尝试可见上传按钮的键盘激活、点击和原生 `Choose File` 控件；页面回显正确文件名才算上传成功。遇到 CAPTCHA、未知登录/2FA、付费、与事实库冲突的高影响事实，或所有可用浏览器上传入口都不产生文件选择事件时，记录并暂停对应岗位。
3. 点击按钮后先标 `submission-unconfirmed`。优先 receipt --id ID --plan，由邮件连接器读取真实确认邮件，直接保存结构化返回，再 receipt --id ID --email FILE --commit 核验并同步。共享执行器观察到本次明确平台确认文字时由 apply --record 保存最小结构化凭证。默认不保存投递页面快照、截图或整页 HTML，不输出 Base64；原始邮件正文、来源和散列仍保留。没有明确证据就等待邮件或核实平台状态，不能为取凭证重复投递。历史图片/HTML凭证仍兼容，不删除。凭证 JSON 包含 kind、observedAt、description、artifactPath；模拟文字不能代替原始观察。
4. `state` / `apply --record` 自动调用本地 Dashboard 同步器；按 `references/dashboard-workflow.md` 检查返回的 missing / issues / complete。需要重试时运行 `dashboard --sync --id ID` 或 `--ids FILE --out FILE`，不逐栏操作浏览器、不重新组织已有评估。核对完整 JD、具体 PDF 路径、匹配度、下一步、跟进日期和提交凭证；缺少来源明确记录，同步失败保留待同步标记，不重复提交。
