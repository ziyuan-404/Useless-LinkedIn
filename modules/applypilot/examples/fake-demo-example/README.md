# Fake Demo Example

This is a complete fictional ApplyPilot setup. It is not a real candidate and should not be copied directly.

Use it to understand what information a user may give the agent, what files ApplyPilot can draft, and how dashboard rows should look after a trial run.

中文说明：这是一个完整的虚拟示例，不是真人信息。它的作用是让用户提前看到 ApplyPilot 初始化后大概会生成什么。

## Included Files

- `candidate_profile.example.json`: what a candidate profile can look like.
- `application_rules.example.md`: how to write prioritize, consider, skip, and handoff rules.
- `resume_routing.example.md`: how to start in Volume mode, define fit signals, route resumes, and promote a high-fit role to Precision.
- `answer_bank.example.md`: how reusable form answers can be organized.
- `dashboard-example/job_pool.csv`: examples of `Submitted`, `Skipped`, `Blocked`, `Needs user`, and `Pending`.
- `dashboard-example/application_log.csv`: attempt-level evidence and confirmation records.
- `dashboard-example/blocker_queue.csv`: blocker records and retry strategy.

## Dashboard Status Examples

The demo dashboard intentionally includes:

- `Submitted`: a role with explicit confirmation text.
- `Skipped`: an overleveled Staff PM role.
- `Blocked`: a Greenhouse dropdown validation issue.
- `Needs user`: a CAPTCHA / Cloudflare handoff.
- `Pending`: a high-value role waiting for tailored resume review.

## How to Use This Example

Ask the agent:

```text
Use $applypilot and review examples/fake-demo-example. Help me create my own version with my real information.
```

Do not reuse the fake work authorization, compensation, contact, links, or resume paths.
