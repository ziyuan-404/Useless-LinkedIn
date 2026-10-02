# Useless LinkedIn

**A job-search Skill for France: find jobs, prepare documents, apply and follow up using natural language.**

[中文](README.md) · English · [Français](README.fr.md)

Share your CV and goals. The agent checks job availability, duplicates and essential requirements, prepares CVs, cover letters and application answers, submits within your authorization, and updates a local application dashboard. Configure roles, contract types, locations and start dates to suit your search.

## About the project

Useless LinkedIn brings scattered job-search activities into a recorded workflow that can be resumed. It focuses on France, with configurable roles and contract types, and discovers jobs across several boards rather than only LinkedIn. It installs as one Skill for an agent, with a local dashboard and document editor for visual interaction.

It addresses three recurring problems: repeating searches and screening across websites, preparing documents for different roles, and losing track of application outcomes and follow-ups.

### Core capabilities

| Capability | What the project provides |
|---|---|
| Job discovery and assessment | Falls back through APIs, page reading, the in-app browser and agent search; checks availability, duplicates and essential requirements, then gives evidence-based assessments. |
| Experience and documents | Maintains one verified fact library; tailors CVs, cover letters and answers for priority roles, reuses reviewed general CVs for batches, and exports and checks PDFs. |
| Applications and follow-up | Applies within authorization, distinguishes prepared documents, unconfirmed outcomes and submitted applications, and saves success evidence, next actions and follow-up dates. |
| Visual management | A local dashboard shows overviews, trends and records; the editor adjusts existing documents. Both interfaces support Chinese, English and French. |

### Design approach

**Verify facts once, reuse them, and record each step.** Recommendations should come from job requirements and real experience; submission status should come from success evidence. Edited documents are reviewed again, and interrupted runs resume from persistent records to avoid duplicate applications or treating an attempted action as completion.

Tools and personal data live separately, so the Skill can be updated while retaining your profile, documents and ledger. The workflow connects **Career Memory → Job Intelligence → Application Engine → Pipeline**, adapting designs from several open-source projects; see [attribution and licenses](THIRD_PARTY_NOTICES.md). Website access, login and required information still determine which applications can complete automatically. The project does not guarantee employment.

## Usage workflow

**Check pending tasks → discover jobs or read a job description → screen → prepare and review documents → apply and verify evidence → update records and follow-up dates**. You can also request just one step.

## 1. Installation and first setup

Use an agent with local file and web access, such as the Codex desktop app. Open a dedicated job-search folder and send:

```text
Install the root Skill from the Test branch of
https://github.com/ziyuan-404/Useless-LinkedIn as useless-linkedin.
Keep the entire skill package and INSTALL.md.
Tell me whether I need to reopen the conversation after installation.
```

Without a skill installer, select **Test branch → Code → Download ZIP** on GitHub, extract it, and ask the agent to read the root `SKILL.md`.

Attach your Word or PDF CV, then replace the brackets in this request:

```text
Use $useless-linkedin and follow SKILL.md and INSTALL.md for first setup.
Personal workspace: [a separate folder outside the Skill installation directory].
My CV is attached.
Target roles: [roles]; locations: [French cities, remote work or commute limits].
Contract type: [your choice]; start date: [date].
Languages, education, work authorization and other constraints: [actual details;
mark anything uncertain].

Install dependencies, initialize the workspace, configure searches and document
templates, build one verified experience library, and check that the application
dashboard and document editor start correctly.
Keep my original CV and existing data. Ask about missing or conflicting facts.
Test screening, document generation and record keeping with one job first.
Do not submit applications or send messages yet.
```

**The agent configures the dashboard automatically.** Following [INSTALL.md](INSTALL.md), it checks Node.js 24+ and Python 3.10+, installs dependencies, and runs the installer to create a blank ledger and launchers. No manual database creation or environment setup is needed; you still handle operating-system administrator prompts. Downloading the Skill does not run the installer or create a schedule.

Tools stay in the Skill directory; CVs, personal facts, applications and generated documents belong in your separate workspace. Your profile still needs to be built from your real documents after installation.

## 2. Everyday use

Invoke `$useless-linkedin` in your configured workspace and describe the task:

| Task | Example request |
|---|---|
| Find jobs | Find 10 new jobs in France using my criteria, check duplicates and rank them. |
| Assess a job | Assess this URL or description. Check essential requirements, evidence from my experience and application history. Explain your recommendation. |
| Prepare documents | Tailor my CV, cover letter and answers for this job, then show final PDF previews. |
| Prepare a batch | Screen these jobs and select reviewed general CVs for eligible roles. |
| Apply | Within my recorded authorization, check the final documents, apply, save success evidence and update the dashboard. |
| Follow up and review | Check follow-ups due and unverified submissions, organize next actions and draft follow-up messages. |

