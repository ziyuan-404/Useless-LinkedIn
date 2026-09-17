# Useless LinkedIn

[中文](README.md) · **English** · [Privacy](PRIVACY.md) · [Attribution](THIRD_PARTY_NOTICES.md)

A local, evidence-backed job-search workflow for an AI coding agent. It combines a reusable career knowledge base, public vacancy discovery, eligibility checks, tailored application materials and a reviewed Excel dashboard. Despite its name, it covers several French job boards and does not require a LinkedIn integration.

This is a **sanitized public distribution**, not a copy of someone’s private job-search workspace. It contains generic tools, instructions, blank layouts and licensed resources. Candidate facts, original resumes/photos, real applications, accounts, credentials, private answers and original Git history are excluded.

## What it does

| Capability | Behavior |
|---|---|
| Career knowledge base | One private `.career-os/profile/`; claims link to exact source text and later user confirmations. |
| Public vacancy discovery | Configurable API → HTTP → rendered browser → Agent WebSearch fallback; bounded results and keyword filtering. |
| Integrity checks | Full-JD capture, liveness evidence, URL/history checks and approximate JD similarity. Suspicious duplicates need review. |
| Eligibility | 14 Knock-out checks. Explicit mismatch is FAIL; unknown hard conditions make the result MARGINAL. |
| Job intelligence | A–G analysis plus H application-answer drafts; explained overall priority, not a fabricated match percentage. |
| Application materials | One shared generator for CV/cover letter, exact source quotations, new output directories, PDF QA and final-page screenshots. |
| Resume pool | Only explicitly reviewed versions with matching SHA256 may be selected. File names do not prove suitability. |
| Tracking | JSON leads, a Markdown list and a derived SQLite index; Excel remains the application dashboard. |
| Reviewed spreadsheet updates | Preview by default; stable record ID, expected old values, locks, backups, recalculation and export verification. |
| Follow-up and review | Agent instructions for follow-up queues and funnel analysis; sending messages is a separate authorized action. |

The command-line tools **do not contain an autonomous model or search-service worker**. They write tasks for the current Agent. `awaiting-agent` and pending search tasks are explicit hand-off states, not proof that an unattended run has finished. Real application submission is not part of the shared CLI.

## Layout

```text
SKILL.md                         Modular Agent entry point
agents/                          Agent discovery metadata
modules/                         Career OS, resume, job analysis, writing, operations
references/                      Detailed workflows and architecture
scripts/                         Reusable supporting utilities
assets/                          Blank dashboard resources
dashboard-template.xlsx          Blank workbook, never a real application ledger
.career-os/
  tools/                         Shared CLI and rendering/dashboard tools
  vendor/                        Attributed selected upstream modules and PyYAML
  portals.yml                    Public job-board configuration
  skills/alternance-ops/          Workspace workflow entry
  operations/                    Unconfigured rule templates
  template/                      Generic HTML layouts and neutral image
```

Private directories are created locally and ignored by Git: `profile/`, `applications/`, `audits/`, `archive/`, `dashboard-backups/`, `CV/`, `work/` and the real workbook. Do not create a second candidate profile inside a module.

## Requirements and installation

The original execution environment is a Windows Codex desktop workspace. Start with **Node.js 24+**, Python 3, and an Agent able to read this repository and use web/browser tools. Other environments require appropriate executable paths and are not certified by this release.

```powershell
git clone https://github.com/ziyuan-404/Useless-LinkedIn.git
cd Useless-LinkedIn
node --version
python --version
$env:CAREER_PYTHON = (Get-Command python).Source
```

HTTP/API scanning with `--no-browser` does not require Playwright. PyYAML’s pure-Python parser and license are bundled. Rendering requires Playwright and a suitable Chrome executable; PDF QA requires `pypdf`, `pypdfium2` and Pillow:

```powershell
npm install --no-save playwright
python -m pip install pypdf pypdfium2 Pillow
# Set this only when the installed Chrome path differs from the Windows default:
$env:CAREER_CHROME = 'C:\path\to\chrome.exe'
```

Excel writes additionally require **`@oai/artifact-tool` in the configured runtime**. It is not bundled here; do not assume it is available from a public package registry. If absent, scanning and analysis are still usable, but dashboard patching is unavailable. `CAREER_NODE_MODULES` may point to an available runtime’s module directory. Codex bundled paths are tried when normal module resolution fails.

## Configure your private workspace first

