# Application Playbook

Use this reference for browser-based job applications, LinkedIn Easy Apply, Simplify, Greenhouse, Lever, Ashby, Workday, and other ATS pages.

## Global Rules

- Count only confirmed submissions.
- Prefer short, reliable paths over long custom forms.
- Close each completed or skipped job tab before moving on.
- Keep only tabs that need user handoff.
- Record every outcome in the dashboard.
- Stop rather than bypass verification or guess high-impact answers.
- Use one consistent workflow: automate clear low-risk fields and answer questions from the verified profile and answer bank. Check the current user's authorization ledger before uploads and submission; valid standing authorization avoids repeated per-job confirmation.

## Form Answer Defaults

- Basic fields with clear profile values can be filled automatically: name, email, phone, LinkedIn, location, resume upload, and start date.
- Work authorization, sponsorship, and compensation can be filled only when wording matches the profile or answer bank closely.
- Voluntary self-ID defaults to blank, "Prefer not to say", or decline/skip when available unless the user configured exact answers.
- Custom questions should use answer-bank patterns when available. Otherwise, draft the specific answer, verify it against the profile and source evidence, and continue when the facts are clear. If a required answer lacks evidence or conflicts with the profile, record a blocker for that job and continue with other jobs.
- Final submission requires an active grant from the current user covering this action and scope. Within that grant, submit and verify the confirmation; this public package carries no personal authorization from its original workspace.

## Low-Friction Applications

Volume mode and first real application tests should prefer low-friction applications:

- No new account creation.
- Not Workday, Oracle, or another long enterprise ATS by default.
- No video, long writing sample, or mandatory portfolio submission.
- At most one custom question.
- Clear resume upload and final confirmation path.
- No CAPTCHA, Cloudflare, login, or 2FA interruption.

This is a prioritization rule, not a permanent ban. In Precision mode, the agent may continue through Workday, Oracle, long forms, or deeper custom work when the role's value justifies the time and all required answers are supported by evidence.

## Automation Ladder

Use the fastest reliable method first, then escalate only when needed:

1. IAB browser controls: best for batch work, normal buttons, form fields, tab cleanup, and repeatable ATS flows.
2. DOM plus keyboard repair: use Escape, Tab, Enter, arrow keys, and real option selection when dropdowns or overlays misbehave.
3. Visual or computer-use control: use when the page state matters visually, buttons are covered, dropdowns are custom, uploads are silent, or DOM state and visible state disagree.
4. User handoff: use for CAPTCHA, Cloudflare, unknown login credentials, or 2FA. Record unsupported sensitive facts or missing materials as blockers for that job without inventing answers.

Use the built-in browser for recruitment websites. Playwright Chromium is reserved for local PDF rendering and inspection.

## The 10 Common Cardpoints

### 1. Permissions

Before long runs, verify that the IAB can click, read pages, switch tabs, and upload files on the target websites. No browser extension is required.

If permissions fail mid-run, record the exact permission needed and stop that application.

### 2. Dropdowns That Look Selected But Are Not

ATS dropdowns may show a value visually while internal validation still fails.

Try:

- Press Escape to close autofill overlays.
- Click the real dropdown option text.
- Use keyboard navigation.
- Use visual/computer control if ordinary DOM interaction fails.
- After fixing, verify that the site no longer reports the field invalid.

If the same field repeatedly fails, record a blocker instead of burning time.

### 3. Address and Option Matching

Address fields may require full names, abbreviations, city, state, country, or localized text.

Try in this order, adapted to the user's profile:

1. Full city, state, country.
2. City only.
3. State only.
4. Country full name.
5. Country abbreviation.
6. Local-language variant if relevant.

For autocomplete fields, type, wait for candidates, then select a candidate. Do not submit raw typed text unless the site accepts free text.

### 4. Simplify or Extension Overlay Blocks Buttons

If Next, Review, or Submit does not respond:

- Close the Simplify side panel or other overlay.
- Focus the button and press Enter.
- Retry once.
- If still blocked, record a blocker.

Do not count an application as submitted unless the confirmation rule passes.

### 5. Close Completed Windows or Tabs

After each job is submitted, skipped, or blocked, close no-longer-needed tabs. This keeps memory, page scripts, and agent context under control.

Only keep tabs open when the user must act, such as CAPTCHA, login, upload, or final manual review.

### 6. Define Submission Success Strictly

Submission evidence can include:

- Visible text like `Application submitted`, `Application sent`, or `Thank you for applying`.
- A thank-you page.
- A URL pattern like `thanks`, `thank-you`, `submitted`, or `confirmation` may help locate a confirmation page, but the path alone is not proof.
- A platform status that clearly says the application was sent.

Save the page, message, email, or platform-status artifact containing an explicit success statement before marking a submission confirmed.

Do not count:

- Saved jobs.
- Job trackers.
- Simplify quick apply labels.
- Autofill completion.
- A clicked submit button with no confirmation.

### 7. Email Verification vs CAPTCHA / Cloudflare

Email security codes may be handled if the user has connected an email tool and authorized code retrieval.

CAPTCHA, hCaptcha, reCAPTCHA, Cloudflare, and anti-bot checks must be treated as user handoff. Do not bypass them.

### 8. Login Sessions and Account Choice

If a login page appears, stop and record `Login required` or `Session expired`.

Do not attempt automatic login unless the user explicitly instructs it and the flow is safe. If multiple LinkedIn or email accounts exist, use the account confirmed in `个人资料/profile/` or the user's rules.

### 9. Resume Upload Verification

After uploading a resume, verify the file is attached before submitting.

Watch for:

- Sites that accept PDF only.
- Custom upload widgets.
- Silent upload failure.
- Wrong resume variant attached.
- Browser permission failure.

If upload cannot be verified, mark `Needs user` or `Blocked`; do not submit without a resume unless the user explicitly allows it.

### 10. Goal Mode Expectations

Goal-style runs are best for volume mode and short application flows.

Expect the agent to skip or defer:

- Workday or Oracle account-heavy flows.
- Long custom applications.
- Forms requiring missing materials.
- Login, 2FA, CAPTCHA, or Cloudflare.

For high-value target roles, use a focused run instead of a volume goal.

## Common ATS Notes

### LinkedIn Easy Apply

- Prefer fresh filters and direct apply flows.
- Close overlays before clicking Next, Review, or Submit.
- Count only after visible submitted/sent confirmation.

### Greenhouse

- Dropdown validation may be stale even when the page looks correct.
- Confirm required fields visually before retrying submit.
- If invalid state persists, record exact field and blocker.

Greenhouse email security code SOP:

- Use only when the user authorized email access.
- Read the latest Greenhouse security code from email.
- Locate each single-character security input when possible.
- Clear each box before typing.
- Enter one character per box using focused keypresses rather than bulk paste.
- Read the values back and verify the joined code exactly matches the email code.
- Submit only after verification.
- If characters duplicate, show as `undefined`, fail to clear, or cannot be verified, stop and hand off to the user.

### Lever

- Watch for hCaptcha or final confirmation pages.
- Count only explicit confirmation or thank-you page.

### Ashby

- Often requires resume upload.
- Verify upload before continuing.
- Record file permission blockers exactly.

### Workday / Oracle / Enterprise ATS

- Skip or defer long login-heavy flows unless fit is strong.
- Record maintenance, account creation, or login blockers.
