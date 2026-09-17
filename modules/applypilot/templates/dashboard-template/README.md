# Dashboard Template

Use these CSV files as a lightweight dashboard. They can be imported into Excel, Google Sheets, Airtable, Notion, or converted into a workbook.

## Sheet Purposes

### `daily_dashboard.csv`

Daily operator summary.

Fields:

- `date`: run date.
- `found_count`: jobs found.
- `submitted_count`: confirmed submissions only.
- `skipped_count`: intentionally skipped jobs.
- `blocked_count`: attempted but automation could not complete.
- `needs_user_count`: waiting for user action.
- `pending_count`: queued for later.
- `top_sources`: LinkedIn, company sites, job boards, etc.
- `summary`: short run summary.
- `user_actions_needed`: concrete next actions for the user.

### `job_pool.csv`

Main job lead table and current state.

Fields:

- `date_found`: when the job was found.
- `company`, `job_title`, `role_family`, `level`, `location`, `remote_policy`.
- `source`, `job_url`, `posted_date`.
- `priority`: High, Medium, Low, Stretch.
- `status`: Submitted, Skipped, Blocked, Needs user, Pending.
- `resume_variant`: selected resume route.
- `skip_reason`: why skipped.
- `blocker`: current blocker if any.
- `next_action`: what should happen next.
- `notes`: short context.

### `application_log.csv`

Audit trail for actual attempts.

Fields:

- `attempt_date`, `company`, `job_title`, `job_url`, `platform`.
- `status`: final attempt outcome.
- `submission_evidence`: what proved submission.
- `resume_used`: exact resume file or variant.
- `answers_used`: answer bank sections or custom answers used.
- `confirmation_url`, `confirmation_text`.
- `notes`.

### `blocker_queue.csv`

Retry and handoff queue.

Fields:

- `date`, `company`, `job_title`, `job_url`.
- `blocker_category`: CAPTCHA, login, dropdown, upload, missing material, etc.
- `what_happened`: observed failure.
- `why_blocked`: why the agent stopped.
- `can_retry`: yes/no.
- `next_retry_strategy`: browser automation, visual control, user handoff, skip.
- `user_action_needed`: exact user action.
- `status`: open, retry later, resolved, abandoned.

### `follow_up.csv`

Post-application pipeline.

Fields:

- `date`, `company`, `job_title`, `contact`, `channel`.
- `event_type`: recruiter reply, rejection, interview, assessment, follow-up.
- `deadline`, `next_action`, `status`, `notes`.

### `resume_rules.csv`

Resume routing table.

Fields:

- `role_family`.
- `resume_file_path`.
- `use_for_titles`.
- `avoid_for_titles`.
- `tailor_threshold`: external score or qualitative threshold.
- `notes`.

### `automation_rules.csv`

Lessons learned.

Fields:

- `date`.
- `rule_category`: screening, browser, ATS, answer, resume, safety.
- `rule`: new or updated rule.
- `reason`: why it exists.
- `source_blocker_or_lesson`: link to blocker, application, or observation.
- `status`: active, testing, retired.

## Counting Rules

- Count only confirmed submissions in `submitted_count`.
- Put every job in `job_pool.csv` once.
- Put every real application attempt in `application_log.csv`, even if it failed.
- For lead-finding-only trials, leave `application_log.csv` empty because no application attempt occurred.
- Put repeatable failures in `blocker_queue.csv`.
- Convert repeated blockers into `automation_rules.csv`.

## Lead-Finding Trial Rules

For a first clean-room trial or demo:

- Find 3-5 jobs.
- Update `job_pool.csv` and `daily_dashboard.csv`.
- Use `Pending` only for jobs worth later review or application.
- Use `Needs user` when a missing high-impact fact blocks the decision, such as sponsorship, work authorization, compensation, relocation, or real resume file.
- Use `Skipped` for roles that clearly violate rules.
- Use `Blocked` only when an attempted workflow or site interaction cannot proceed.
- Do not write to `application_log.csv` unless the agent actually opened or attempted an application flow.