1. Ask the Agent to import your own source resume into `.career-os/profile/`; keep originals intact and record discrepancies instead of guessing.
2. Create `basics.md`, `preferences.md`, `links.md`, `claim-map.md` and `experiences/`. `basics.md` must contain a confirmed name in the form `- 姓名：Your Name` because the current generator parses that field.
3. The shared layout has two experience slots, two project slots and one education slot. The generator reads internship dates from `experiences/experience-1.md` and `experience-2.md`, using the confirmed field `时间: YYYY-MM—YYYY-MM`. Keep `project-1.md` and `project-2.md` as the baseline project sources. These filenames are generic aliases, not a request to invent four experiences.
4. Configure `operations/application-rules.md`, `resume-strategy.md`, `answer-bank.md` and `follow-up-rules.md` for your actual constraints. Unconfigured values stay unknown.
5. Privately fill the HTML identity/contact/education fields and use your own photo if desired. Public layouts intentionally contain placeholders. They are not ready to submit.
6. Copy the blank workbook to the ignored real filename:

```powershell
Copy-Item dashboard-template.xlsx '求职Dashboard.xlsx'
```

7. Follow the dashboard workflow to create dated sheets and reviewed records. The blank workbook is a starting point, not an automatically populated database. Initialize the private resume registry `.career-os/audits/resume-pool.json` with `{"files":[]}` before using the resume-pool selector.

Pipeline/history commands expect the real workbook to exist. An empty or incomplete profile must not become an eligibility PASS merely to get past a missing-file error.

## Everyday use

In an Agent conversation, request a specific operation, for example:

> Use this project’s Skill. Discover new Python apprenticeship roles, check duplicates and eligibility, then prepare materials only for confirmed PASS roles. Do not submit applications.

Or supply a JD URL and ask for the complete workflow. The Agent should continue the generated tasks rather than ask you to manually author assessment JSON.

```powershell
node .career-os/tools/career.mjs tracker --history
node .career-os/tools/career.mjs scan --no-browser
node .career-os/tools/career.mjs scan --portal 'LinkedIn' --no-browser
node .career-os/tools/career.mjs pipeline --url 'https://example.org/job'
node .career-os/tools/career.mjs tracker --id 'RECORD_ID'
```

Default discovery state: `.career-os/applications/automation/`, containing `leads.json`, `list.md`, `search-queue.json`, `scan-agent-task.md`, per-job capture/context/report files and `tracker.sqlite`. `CAREER_STATE_DIR` can select a different directory inside the workspace. Discovery does not modify Excel or declare submission success.

## Job boards and fallback

| Board | Implementation and limits |
|---|---|
| Welcome to the Jungle | Selected upstream provider queries the public Algolia index with fresh public search configuration; France filters and result caps. |
| HelloWork | Public HTML listing links; render only if usable matches are missing. |
| LinkedIn | Public listings with explicitly allowed `www`/`fr`/main hosts; known tracking parameters removed. Login gates can still block capture. |
| Indeed France | HTTP may return 403. Native `sj_` job-card identities become stable `viewjob?jk=` links; Agent-operated IAB can provide listing observations. |
| La Bonne Alternance | Verified software-development query parameters, ROME M1861; only published LBA/partner vacancies, never predicted recruiters. Other occupations require their own verified parameters. |

Modify `.career-os/portals.yml` for queries, include/role/exclude keywords, per-board queries, exact allowed hosts, detail-path patterns and result caps. A normalized JSON API can be configured with `api_url`; `api_token_env` reads credentials from an environment variable. A differently shaped official API needs an adapter, not just a URL substitution.

When script capture fails, the Agent reads the fallback task, opens the public listing in IAB and saves **observed** visible titles/links:

```json
{
  "kind": "listing",
  "url": "https://example.org/search?q=Python",
  "pageUrl": "https://example.org/search?q=Python",
  "capturedAt": "CURRENT_ISO_TIMESTAMP",
  "bodyText": "Observed visible job title",
  "links": [{"url": "https://example.org/job/123", "title": "Observed visible job title"}]
}
```

```powershell
node .career-os/tools/scan.mjs --listing-capture local-listing.json --no-browser
node .career-os/tools/scan.mjs --import discoveries.json --import-only
```

Captures expire after 24 hours and titles must appear in the observed text. Browser observations and search results are **discovery evidence**, not full-JD or active-vacancy evidence. If the browser is also blocked, the Agent uses WebSearch and imports detail links. No CAPTCHA or login protection is bypassed. Result caps produce samples, not exhaustive coverage.

