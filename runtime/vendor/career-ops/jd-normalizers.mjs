// Adapted from career-ops browser-extract.mjs, MIT; see LICENSE and provenance.json.
import {htmlToText as jdHtmlToText} from './providers/_html-to-text.mjs';
import {isWorkModelOnly} from './providers/greenhouse.mjs';
const JD_TEXT_CAP = Number.MAX_SAFE_INTEGER;
const compactText = (value, cap) => String(value||'').trim().slice(0, cap);
export function normalizeWorkdayJob(json, postingUrl, textCap = JD_TEXT_CAP) {
  const info = json && typeof json === 'object' ? json.jobPostingInfo : null;
  if (!info || typeof info !== 'object') return null;

  const body = jdHtmlToText(info.jobDescription);
  if (!body) return null;

  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const locations = [
    str(info.location),
    ...(Array.isArray(info.additionalLocations) ? info.additionalLocations.map(str) : []),
  ].filter(Boolean);

  const meta = [];
  if (locations.length) meta.push(`Location: ${locations.join(' | ')}`);
  if (str(info.timeType)) meta.push(`Job type: ${str(info.timeType)}`);
  if (str(info.postedOn)) meta.push(`Posted: ${str(info.postedOn)}`);
  if (str(info.jobReqId)) meta.push(`Req ID: ${str(info.jobReqId)}`);
  if (info.canApply === false) meta.push('Applications closed (canApply: false)');

  return {
    url: postingUrl,
    title: compactText(str(info.title), 300),
    text: compactText([meta.join('\n'), body].filter(Boolean).join('\n\n'), textCap),
  };
}

export function normalizeAshbyJob(json, jobId, postingUrl, textCap = JD_TEXT_CAP) {
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  const target = String(jobId ?? '').toLowerCase();
  const job = jobs.find((j) => typeof j?.id === 'string' && j.id.toLowerCase() === target);
  if (!job) return null;

  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const body = str(job.descriptionPlain);
  if (!body) return null;

  const meta = [];
  if (str(job.location)) meta.push(`Location: ${str(job.location)}`);
  if (Array.isArray(job.secondaryLocations)) {
    const extra = job.secondaryLocations.map((l) => str(l?.location)).filter(Boolean);
    if (extra.length) meta.push(`Additional locations: ${extra.join(' | ')}`);
  }
  if (str(job.employmentType)) meta.push(`Type: ${str(job.employmentType)}`);
  // Remote work model, same precedence providers/ashby.mjs:160 settled on:
  // `workplaceType` wins whenever present and `isRemote` is only the fallback.
  // The two disagree constantly — 52 of 60 sampled ramp postings carry
  // `isRemote: true` beside `workplaceType: "Hybrid"` — so trusting isRemote
  // alone labels office-anchored roles Remote. The fallback still earns its
  // place: `workplaceType` is absent on 41 of 60 sampled openai postings.
  const workplaceType = str(job.workplaceType);
  if (workplaceType) meta.push(`Work model: ${workplaceType}`);
  else if (job.isRemote === true) meta.push('Work model: Remote');
  if (job.isListed === false) meta.push('Not currently listed (isListed: false)');

  return {
    url: postingUrl,
    title: compactText(str(job.title), 300),
    text: compactText([meta.join('\n'), body].filter(Boolean).join('\n\n'), textCap),
  };
}

export function normalizeGreenhouseJob(json, postingUrl, textCap = JD_TEXT_CAP) {
  const body = jdHtmlToText(json?.content);
  if (!body) return null;

  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const meta = [];
  const offices = Array.isArray(json?.offices) ? json.offices.map((o) => str(o?.name)).filter(Boolean) : [];
  let location = str(json?.location?.name);
  if (offices.length && (!location || isWorkModelOnly(location))) {
    location = [location, ...offices].filter(Boolean).join(' · ');
  }
  if (location) meta.push(`Location: ${location}`);
  if (str(json?.requisition_id)) meta.push(`Req ID: ${str(json.requisition_id)}`);

  return {
    url: postingUrl,
    title: compactText(str(json?.title), 300),
    text: compactText([meta.join('\n'), body].filter(Boolean).join('\n\n'), textCap),
  };
}

export function normalizeLeverJob(json, postingUrl, textCap = JD_TEXT_CAP) {
  if (!json || typeof json !== 'object') return null;

  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const lists = Array.isArray(json.lists)
    ? json.lists
        .map((l) => {
          const heading = str(l?.text);
          const content = jdHtmlToText(l?.content);
          return content ? `${heading ? `${heading}\n` : ''}${content}` : '';
        })
        .filter(Boolean)
        .join('\n\n')
    : '';
  const body = [str(json.descriptionPlain), lists, str(json.additionalPlain)].filter(Boolean).join('\n\n');
  if (!body) return null;

  const meta = [];
  if (str(json?.categories?.location)) meta.push(`Location: ${str(json.categories.location)}`);
  if (str(json?.categories?.team)) meta.push(`Team: ${str(json.categories.team)}`);

  return {
    url: postingUrl,
    title: compactText(str(json.text), 300),
    text: compactText([meta.join('\n'), body].filter(Boolean).join('\n\n'), textCap),
  };
}

export function normalizeSmartRecruitersJob(json, postingUrl, textCap = JD_TEXT_CAP) {
  const sections = json?.jobAd?.sections;
  if (!sections || typeof sections !== 'object') return null;

  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const blocks = ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation']
    .map((key) => {
      const body = jdHtmlToText(sections[key]?.text);
      return body ? [str(sections[key]?.title), body].filter(Boolean).join('\n') : '';
    })
    .filter(Boolean);
  if (!blocks.length) return null;

  const loc = json?.location || {};
  const meta = [];
  const where = str(loc.fullLocation) || [str(loc.city), str(loc.country)].filter(Boolean).join(', ');
  if (where) meta.push(`Location: ${where}`);
  if (loc.remote === true) meta.push('Work model: Remote');
  else if (loc.hybrid === true) meta.push('Work model: Hybrid');

  return {
    url: postingUrl,
    title: compactText(str(json?.name), 300),
    text: compactText([meta.join('\n'), ...blocks].filter(Boolean).join('\n\n'), textCap),
  };
}
