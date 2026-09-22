# 岗位状态机

`leads.json` 的 `state` 是当前自动线索和流水线阶段，`events` 记录迁移。`tracker.sqlite` 和 `list.md` 是可重建索引。具体合法迁移由 `.career-os/tools/lib/state-machine.mjs` 检查。

状态值的唯一机器定义是 `.career-os/tools/lib/state-machine.mjs`。运行 `node SKILL_ROOT/.career-os/tools/career.mjs state --list-states` 可查看当前合法值；`schemas/state.schema.json` 与之同步。历史记录的旧值保留，不因文档改名而无证据升级。

`submitted` 必须同时写入 `submitted: true` 和非空 `submissionEvidence`。上传或点击按钮只能进入 `submission-unconfirmed`。失效、重复与缺事实保留证据和原因，不自动清理记录。重试必须从当前状态执行合法迁移。

资格事实缺失使用 `needs-decision` 并记录 `reason=missing_fact` 和待核实项；其他未决硬门槛可记录 `reason=unresolved_knockout`。原因是字段，不是新增状态。

新材料必须从 `materials-pending-review` 经 `review-required` 到 `approved`；批准时保存审阅依据 `reviewEvidence`。`approved` 之后才可进入 `submitting`。

共享命令 `node SKILL_ROOT/.career-os/tools/career.mjs state --id ID --to STATE [--evidence TEXT] [--reason TEXT]` 负责人工操作后的状态更新；进入 `submitting` 或 `submitted` 会检查该岗位的提交授权。`submitted` 的 evidence 应指向可核验的成功页、确认邮件或平台状态，不得填“已点击”。

Excel 仍包含历史真实申请，尚未完成逐行核对迁移。当前 JSON 是自动线索与其工作阶段的 machine state；未迁移的申请以 Excel 行和提交成功凭证核对；Excel Dashboard 是当前面向人的运营视图。`dashboardSynced` 只说明视图同步状态，不是成功证据。禁止将两边记录简单合并或以空 JSON 覆盖 Excel。
