// The résumé intake (ENG-09, D88, D89): `npm run resume:prepare`. It takes the two raw résumés
// from private/resumes/raw/<id>.pdf, runs the pipeline's scan (steps 3–4), metadata clean (6) and
// size check (7) on them, and writes private/resumes/<id>.pdf. Both are written, or neither.
// It writes nothing inside the repo: the résumés keep the phone number and never go to git.
//
// A résumé differs from a cohort PDF in three ways: its page text may hold Aditya's own number
// (phone.txt), the "we" rule does not apply, and the clean file's Title is "Aditya Gupta".
import { copyFileSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vf04 from '../verify/rules/vf-04.mjs';
import { ownPhone } from '../verify/lib/private.mjs';
import { writeManifest } from '../../versions/resume.mjs';
import {
  AUTHOR,
  checkClean,
  cleanMetadata,
  loadAllow,
  loadNames,
  scanPdf,
  writeOutputs,
} from './pipeline.mjs';

export const RESUME_IDS = ['payments', 'consumer'];
// 1 MB, decimal (ERD § Résumés). A résumé is text; a bigger file carries something else.
export const RESUME_MAX_BYTES = 1_000_000;

/**
 * Returns { findings, notes, files }. Any finding means nothing was written. A step runs only when
 * the steps before it found nothing, as in prepare().
 */
export function prepareResumes({
  privateDir,
  allowFile,
  workDir,
  ids = RESUME_IDS,
  maxBytes = RESUME_MAX_BYTES,
}) {
  const findings = [];
  const notes = [];
  const files = [];
  const loaded = loadNames(privateDir);
  if (loaded.stop) return { findings: loaded.findings, notes, files };
  findings.push(...loaded.findings);
  const { names, nameWords } = loaded;
  const shared = loadAllow(allowFile);
  // D91: what only the résumés may hold (Aditya's own address, LinkedIn). It lives in the private
  // folder, so the address never enters the public repo. No file means no extras.
  const extraFile = join(privateDir, 'resumes', 'allow.json');
  const extra = lstatSync(extraFile, { throwIfNoEntry: false })?.isFile()
    ? loadAllow(extraFile)
    : { domains: [], emails: [], urls: [] };
  const allow = {
    domains: [...shared.domains, ...extra.domains],
    emails: [...shared.emails, ...extra.emails],
    urls: [...shared.urls, ...extra.urls],
  };
  const phone = ownPhone(privateDir);
  if (phone === null) {
    notes.push({
      step: 4,
      check: 'phone',
      file: 'phone.txt',
      message: 'is missing or has fewer than 10 digits, so a phone number in a résumé will fail',
    });
  }
  const scan = { names, nameWords, allow, resume: { ownPhone: phone } };

  // Step 1: the two raw files, and nothing else (a dot-file is ignored).
  const rawDir = join(privateDir, 'resumes', 'raw');
  const rel = (id) => `resumes/raw/${id}.pdf`;
  const present = lstatSync(rawDir, { throwIfNoEntry: false })?.isDirectory()
    ? readdirSync(rawDir).filter((n) => !n.startsWith('.'))
    : null;
  if (present === null) {
    findings.push({
      step: 1,
      check: 'input',
      file: 'resumes/raw/',
      message: 'the folder is missing, so there are no résumés to check',
      fix: `put ${ids.map((i) => `${i}.pdf`).join(' and ')} in ${rawDir}`,
    });
    return { findings, notes, files };
  }
  for (const n of present.filter((n) => !ids.some((id) => n === `${id}.pdf`))) {
    findings.push({
      step: 1,
      check: 'input',
      file: `resumes/raw/${n}`,
      message: 'is not one of the expected résumé files',
      fix: `remove it: only ${ids.map((i) => `${i}.pdf`).join(' and ')} belong there`,
    });
  }
  for (const id of ids) {
    const raw = join(rawDir, `${id}.pdf`);
    const entry = lstatSync(raw, { throwIfNoEntry: false });
    if (!entry) {
      findings.push({
        step: 1,
        check: 'input',
        file: rel(id),
        message: 'is missing',
        fix: `put the ${id} résumé (a text-based PDF) at ${raw}`,
      });
    } else if (!entry.isFile()) {
      findings.push({
        step: 1,
        check: 'input',
        file: rel(id),
        message: 'is a link or a folder, not a file',
        fix: 'copy the real PDF file there',
      });
    } else {
      copyFileSync(raw, join(workDir, `${id}.pdf`));
      files.push({ id, source: rel(id) });
    }
  }
  if (findings.length > 0) return { findings, notes, files };

  // Steps 3–4.
  for (const f of files) {
    const r = scanPdf(workDir, `${f.id}.pdf`, f.source, scan);
    findings.push(...r.findings);
    notes.push(...r.notes);
    f.pages = r.pages;
  }
  if (findings.length > 0) return { findings, notes, files };

  // Step 6: the clean copy, then the checks on it.
  for (const f of files) {
    try {
      const { path, warnings } = cleanMetadata(join(workDir, `${f.id}.pdf`), f.id, workDir, AUTHOR);
      f.clean = path;
      if (warnings > 0) {
        notes.push({
          step: 6,
          check: 'clean',
          file: f.source,
          message: `qpdf repaired ${warnings} problem(s) in the file (exit 3); the checks below ran on the result`,
        });
      }
    } catch (err) {
      findings.push({
        step: 6,
        check: 'clean',
        file: f.source,
        message: err.message,
        fix: 'see the message',
      });
    }
  }
  if (findings.length === 0) findings.push(...checkClean(workDir, files, scan));
  if (findings.length > 0) return { findings, notes, files };

  // Step 7 (1 MB), and VF-04 on the file under the name it ships with: only "Aditya Gupta" is
  // allowed in a résumé's metadata.
  for (const f of files) {
    const dir = join(workDir, 'final', f.id);
    mkdirSync(dir, { recursive: true });
    copyFileSync(f.clean, join(dir, 'Aditya-Gupta-Resume.pdf'));
    for (const g of vf04.run({ root: dir, distDir: dir })) {
      findings.push({ step: 7, check: g.check, file: f.source, message: g.message, fix: g.fix });
    }
  }
  for (const f of files) {
    f.bytes = lstatSync(f.clean).size;
    if (f.bytes > maxBytes) {
      findings.push({
        step: 7,
        check: 'size',
        file: f.source,
        message: `is ${(f.bytes / 1_000_000).toFixed(2)} MB after cleaning; the limit is ${(maxBytes / 1_000_000).toFixed(1)} MB`,
        fix: 'export the résumé again without images or embedded fonts it does not need',
      });
    }
  }
  if (findings.length === 0) {
    writeOutputs(files, join(privateDir, 'resumes'));
    writeManifest(privateDir, ids);
  }
  return { findings, notes, files };
}