Tell the agent when preferences change: “Prioritize data analyst roles in Lyon” or “Use a one-page French CV focused on real projects.” Reinstallation is unnecessary.

If the description or an essential fact is missing, the agent should record what needs checking. **Clicking Submit or uploading a file is not proof of success.** A submission is recorded only after checking the success page, confirmation email or platform status. Emails and contact messages need their own authorization; drafts are not sent messages.

## 3. Application dashboard

### Launch and configuration

After installation, double-click the launcher in your personal workspace:

- **Windows:** `打开Dashboard.cmd`
- **macOS:** `打开Dashboard.command` (generated by the agent running the installer on a Mac)

The launcher starts and monitors both services and opens the dashboard. Keep its window running; use the dashboard's top navigation to enter the editor.

Default addresses: dashboard `http://127.0.0.1:8765/`, editor `http://127.0.0.1:8766/`. They listen only on your computer and require no separate account. The ledger lives at `个人资料/dashboard/applications.sqlite` in your workspace.

For connection failures, a moved Skill or historical Excel imports, ask:

```text
Follow INSTALL.md and the dashboard workflow to check this workspace.
Repair dependencies, launcher paths or port conflicts. Rerun the installer
to restore missing files if needed, preserving personal data and the ledger.
If I provide an Excel history file, import it read-only, check the results,
and keep the original.
```

### Using the page

1. **Check the overview.** Select a count for follow-ups due, tasks waiting on you, unverified submissions or verified submissions. The last 21 days of trends stay expanded. Historical submitted records can be unverified; verified submissions are counted separately.
2. **Find records.** Search company, role, URL or ID; filter by status or company initial and change sorting. Quick views highlight missing descriptions or conflicting stages. Choose 10, 20 or 50 records per page on the right.
3. **Add or edit.** Enter job details, execution status, suitability, next action and follow-up date. Stage checkboxes allow at most one selection. Edits retain history; leaving with unsaved changes triggers a warning.
4. **Verify evidence.** Entering an evidence description does not verify a submission; check the original receipt or platform result.

![Test-data demo: dashboard records and filtering](docs/media/dashboard.gif)

Both interfaces support **中文 / English / Français** and remember the selection after reload. Changing the interface language does not translate your application text or documents.

![Test-data demo: language switching](docs/media/interface-languages.gif)

See the [dashboard workflow](references/dashboard-workflow.md) for field definitions and maintenance rules.

## 4. Document editor

Use it to adjust job-specific CVs and cover letters already generated by the agent. Prepare documents first; they belong in a job folder under `个人资料/CV/` in your workspace. The editor does not directly convert arbitrary uploaded Word or PDF files into editable documents.

1. Open the editor from the dashboard, choose a job folder and document type, then select **Open document**.
2. Click a component to select it, double-click text to edit, and drag components or their edges to move or resize them.
3. Use the properties panel for text, images, font size, colors, opacity and layering. Inspect the whole page for overlap or overflow.
4. Select **Save and generate PDF**. A successful save updates the HTML, PDF and preview, keeping the previous version in the job folder's `work/editor-history/`. A failed save preserves the existing files and current edits.
5. Ask the agent to recheck facts, PDF text and the full-page layout before applying. Changed files invalidate the previous material review.

![Test-document demo: opening and editing](docs/media/document-editor.gif)

*All GIFs use fictional companies, jobs and documents, with no real applications or personal CVs.*

Switching documents or leaving with unsaved edits triggers a warning. See the [editor workflow](references/editor-workflow.md) for details.

## 5. Scheduled runs (optional)

Complete one end-to-end run and record the permitted application scope first. Then ask an agent platform supporting local scheduled tasks to create a task, for example:

```text
Create a scheduled task for this personal job-search workspace:
weekdays at 9 AM, timezone Europe/Paris.
Use $useless-linkedin to process up to 10 new jobs per run using my criteria.
Handle unfinished tasks and follow-ups first, then check new jobs and prepare
and review documents. Apply within my recorded authorization and update the
dashboard after checking success evidence.
Verification challenges, expired login and unknown essential facts block only
the affected job; continue other workable jobs.
Summarize submissions, blockers and next actions. Do not apply twice or send
unauthorized messages.
```

Local runs require the computer to be on and online, with the platform and workspace available. The agent must check task creation, activation and run status; installing the Skill alone does not start applications. See the [daily cycle](workflows/daily-cycle.md) and [unattended execution plan](workflows/unattended-run.md).

## Further reading

- [Installation](INSTALL.md) · [Technical setup and troubleshooting (Chinese)](docs/技术配置指南.md)
- [Privacy](PRIVACY.md): do not publish real CVs, contacts, application records or login data. Local storage does not imply fully offline model processing.
- [MIT license](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md): resources from ApplyPilot, Personal Career OS, resume-builder and career-ops retain their respective licenses.
