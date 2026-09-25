# 简历策略

## 精投

- 通过岗位有效性和 Knock-out 预检查，且属于高匹配、高价值或用户点名的职位。
- 每个 JD 生成独立 CV 与动机信 PDF。
- 文件保存到 `WORKSPACE_ROOT/00-个人资料/CV/YYYY-MM-DD-公司-岗位/`。

## 海投分流

| 岗位族 | 简历文件（相对 `WORKSPACE_ROOT/00-个人资料/海投简历/`） | 允许职位关键词 | 排除关键词 | 状态 |
|---|---|---|---|---|
| 示例：软件开发 | `cv-software.pdf` | developer, software engineer | 待确认 | 待确认 |
| 示例：数据方向 | `cv-data.pdf` | data, SQL, analytics | 待确认 | 待确认 |

文件名只能作为初始路由线索。首次使用前，执行 `career resume add --file FILE --family FAMILY` 和 `career resume audit --id ID`，核对 PDF 事实、版面及岗位族适用性后，再以 `career resume verify --id ID --evidence TEXT` 记录审阅证据。流水线只选择注册表中状态为 verified 且 SHA256 未变化的 PDF。

## 决策规则

- 关键要求有强证据、高价值且值得定制：精投。
- 基本门槛通过、岗位族明确、已有简历可真实覆盖：海投。
- 明确 Knock-out、岗位失效或违反排除规则：跳过。
- 身份、签证、薪资、地点或合同信息不明且会改变决策：待用户决定。
