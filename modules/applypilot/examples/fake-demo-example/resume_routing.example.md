# Resume Routing Example

This is a fake demo. Replace all paths before real use.

## Strategy

Selected strategy: Volume

Use stable resumes by default. Promote only high-fit PM or Growth PM roles to Precision after user review.

## Resume File Format

Editable sources available:

- `resumes/alex_product_manager_resume.docx`
- `resumes/alex_growth_pm_resume.docx`

PDF-only application resume:

- `resumes/alex_product_analyst_resume.pdf`

PDF-only note: use for upload and fit review, not direct editing.

## Fit Signals

External fit score source:

- Jobright: optional, if user has it.
- Simplify: optional, if user has it.

If no external score exists, use qualitative fit.

| Signal | Demo guidance |
|---|---|
| Role/title match | PM, Growth PM, Product Analyst are strongest. |
| Level and years match | Entry to mid-level preferred. |
| Skill/keyword match | Analytics, experiments, roadmap, user research, SQL, activation, retention. |
| Domain/industry match | AI tools, B2B SaaS, data products. |
| Location/work authorization feasibility | Must match profile and rules. |
| Candidate story coherence | Product analyst to PM transition should be easy to explain. |
| Form complexity vs value | Long forms only for high-fit roles. |

## Resume Variants

| Role family | Resume file path | Use for titles | Do not use for | Notes |
|---|---|---|---|---|
| Product Manager | resumes/alex_product_manager_resume.docx | Product Manager, APM, Platform PM | Staff PM, Director | Editable source. |
| Growth PM | resumes/alex_growth_pm_resume.docx | Growth PM, PLG PM, Activation PM | Pure marketing ops | Editable source. |
| Product Analyst | resumes/alex_product_analyst_resume.pdf | Product Analyst, Data Analyst | Engineering roles | PDF upload only. |

## Tailoring Rules

Tailor only when:

- Qualitative fit is High.
- Company is a target company.
- Role is PM or Growth PM.
- User has time to review the tailored draft.

First-time precision rule:

- Generate suggestions first.
- Then generate a tailored draft.
- Ask user to review before submission.

Do not overwrite source resumes.
