# ApplyPilot（内部模块）

本文件保留上游 ApplyPilot 的工作流细节，只能由项目根目录 `SKILL.md` 路由。总控模式下跳过 Candidate Profile 初始化和 CSV 权威台账，分别改用 `.career-os` 唯一事实库和 Excel dashboard。

ApplyPilot is a job application operating workflow for AI agents. It helps users turn job searching into a repeatable system: profile, dashboard, screening rules, resume strategy, application execution, blocker triage, and follow-up.

## Core Contract

Optimize for truthful, traceable, interview-generating applications, not blind volume.

Treat setup as an agent-led onboarding flow, not a user homework packet. Ask only for the minimum information needed to start safely, create drafts/templates for the user, then iterate after the first trial run.

Before searching or applying, make sure the user has:

1. A candidate profile.
2. A dashboard or workbook for tracking outcomes.
3. Application screening rules.
4. A resume strategy.
5. Clear safety boundaries for browser automation and form answers.

If any source is missing, initialize it first. Do not guess identity, legal, work authorization, compensation, current employment, sponsorship, relocation, or other high-impact facts.

## Workflow

### 1. Initialize the System

Read `references/setup-workflow.md` when:

- The user is installing ApplyPilot for the first time.
- The user asks to create a profile, dashboard, rules, templates, or GitHub-ready setup.
- The user has not provided enough information for safe applications.

Use the templates in `templates/` to create user-owned files:

- `candidate_profile.template.json`
- `application_rules.template.md`
- `resume_routing.template.md`
- `answer_bank.template.md`
- `dashboard-template/*.csv`

### 2. Screen Before Applying

Prioritize jobs by freshness, fit, feasibility, and conversion likelihood. Default to fresh jobs from the last 24 hours, then 48 hours if needed.

Skip or defer roles that violate the user's rules, are clearly overleveled, are closed or duplicate, require unsupported work authorization, need missing materials, or involve long account-heavy flows with weak fit.

### 3. Route the Resume Strategy

Use the user's chosen strategy:

- Precision mode: screen for high-fit jobs first, then tailor resume/materials before applying.
- Volume mode: use prebuilt resume variants by role family and move quickly.

Default to Volume mode unless the user explicitly asks for Precision. Individual high-fit roles can be promoted from Volume to Precision.

Never fabricate experience, credentials, degrees, employers, dates, work authorization, or portfolio artifacts.

### 4. Apply Safely

Read `references/application-playbook.md` before operating browser-based applications, LinkedIn Easy Apply, Simplify, Greenhouse, Lever, Ashby, Workday, or other ATS flows.

Stop or hand off for CAPTCHA, Cloudflare, anti-bot checks, login or 2FA, conflicting identity/sponsorship facts, missing files, payment prompts, or permission prompts. Standard terms of service, privacy policy consents, and cookie banners are pre-authorized to be automatically accepted without stopping.

### 5. Record Every Outcome

Every job lead or attempt must end in one of these states:

- `Submitted`: explicit confirmation was seen.
- `Skipped`: not worth applying, with reason.
- `Blocked`: automation could not proceed, with blocker and next step.
- `Needs user`: user must provide a missing high-impact fact, complete CAPTCHA/login/upload, answer a sensitive question, or make a required judgment before the agent can decide.
- `Pending`: selected for later action because it appears worth reviewing or applying after known prerequisites are satisfied.

Count only confirmed submissions. Saved jobs, trackers, autofill badges, or "quick apply" labels do not count.

For a first trial or demo run, default to lead finding only: find, screen, classify, and update the dashboard without opening real application flows or submitting anything. In lead-finding-only runs, update `job_pool`, `daily_dashboard`, `blocker_queue`, and `automation_rules` as needed; leave `application_log` empty because no application attempt occurred.

### 6. Learn From Blockers

After each run, summarize blockers and convert repeated issues into rules. ApplyPilot should improve through use: address matching, dropdown handling, resume upload checks, account/session checks, and ATS-specific lessons belong in the dashboard and rules.

## Safety

Read `references/safety-and-boundaries.md` when the user asks about automation limits, CAPTCHA, email verification, account login, privacy, public sharing, or what should not be included in a repo.

Do not publish or copy private resumes, phone numbers, emails, addresses, immigration documents, application history, browser sessions, cookies, OTPs, or user-specific secrets into a public ApplyPilot package.