## Eligibility, reports and answer drafts

The 14 keys are `contract`, `rhythm`, `location`, `remote`, `start`, `education`, `experience`, `technology`, `french`, `english`, `permit`, `salary`, `credentials`, `duplicate`. Each needs a result and explanation; FAIL needs an exact JD quotation. Essential checks cannot be dismissed as not applicable. Unknown hard conditions yield MARGINAL; FAIL and MARGINAL stop material generation.

A–G cover role overview, evidence matching, level/strategy, salary/demand, customization, interview preparation and truthfulness risks. H contains answer drafts. The explained overall priority is 1–5 or unknown; the system does not compute a weighted match percentage. Salary does not determine priority under the current workflow.

Answers distinguish `common-draft` from `observed-form`, and `draft` from `needs-user`. Do not invent a work-permit statement, credential, salary expectation or commute. Assessment `contextHash` changes when the JD or profile/rules change, so stale assessments are refused.

## Materials and review

The Agent creates a payload with `cv` and `letter` replacement arrays. Each item has a supported selector, text, an index when needed, and exact source quotations of at least eight characters:

```json
{
  "selector": ".profil-text",
  "text": "A statement supported by your private profile.",
  "sources": [{"path": ".career-os/profile/basics.md", "quote": "EXACT_SOURCE_TEXT"}]
}
```

```powershell
node .career-os/tools/generate-application.mjs --company 'Example Company' --role 'Developer' --claims local-payload.json --validate-only
```

Use `tools/README.md` and `pipeline-schema.json` for the complete structure. PASS generation must customize all four experience bodies, skills, availability and the education route. Outputs use new `CV/YYYY-MM-DD-.../` directories, never overwrite source resumes, and include two PDFs, source maps, QA data and final screenshots. Each PDF must be one page and strictly below 3,000,000 bytes; compression must preserve extracted text.

Quotation existence checks cannot prove semantic support. Human/Agent semantic and visual review remains required. `materials-pending-review` is not “ready to submit”; it is certainly not “submitted”. A matching receipt may reuse unchanged materials; changed facts or payload require a new version.

## Dashboard and resume pool

```powershell
node .career-os/tools/dashboard.mjs --patch local-patch.json
node .career-os/tools/dashboard.mjs --patch local-patch.json --apply
node .career-os/tools/select-resume.mjs --file 'CV/private-reviewed-version.pdf'
```

Dashboard patches locate an existing stable ID in a dated sheet and require expected old/new values. They protect formula cells, reject conflicting stages and require evidence for submitted records. Preview does not write. Apply checks locks/open-workbook markers, preserves a backup, recalculates and verifies an exported workbook. New rows/sheets still need the dashboard workflow and visual review.

The resume selector accepts only `verified` registry entries with a current matching hash. This release includes no verified candidate CV. Follow-up defaults are suggestions to configure locally, not permission to send messages. Historical conversions require valid denominators and transitions; do not count pending applications as rejections.

## Troubleshooting and boundaries

- **Missing profile/workbook:** complete private setup; do not manufacture eligibility or bypass history checks.
- **Missing Python/Chrome:** set `CAREER_PYTHON`/`CAREER_CHROME`; use `--no-browser` for HTTP/API scanning.
- **403, incomplete JD or access gate:** preserve uncertainty and use the Agent fallback task; inaccessible does not mean expired.
- **Stale assessment/capture:** obtain current evidence and rerun; web records expire after 24 hours.
- **Workbook open or `.lock` left behind:** close the workbook/check for a running process before manual lock recovery. Never automatically steal a lock.
- **PDF overflow/placeholders:** shorten supported claims and complete the private layout, rerender and inspect final screenshots.
- **Gallery preview missing:** upstream rendered photos/PDFs/screenshots were omitted; retained source templates may reference unavailable optional previews.
- **Unattended execution:** no scheduler/model/search worker is configured; this is an Agent-assisted local workflow.

Review [PRIVACY.md](PRIVACY.md) before using personal data or publishing changes. `.gitignore` does not sanitize tracked files or history. Local storage does not guarantee that an Agent/model provider processes data offline.

## License and acknowledgments

Project-specific work is distributed under [MIT](LICENSE). Retained modules, fonts, templates and Typst packages keep their respective licenses and attribution. Workflow/resources draw from ApplyPilot, Personal Career OS, resume-builder and career-ops; selected MIT career-ops modules and PyYAML are vendored. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before redistribution.
