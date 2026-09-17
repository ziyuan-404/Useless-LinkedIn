# ApplyPilot

**English** · [中文](README.zh-CN.md)

Turn scattered job applications into an agent-led workflow.

ApplyPilot is a reusable job application workflow for Codex and other AI agents.

ApplyPilot turns job searching into a repeatable operating system: candidate profile, dashboard, screening rules, resume strategy, application execution, blocker triage, and follow-up.

## Agent-Assisted Install

If you want your coding agent to install and start ApplyPilot for you, send it this repo and say:

```text
Clone https://github.com/yvonnehe772/applypilot and use ApplyPilot to initialize my job search workflow.
```

## What This Is

ApplyPilot is not a magic one-click job bot. It is a structured workflow that helps an AI agent:

- Understand the candidate before taking action.
- Track every job lead and application outcome.
- Decide what is worth applying to and what should be skipped.
- Choose the right resume strategy for precision or volume.
- Handle common browser and ATS issues more consistently.
- Stop safely when human input is required.

## Install

Recommended:

```bash
git clone https://github.com/yvonnehe772/applypilot.git ~/.codex/skills/applypilot
```

If you downloaded the repo manually, you can also copy the folder:

```bash
mkdir -p ~/.codex/skills
cp -R applypilot ~/.codex/skills/applypilot
```

Then start a new Codex thread and say:

```text
Use $applypilot to set up my job search workflow.
```

ApplyPilot setup is agent-led. You should not need to read every reference file or fill every template manually. The agent should ask the minimum questions needed to start safely, draft the files for you, run a small trial, then improve the workflow from real blockers.

For first-time users, the first trial should be lead finding only: find 3-5 jobs, classify them, update the dashboard, and do not submit applications.

First-time onboarding should be short, usually 8-10 minutes. ApplyPilot should collect the minimum safe setup first and defer detailed answer-bank, self-ID, follow-up, and resume-tailoring details until they matter.

## Update

ApplyPilot does not update automatically after installation.

If you installed with `git clone`, update with:

```bash
cd ~/.codex/skills/applypilot
git pull
```

If you copied the folder manually, replace your local `~/.codex/skills/applypilot` folder with the latest version from GitHub.

## Start Prompts

Copy one of these into Codex:

```text
Use $applypilot to initialize my job search workflow.
```

```text
Use $applypilot. I want volume mode: help me set up stable resume routing, application rules, and a dashboard before applying.
```

```text
Use $applypilot. I want precision mode: help me evaluate fit, tailor my resume draft, and ask for my review before submitting high-value applications.
```

```text
Use $applypilot. I am not sure which mode to use; start me in Volume mode and tell me when a role should be promoted to Precision.
```

## Quick Start: First Safe Run

For a first run, do not start with auto-apply. Ask ApplyPilot to do a lead-finding-only trial:

```text
Use $applypilot to initialize my workflow, then run a lead-finding-only trial: find 3-5 jobs, classify them, update the dashboard, and do not open application flows or submit anything.
```

ApplyPilot works in two stages:

- Lead finding: decide whether a job is worth tracking, skipping, or asking the user about.
- Application execution: only after the profile, resume, work authorization, sponsorship, compensation, and account/session facts are safe enough.

Status basics:

- `Pending`: worth later review or application.
- `Needs user`: a missing user-owned fact or action blocks the decision, such as sponsorship, work authorization, compensation, login, upload, or sensitive answers.
- `Skipped`: clearly not worth applying under the user's rules.
- `Blocked`: the workflow or site interaction could not safely proceed.

## First-Time Setup

Start by filling or generating these files from the templates in `templates/`:

- Candidate profile: identity, contact, work authorization, target roles, location, compensation, and non-guessable facts.
- Application rules: what to prioritize, consider, skip, or hand off.
- Resume routing: which resume to use for which role family.
- Answer bank: reusable truthful answers for common application questions.
- Dashboard: CSV sheets for job pool, application log, blockers, follow-up, resume rules, and automation lessons.

Minimum viable setup is enough for the first run. You can add detailed answer-bank wording, follow-up rules, and ATS-specific lessons after you see where the workflow gets stuck.

The safest first trial is `Lead finding only`. It should produce dashboard rows such as `Pending`, `Skipped`, `Needs user`, and `Blocked` without opening real application flows.

中文使用方式：

1. 先建立 candidate profile，不要让 AI 猜身份、签证、薪资、当前状态。
2. 再建立 dashboard，让每个岗位都有状态和记录。
3. 写清楚岗位筛选规则，尤其是“不投什么”。
4. 选择简历策略：默认海投；高价值岗位可以升级为精投。
5. 遇到卡点后，把问题沉淀成新的规则。

