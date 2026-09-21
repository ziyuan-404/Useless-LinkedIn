# 授权账本

授权是带来源、记录时间、范围和动作的持久数据，格式见 [`authorization.schema.json`](../schemas/authorization.schema.json)。原始授权时间未知时只填 `recordedAt`，不得编造 `grantedAt`。实际工作区保存在 `.career-os/operations/authorizations.json`，不得提交到公开仓库。用户撤销时写入 `revokedAt` 或移除该授权，随后再执行相关动作前重新检查。

使用 `node .career-os/tools/authorization.mjs --check ACTION --job-id ID` 检查。允许的动作是 `prepare_materials`、`prefill_form`、`upload_files`、`submit`、`send_message`。缺失、过期、范围不匹配或撤销都视为未授权；不从岗位适合度或模型上下文推断。授权记录必须引用可核查的用户原话或有日期的用户确认文件；工具不会自造授权。

此公开 Skill 不携带个人授权账本。只有当前用户明确授予的动作才写入其私有账本；新的用户指令优先于旧记录。私人邮件及 LinkedIn 消息默认保持草稿。授权检查不代替事实、登录、验证码和成功证据核验。
