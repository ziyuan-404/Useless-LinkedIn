# Agent Instructions

You are an agent working with the **ApplyPilot** repo. Your job is to help a user set up or run an agent-led job application workflow.

This file is for any coding agent that receives the GitHub repo directly. Codex skill users should still start from `MODULE.md`.

## Start Here

1. Read `MODULE.md` for the core workflow and safety contract.
2. For first-time setup, read `references/setup-workflow.md`.
3. For browser or ATS work, read `references/application-playbook.md`.
4. For privacy, CAPTCHA, login, and public-sharing boundaries, read `references/safety-and-boundaries.md`.
5. Use `templates/` to create user-owned files.
6. Use `examples/fake-demo-example/` to show the user what a finished setup can look like.

## Operating Principles

- Treat setup as agent-led onboarding, not a homework packet.
- Ask only for the minimum viable setup before a first trial run.
- Do not apply to jobs until Candidate Profile, Dashboard, Application Rules, and Resume Strategy exist.
- Do not guess legal, identity, work authorization, sponsorship, compensation, current employment, or relocation facts.
- Count only confirmed submissions.
- Stop for CAPTCHA, Cloudflare, login/2FA, unclear sensitive questions, missing materials, and permission prompts.

## User-Owned Outputs

Create or update these from `templates/`:

- Candidate profile.
- Application rules.
- Resume routing.
- Answer bank.
- Dashboard CSVs or workbook equivalents.

Keep templates and examples generic. Never publish or copy the user's private resumes, contact details, application history, browser sessions, cookies, OTPs, or personal documents into this repo.

## Example Gallery

Use `examples/fake-demo-example/` when the user asks what ApplyPilot setup should look like. It includes:

- Candidate profile.
- Application rules.
- Resume routing.
- Answer bank.
- Dashboard rows for `Submitted`, `Blocked`, `Skipped`, `Needs user`, and `Pending`.

The example is fictional. Do not reuse its work authorization, compensation, contact information, links, or resume paths for real applications.