## Core Modules

ApplyPilot follows four setup modules:

- Candidate Profile: the user's source of truth.
- Dashboard: the system memory for all actions and outcomes.
- Screening Rules: priority, skip, level, location, sponsorship, and freshness rules.
- Resume Strategy: Volume by default, with selected high-fit roles promoted to Precision.

It also includes a practical browser and ATS playbook for permissions, dropdowns, address matching, Simplify overlays, tab cleanup, confirmation checks, Gmail verification, CAPTCHA/Cloudflare boundaries, login sessions, resume upload verification, and Goal-mode expectations.

Candidate Profile and Answer Bank are intentionally separate. Candidate Profile stores the user's facts and constraints; Answer Bank stores reusable wording for repeated application questions. The user can provide answers directly, or the agent can draft a first version from the profile and ask the user to confirm it once.

Resume strategy is chosen during setup. If the user is unsure, start with Volume: use stable resume variants, low-friction applications, and fewer interruptions. A specific high-fit or high-value role can be promoted to Precision. Precision can justify Workday, Oracle, long forms, or deeper custom work when the user confirms the role is worth it. External fit scores from tools like Jobright or Simplify can be used when available, but ApplyPilot can also estimate qualitative fit from title, level, skills, domain, location, authorization, and candidate story coherence.

For resume tailoring, users should provide an editable source when possible: DOCX, Markdown, Google Docs export, or plain text. PDF is fine for submitting applications and reviewing fit, but PDF-only is not ideal for precise resume edits. If the user only has a PDF, ApplyPilot should first help create an editable draft before tailoring.

Precision mode is a guided workflow, especially for first-time users. The agent should start with review-only or draft changes, create a new tailored version from an editable source, and ask the user to review it before submitting high-value applications. Once the user trusts the output, they can loosen review rules.

## Tool Capability Matrix

ApplyPilot adapts to the tools available in the user's agent environment.

| Capability | What ApplyPilot can do |
|---|---|
| No browser tools | Screen jobs from provided links, create rules, route resumes, draft answers, update dashboard files. |
| Browser automation | Search jobs, fill normal forms, upload resumes, close tabs, and record outcomes. |
| Visual/computer use | Handle custom dropdowns, covered buttons, visual upload checks, and pages where DOM state disagrees with visible state. |
| Email tool | Retrieve security codes only when the user has connected email and explicitly authorized it. |
| Never automated | CAPTCHA, Cloudflare, unknown login/2FA, payment prompts, sensitive legal uncertainty, or missing materials. |

Fast browser automation is preferred for batch work. Visual or computer-use control is a fallback for fragile pages, not the default.

## Safety Boundaries

ApplyPilot should never:

- Guess legal, identity, work authorization, compensation, or employment facts.
- Bypass CAPTCHA, Cloudflare, or anti-bot checks.
- Auto-login through unknown accounts or 2FA.
- Fabricate experience, credentials, portfolio work, references, or documents.
- Count saved jobs, trackers, or autofill badges as submitted applications.
- Auto-fill work authorization, sponsorship, compensation, voluntary self-ID, background check, or legal answers when they are missing or ambiguous.
- Publish private resumes, phone numbers, emails, addresses, immigration documents, application history, browser sessions, cookies, OTPs, or personal records.

Default apply behavior:

- Fill clear basic fields from the profile.
- Ask focused questions for missing high-impact facts.
- During onboarding, ask for voluntary self-ID strategy. If the user does not choose, default to blank, decline, or "Prefer not to say" when allowed, and tell the user that is the default.
- Draft custom answers from answer-bank patterns and ask before first use.
- Always stop before final submit.

For the first real application test, LinkedIn Easy Apply is usually the safest path because it is shorter and has clearer confirmation. Greenhouse is useful for ATS testing because it exposes EEO, email security code, upload, and dropdown behavior.

## Recommended Prompt

```text
Use $applypilot. Help me initialize my candidate profile, dashboard, application rules, resume routing, and answer bank before applying to jobs.
```

## Example Gallery

See [examples/fake-demo-example](examples/fake-demo-example) for a complete fake demo. It shows what a filled setup can look like:

- Candidate profile.
- Application rules.
- Resume routing.
- Answer bank.
- Dashboard rows for `Submitted`, `Blocked`, `Skipped`, `Needs user`, and `Pending`.

The example is not a real person and should not be copied directly. Use it to understand what information to give the agent and what files ApplyPilot can generate.

## Project Status

This is the first public version of a personal Codex job-search workflow, rewritten as a reusable skill for other agents and job seekers. It is meant to be adapted to your own background, market, and application style.

Suggestions, issues, and improvements are welcome.
