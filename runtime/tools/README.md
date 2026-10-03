# Shared automation tools

On first use, the Agent follows `INSTALL.md` and runs `useless-linkedin.mjs install --workspace PATH` from the Skill installation. This installs locked Node/Python dependencies, local PDF Chromium and the separate personal workspace. Candidate facts and outputs stay in that workspace. Node.js 24+ and Python 3.10+ are bootstrapped by the Agent when absent; no user environment-variable setup is required.

For an older `.career-os/` workspace, run `useless-linkedin.mjs migrate --workspace PATH`; it refuses ambiguous old and new directories. Run `useless-linkedin.mjs doctor` to check dependencies and workspace readiness.

- `useless-linkedin.mjs scan [--portal NAME]`: bounded public vacancy discovery. CLI uses API/HTTP (native or impit), isolated Playwright for dynamic pages, or available interactive-browser captures. `--no-browser` remains accepted for older commands.
- `useless-linkedin.mjs triage [--list-review | --list-closed | --run]`: visible review/disappearance queue, full-JD lightweight triage, and evidence-backed batch decisions; never reads candidate facts or generates materials.
- `useless-linkedin.mjs pipeline --url URL`: full-JD liveness/history checks and a task for the current Agent; continue with `--id ID --assessment FILE`.
- `useless-linkedin.mjs tracker --history`: read-only posting-link history from the Dashboard database; it never changes lead state.
- `useless-linkedin.mjs resume add/audit/verify/activate/select/list`: maintain the reviewed bulk resume pool; each family with multiple verified files needs one active choice.
- `useless-linkedin.mjs authorization --check ACTION --job-id ID`: inspect the private authorization ledger; missing grants deny the action. Explicit standing authorization can be recorded once with `--grant --workspace-scope --actions prepare_materials,prefill_form,upload_files,submit --source TEXT`; submission state still checks the approved material snapshot.
- `useless-linkedin.mjs state --id ID --to STATE [--evidence TEXT]`: checked transition; `submitted` requires `--receipt FILE` pointing to a saved success artifact.
- `generate-application.mjs --company COMPANY --role ROLE --claims FILE [--validate-only]`: quoted-source replacements; configure your private profile and generic layouts first.
- `useless-linkedin.mjs dashboard --serve --open`: local web Dashboard. `--import-xlsx FILE` performs a one-time read-only import; `--verify` checks counts and database integrity; `--sync-submitted LEAD_ID` retries receipt-backed state synchronization.
- `useless-linkedin.mjs editor --open`: local CV and cover-letter editor. The workspace launcher (`打开Dashboard.cmd` on Windows, `打开Dashboard.command` on macOS) starts and monitors it alongside the Dashboard; text, image and block position/size changes are saved to HTML and rebuilt as local PDFs with version backups. See `references/editor-workflow.md`.
- `useless-linkedin.mjs resume select --file FILE` or `--family FAMILY`: requires a verified local registry entry and matching SHA256.

For blocked lists the current Agent uses IAB to observe visible job cards. Save one object or an array: `{kind:"listing",url:"configured query URL",pageUrl:"observed URL",capturedAt:"ISO time",bodyText:"observed titles",links:[{url:"posting URL",title:"visible title"}]}`. Import with `scan.mjs --listing-capture FILE --no-browser`. No private account panel is needed. Captures expire after 24 hours; titles and permitted hosts are checked. Listing discovery is not full-JD liveness. If IAB is blocked, complete the search task through Agent WebSearch and import details using `--import FILE --import-only`.

Full-JD web captures use `{kind:"full-page",url,finalUrl,jd,bodyText,applyControls,capturedAt}` and `pipeline --web-capture FILE`. Save observed complete JD text and actual controls, never search snippets. The same capture must be passed when submitting the assessment. Unknown hard criteria are MARGINAL and do not produce formal application materials.

Generator payload: `cv` and `letter` replacement arrays, each `{selector,text,index?,sources:[{path,quote}]}`. Full quotes must exist in allowed local facts. Source existence does not prove semantic truth. Customize all four experience bullet slots and the fifth education slot, then review final PDF text and screenshots. No successful application submission is inferred from generation.

No unattended model/search execution, credentials or personal audit code is distributed. Dependencies and local setup are described in the root README.

The retired `useless-linkedin.mjs intake` command no longer creates records. Older local `个人资料/applications/intake/` files are left untouched; `tracker --history` reads the Dashboard database, since an intake record with `pending-assessment` is not evidence of an application.
