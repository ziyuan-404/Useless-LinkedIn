# Internal module maintenance

The repository root `SKILL.md` and `workflows/` control execution. This module contains screening and application rules only. Candidate facts belong solely in `.career-os/profile/`; authorization and state are governed by `policies/authorization.md` and `.career-os/tools/lib/state-machine.mjs`. Do not introduce a second profile or CSV authority. Preserve privacy and source attribution.
