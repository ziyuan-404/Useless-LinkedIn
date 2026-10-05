# 每日循环

无人值守定时运行先按 [执行方案](unattended-run.md) 做运行前核对和逐岗位隔离。

多岗位按 [批次与投递执行器](../references/batch-application.md) 分阶段交接。scan/triage 加 --summary；batch --stage assess/submit/reconcile 取得下一批，共用事实包每批读一次，不反复加载全部队列和开发历史。

1. 读取状态机中需要下一次合法迁移的线索与申请，先处理阻塞和到期跟进，再按 `discover-jobs.md` 找新岗位。
2. 先运行 `triage --run --summary` 批量分拣 review 和 possiblyClosed。剩余队列保存在返回文件中，按批读取原因和 ID；blocked 或证据不足保留待核验。candidate 线索用 batch 依次调用 `process-job.md`、`prepare-application.md`、`submit-application.md` 中适用阶段；每一步将证据和状态写入持久记录。Agent 完成事实、PDF 文本和视觉审查后，以具体检查结果进入 `approved`，无需用户逐岗位批准。无法从事实库核实的关键项标记阻塞，跳过该岗位并继续下一岗位；缺少常驻或岗位授权时不得进入 `submitting`。
3. 用 `follow-up.md` 和 `review-pipeline.md` 复盘有样本支持的结果，再用于下一轮。
4. Dashboard 数据库与 JSON 状态不一致时先核对原始证据；不得凭单一派生索引声称已投递。
