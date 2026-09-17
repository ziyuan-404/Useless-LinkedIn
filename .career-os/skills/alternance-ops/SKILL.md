---
name: alternance-ops
description: Process public job listings and JD URLs using a local verified profile, shared tools and application review gates.
---

Candidate facts exist only in .career-os/profile/. Read local operations/application-rules.md and resume-strategy.md. Missing facts remain unknown. Read the relevant module in modules/. Never submit or send messages without current authorization.

Run tools/career.mjs scan to discover listings. Read search-queue.json and scan-agent-task.md. For blocked listings, the current Agent opens IAB and saves recent observed listing captures; import using scan --listing-capture FILE --no-browser. Fall back to Agent WebSearch if the browser remains blocked. Never treat snippets as full JD or vacancy-liveness proof.

For a JD URL run pipeline --url URL. Continue awaiting-agent using context.json and schema.json. Complete all 14 KO checks, A-G sections and H answer drafts; unknown hard conditions mean MARGINAL. Do not generate materials for FAIL or MARGINAL. Source quotes must support the claims; existence checks do not replace semantic and visual review. Use shared generators, never company-specific scripts.

Excel is the application authority. Preview dashboard patches first; preserve originals and do not infer submission success. Resume pool versions require verified status and matching hashes. Keep private profile, application data and outputs out of Git.
