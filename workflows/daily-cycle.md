# 每日循环

1. 读取状态机中需要下一次合法迁移的线索与申请，先处理阻塞和到期跟进，再按 `discover-jobs.md` 找新岗位。
2. 每个岗位依次调用 `process-job.md`、`prepare-application.md`、`submit-application.md` 中适用阶段；每一步将证据和状态写入持久记录。未授权步骤停在 `REVIEW_REQUIRED`。
3. 用 `follow-up.md` 和 `review-pipeline.md` 复盘有样本支持的结果，再用于下一轮。
4. Excel 与 JSON 状态不一致时先核对原始证据；不得凭单一派生索引声称已投递。
