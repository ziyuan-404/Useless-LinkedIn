// Persistent lead states. Legacy lowercase values remain readable during migration.
const allowed = {
  discovered: ['awaiting-agent','needs-verification','expired','duplicate-review','possible-duplicate'],
  'possible-duplicate': ['duplicate-review','awaiting-agent','needs-verification','expired'],
  'known-application': ['duplicate-review'],
  'needs-verification': ['awaiting-agent','expired','duplicate-review'],
  'duplicate-review': ['awaiting-agent','needs-verification','expired'],
  'awaiting-agent': ['awaiting-agent','needs-decision','rejected','generation-failed','materials-pending-review','needs-verification','expired','duplicate-review'],
  'needs-decision': ['awaiting-agent','rejected','materials-pending-review','needs-verification','expired'],
  'generation-failed': ['awaiting-agent','materials-pending-review','needs-verification','expired'],
  'materials-pending-review': ['awaiting-agent','review-required','needs-decision','needs-verification','expired'],
  'review-required': ['approved','needs-decision','needs-verification','expired'],
  approved: ['submitting','needs-verification','expired'],
  submitting: ['submission-unconfirmed','submitted','blocked-login','blocked-captcha'],
  'submission-unconfirmed': ['submitted','submitting','needs-verification'],
  submitted: ['followup-due'],
  'followup-due': ['submitted'],
  expired: ['needs-verification','awaiting-agent'],
  rejected: ['awaiting-agent'],
  'blocked-login': ['submitting'],
  'blocked-captcha': ['submitting']
};

export function assertTransition(from, to, values = {}) {
  if (from !== to && !allowed[from]?.includes(to)) throw Error(`Illegal lead state transition: ${from} -> ${to}`);
  if (to === 'needs-decision' && (!values.reason || typeof values.reason !== 'string' || !values.reason.trim())) throw Error('Needs-decision requires a reason');
  if (to === 'approved' && (!values.reviewEvidence || typeof values.reviewEvidence !== 'string' || !values.reviewEvidence.trim())) throw Error('Approval requires review evidence');
  if (to === 'submitted' && (!values.submissionEvidence || typeof values.submissionEvidence !== 'string' || !values.submissionEvidence.trim())) throw Error('Submitted requires explicit success evidence');
  if (to === 'submitted' && values.submitted !== true) throw Error('Submitted requires submitted=true');
  if (to !== 'submitted' && values.submitted === true) throw Error('Only submitted state may set submitted=true');
}

export const leadStates = Object.freeze(Object.keys(allowed));
