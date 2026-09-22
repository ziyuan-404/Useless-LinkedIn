# Shared automation tools

Run tools from the Skill installation with Node.js 24+. Set `CAREER_WORKSPACE` to a separate personal directory and run `career.mjs init --workspace PATH` once. Candidate facts and outputs stay in that workspace.

- `career.mjs scan [--portal NAME] [--no-browser]`: bounded public vacancy discovery.
- `career.mjs pipeline --url URL`: full-JD liveness/history checks and a task for the current Agent; continue with `--id ID --assessment FILE`.
- `career.mjs tracker --history`: read-only posting-link history with sheet and row evidence; it never changes lead state.
- `career.mjs resume add/audit/verify/select/list`: maintain the reviewed bulk resume pool.
- `career.mjs authorization --check ACTION --job-id ID`: inspect the private authorization ledger; missing grants deny the action.
- `career.mjs state --id ID --to STATE [--evidence TEXT]`: checked state transition; approval and confirmed submission require evidence.
- `generate-application.mjs --company COMPANY --role ROLE --claims FILE [--validate-only]`: quoted-source replacements; configure your private profile and generic layouts first.
- `dashboard.mjs --patch FILE`: preview before `--apply`; only reviewed existing records, with before/after values and true submission evidence when required.
- `select-resume.mjs --file FILE` or `--family FAMILY`: requires a verified local registry entry and matching SHA256.

For blocked lists the current Agent uses IAB to observe visible job cards. Save one object or an array: `{kind:"listing",url:"configured query URL",pageUrl:"observed URL",capturedAt:"ISO time",bodyText:"observed titles",links:[{url:"posting URL",title:"visible title"}]}`. Import with `scan.mjs --listing-capture FILE --no-browser`. No private account panel is needed. Captures expire after 24 hours; titles and permitted hosts are checked. Listing discovery is not full-JD liveness. If IAB is blocked, complete the search task through Agent WebSearch and import details using `--import FILE --import-only`.

Full-JD web captures use `{kind:"full-page",url,finalUrl,jd,bodyText,applyControls,capturedAt}` and `pipeline --web-capture FILE`. Save observed complete JD text and actual controls, never search snippets. The same capture must be passed when submitting the assessment. Unknown hard criteria are MARGINAL and do not produce formal application materials.

Generator payload: `cv` and `letter` replacement arrays, each `{selector,text,index?,sources:[{path,quote}]}`. Full quotes must exist in allowed local facts. Source existence does not prove semantic truth. Customize all four experience bullet slots and the fifth education slot, then review final PDF text and screenshots. No successful application submission is inferred from generation.

No unattended model/search execution, credentials or personal audit code is distributed. Dependencies and local setup are described in the root README.

The retired `career.mjs intake` command no longer creates records. Older local `.career-os/applications/intake/` files are left untouched; `tracker --history` reads the Excel history only, since an intake record with `pending-assessment` is not evidence of an application.
