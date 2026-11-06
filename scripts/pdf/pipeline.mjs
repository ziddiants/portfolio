// The cohort PDF pipeline, steps 1–9 (ENG-08; ERD § Assets, PDF pipeline). It reads the three
// cohort files from .inputs/ (git-ignored), turns a DOCX into a PDF, scans every PDF, cleans its
// metadata, checks its size, lists the pages with images for the eye check, and only then writes
// all three to public/case-studies/. One finding anywhere means nothing is written.
//
// A finding never prints what it protects: a name shows as its names.txt line, a phone number as
// its last two digits, an email address or a link as its domain only, a metadata value as its
// field name only.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { privateLines, privateState } from '../verify/lib/private.mjs';
import {
  MIN_LETTERS,
  pdfAttachments,
  pdfDicts,
  pdfImagePages,
  pdfInfo,
  pdfJpegMetadata,
  pdfLinks,
  pdfPages,
  pdfRaw,
  pdfStrings,
  pdfText,
} from '../verify/lib/pdf.mjs';
import { fold, snippet } from '../verify/lib/text.mjs';
import { phonesIn } from '../verify/rules/vf-01.mjs';
import { key, nameMatchers } from '../verify/rules/vf-02.mjs';
import vf04, { STANDARD } from '../verify/rules/vf-04.mjs';

/** The three cohort files (build-plan line 288). Vendrax and Skooling may come as a DOCX (D86). */
export const PROJECTS = [
  { id: 'Vendrax', pdf: 'Vendrax.pdf', docx: 'Vendrax.docx' },
  { id: 'Skooling', pdf: 'Skooling-PRD.pdf', docx: 'Skooling-PRD.docx' },
  { id: 'NyaySetu', pdf: 'NyaySetu_PRD.pdf' },
];

// ── Step 1: take inputs ─────────────────────────────────────────────────────────────────────

/**
 * The input file for each project, or findings. A missing project, a project given as both PDF
 * and DOCX, and any file that is not on the list stop the run: a stray file must neither ship nor
 * be skipped without a word. Dot-files (.DS_Store) are Finder's, not inputs, and are ignored.
 */
export function collectInputs(inputsDir) {
  const findings = [];
  const fail = (file, message, fix) =>
    findings.push({ step: 1, check: 'inputs', file, message, fix });
  if (!existsSync(inputsDir) || !lstatSync(inputsDir).isDirectory()) {
    fail(
      '',
      `there is no inputs folder at ${inputsDir}`,
      'create .inputs/ and put the three cohort files in it',
    );
    return { inputs: [], findings };
  }
  const names = readdirSync(inputsDir).filter((n) => !n.startsWith('.'));
  const known = new Set(PROJECTS.flatMap((p) => [p.pdf, p.docx].filter(Boolean)));
  for (const n of names.filter((n) => !known.has(n)).sort()) {
    fail(
      n,
      'is not one of the cohort files',
      `remove it, or name it as one of: ${[...known].join(', ')}`,
    );
  }
  const inputs = [];
  for (const p of PROJECTS) {
    const given = [p.pdf, p.docx].filter((n) => n && names.includes(n));
    if (given.length === 0) {
      fail(
        p.pdf,
        `is missing (${p.id})`,
        `put ${[p.pdf, p.docx].filter(Boolean).join(' or ')} in .inputs/`,
      );
    } else if (given.length > 1) {
      fail(given.join(' + '), `are both given for ${p.id}`, 'keep only one of them');
    } else if (!lstatSync(join(inputsDir, given[0])).isFile()) {
      fail(
        given[0],
        'is not a plain file',
        'put the file itself in .inputs/, not a folder or a link',
      );
    } else {
      inputs.push({
        id: p.id,
        source: given[0],
        kind: given[0].endsWith('.docx') ? 'docx' : 'pdf',
      });
    }
  }
  return { inputs, findings };
}

// ── Step 2: convert a DOCX ──────────────────────────────────────────────────────────────────

/**
 * Puts the input into workDir as <id>.pdf: a PDF is copied, a DOCX is converted with LibreOffice.
 * soffice can exit 0 and write nothing (for example when its profile is locked by an open
 * LibreOffice), so the output file is checked, not the exit code alone. A profile of its own in
 * workDir keeps it apart from a LibreOffice the user has open.
 */
export function toPdf(input, inputsDir, workDir) {
  const out = join(workDir, `${input.id}.pdf`);
  if (input.kind === 'pdf') {
    copyFileSync(join(inputsDir, input.source), out);
    return out;
  }
  const convDir = join(workDir, 'soffice-out');
  const r = spawnSync(
    'soffice',
    [
      `-env:UserInstallation=${pathToFileURL(join(workDir, 'soffice-profile')).href}`,
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      convDir,
      join(inputsDir, input.source),
    ],
    { encoding: 'utf8', timeout: 180_000 },
  );
  if (r.error?.code === 'ENOENT') {
    throw new Error(
      'soffice is not installed, so the DOCX cannot be converted (brew install --cask libreoffice)',
    );
  }
  const made = join(convDir, input.source.replace(/\.docx$/, '.pdf'));
  if (r.error || r.status !== 0 || !existsSync(made)) {
    throw new Error(
      `soffice did not convert ${input.source} (exit ${r.status ?? r.error?.code}); ` +
        'close LibreOffice and run again, or export the PDF yourself',
    );
  }
  copyFileSync(made, out);
  return out;
}

// ── Step 4 helpers: email addresses and links ───────────────────────────────────────────────

// Domains that can never reach a real person (RFC 2606, RFC 6761): demo data may use them.
const RESERVED_TLDS = new Set(['test', 'example', 'invalid', 'localhost']);
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'];
const under = (host, domain) => host === domain || host.endsWith(`.${domain}`);
export const isReserved = (host) =>
  RESERVED_TLDS.has(host.split('.').at(-1)) || RESERVED_DOMAINS.some((d) => under(host, d));

const EMAIL = /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,24})\b/g;
// A link with a scheme, a www. address, or a bare host followed by a path ("docs.google.com/…").
const URL_IN_TEXT =
  /\b(?:https?:\/\/|www\.)[^\s<>"'()[\]{}]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,24}\/[^\s<>"'()[\]{}]*/gi;

/**
 * The host of a link, lower case, without a scheme, a port or a trailing dot. A backslash ends
 * the host too, because browsers read it as "/": "https://evil.zz\\.docs.google.com/" goes to
 * evil.zz (cold review, ENG-08).
 */
export function hostOf(url) {
  const rest = url.replace(/^[a-z][a-z0-9+.-]*:[/\\]{2}/i, '');
  return rest
    .split(/[/\\?#:]/)[0]
    .toLowerCase()
    .replace(/\.+$/, '');
}

/**
 * The allowlist (scripts/pdf/allow.json): link domains (subdomains included), exact links, and
 * exact email addresses that may stay in a published PDF. It is the one reviewed place for
 * exceptions; there is no inline skip. A host with user content (a Google Doc, a Claude chat)
 * goes in `urls`, never in `domains`: a whole domain would let any private doc through (D87).
 */
export function loadAllow(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const list = (name) => {
    const v = raw[name];
    if (
      !Array.isArray(v) ||
      v.some((d) => typeof d !== 'string' || d !== d.trim().toLowerCase() || !d)
    ) {
      throw new Error(`${file}: "${name}" must be a list of lower-case strings`);
    }
    return v;
  };
  const allow = { domains: list('domains'), emails: list('emails'), urls: raw.urls ?? [] };
  if (
    !Array.isArray(allow.urls) ||
    allow.urls.some((u) => typeof u !== 'string' || !/^https:\/\/[^\s/]+\/\S*$/.test(u))
  ) {
    throw new Error(`${file}: "urls" must be a list of full https:// links with no spaces`);
  }
  const bad = allow.domains.find((d) => d.includes('/') || d.includes(':'));
  if (bad !== undefined)
    throw new Error(`${file}: "${bad}" must be a bare domain, without a scheme or a path`);
  return allow;
}

const domainAllowed = (host, allow) =>
  isReserved(host) || allow.domains.some((d) => under(host, d));
// A link passes when its domain is allowed, or when it is one of the exact links. A link found
// in the text can end in a full stop or a comma from the sentence; that does not count.
const linkAllowed = (url, allow) =>
  domainAllowed(hostOf(url), allow) || allow.urls.includes(url.replace(/[.,;:!?]+$/, ''));

// ── Step 5: the "we" rule ───────────────────────────────────────────────────────────────────

// Research the team ran must say "we" (PRD T1). A sentence in the first person singular near one
// of these words claims that research for one person, so it stops the run. A "we" sentence near
// them is listed for information only.
const RESEARCH =
  /\b(?:interview(?:s|ed|ing)?|survey(?:s|ed|ing)?|spoke to|speak(?:ing)? to|talked to|tested|research(?:ed|ing)?)\b/i;
// A pronoun counts only as a word on its own: "me" in "docs/grill-me" or "I" in "Phase-I" does not.
const word = (alternatives, flags = 'u') =>
  new RegExp(`(?<![\\p{L}\\p{N}/_-])(?:${alternatives})(?![\\p{L}\\p{N}/_-])`, flags);
const SINGULAR = [word('I'), word('me|my|mine|myself|Me|My|Mine|Myself')];
const PLURAL = word('[Ww]e|[Oo]urs?|us|[Oo]urselves');

/** A page's text as sentences: split at a full stop, a blank line or a bullet. */
export function sentences(pageText) {
  return pageText
    .split(/(?<=[.!?])\s+(?=\S)|\n\s*\n|[•●▪◦]/)
    .map((s) => fold(s))
    .filter((s) => /\p{L}/u.test(s));
}

const JOINED = Symbol('joined text');

// Actions that run code, open a file or another document, or send data: none belongs in a PRD.
const ACTIONS = new Set([
  '/JavaScript',
  '/Launch',
  '/GoToR',
  '/GoToE',
  '/ImportData',
  '/SubmitForm',
  '/ResetForm',
  '/Rendition',
  '/Movie',
  '/Sound',
  '/RichMediaExecute',
]);

// ── Steps 3–5: scan one PDF ─────────────────────────────────────────────────────────────────

/**
 * Every finding (stops the run) and note (information) for one PDF in workDir.
 * `names` is the result of nameMatchers(); `nameWords` the set of words of names.txt, used to
 * mask a sentence before it is printed.
 * `resume` is set for a résumé (ENG-09, D88): its page text may hold the number `resume.ownPhone`
 * (last 10 digits, or null for none), and the "we" rule (step 5) does not apply to it. Links,
 * strings, metadata and any other number are scanned as for every file.
 */
export function scanPdf(workDir, file, source, { names, nameWords, allow, resume = null }) {
  const ctx = { distDir: workDir };
  const findings = [];
  const notes = [];
  const seen = new Set(); // check|key|page: one finding per thing per page
  const found = new Set(); // check|key: what any pass has found, on any page
  const add = (step, check, page, k, message, fix) => {
    // JOINED marks a pass with no page (the whole text joined, or a string outside the page
    // text): it adds only what no single page held.
    if (page === JOINED && found.has(`${check}|${k}`)) return;
    const at = page === JOINED ? undefined : page;
    if (seen.has(`${check}|${k}|${at ?? ''}`)) return;
    seen.add(`${check}|${k}|${at ?? ''}`);
    found.add(`${check}|${k}`);
    findings.push({ step, check, file: source, page: at, message, fix });
  };

  // Step 3: a PDF with no text layer cannot be scanned. Any reader error stops this file.
  let pages;
  try {
    pdfText(ctx, file);
    pages = pdfPages(ctx, file);
  } catch (err) {
    findings.push({
      step: 3,
      check: 'text',
      file: source,
      message: `cannot be scanned: ${err.message}`,
      fix: 'export the PDF again with real text (not an image), then run this again',
    });
    return { findings, notes, pages: 0 };
  }
  // The floor holds per page, not only per file: one real page must not let 24 pages of text
  // drawn as shapes or pictures pass unscanned (cold review, ENG-08).
  pages.forEach((text, i) => {
    const letters = (text.match(/\p{L}/gu) ?? []).length;
    if (letters < MIN_LETTERS) {
      add(
        3,
        'text',
        i + 1,
        't',
        `has almost no readable text (${letters} letters), so its text cannot be scanned`,
        'export it again with real text; if the page is only a picture, ask Aditya to check it by eye and decide',
      );
    }
  });

  // A message never shows a value that holds a name, a phone number or an email address: a
  // host such as "kelvarodunn.example" would print what the names finding hides.
  const holdsPrivate = (t) =>
    names.entries.some((e) => e.re.test(key(t))) ||
    phonesIn(t).length > 0 ||
    /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(t);
  const shown = (t, what) => (holdsPrivate(t) ? `a ${what} that holds a name or a number` : t);

  const NAME_FIX = 'remove it in the source document, export the PDF again, and run this again';
  const scanText = (text, page, pageText = false) => {
    const hay = key(text);
    for (const e of names.entries) {
      if (e.re.test(hay))
        add(
          4,
          'names',
          page,
          `n${e.line}`,
          `holds the name or label on names.txt line ${e.line}`,
          NAME_FIX,
        );
    }
    for (const p of phonesIn(text, pageText ? (resume?.ownPhone ?? null) : null)) {
      add(
        4,
        'phone',
        page,
        `p${p.key}`,
        p.message,
        'remove the number in the source document: no phone number may appear (N7)',
      );
    }
    for (const m of text.matchAll(EMAIL)) {
      const address = m[0].toLowerCase();
      const domain = m[1].toLowerCase();
      if (isReserved(domain) || allow.emails.includes(address)) continue;
      add(
        4,
        'email',
        page,
        `e${address}`,
        `holds an email address at ${shown(domain, 'domain')} that is not on the allowlist`,
        "remove it in the source document, or add the exact address to scripts/pdf/allow.json with Aditya's approval",
      );
    }
    for (const m of text.matchAll(URL_IN_TEXT)) {
      const host = hostOf(m[0]);
      if (linkAllowed(m[0], allow)) continue;
      add(
        4,
        'link',
        page,
        `u${host}`,
        `holds a link to ${shown(host, 'host')}, which is not on the allowlist`,
        "remove it in the source document, or add the domain to scripts/pdf/allow.json with Aditya's approval",
      );
    }
    // A Google Docs or Word comment printed into the page ("Commented [1]: …").
    if (/\bCommented \[[^\]\n]{1,12}\]/.test(text)) {
      add(
        4,
        'comment',
        page,
        'c',
        'holds a comment printed into the page',
        'delete or resolve the comments in the source document, export the PDF again, and run this again',
      );
    }
  };

  pages.forEach((text, i) => scanText(text, i + 1, true));
  // A name or a number split across a page break reads as one in the joined text.
  scanText(pages.join('\n'), JOINED, true);

  // Link annotations: a link's target has no visible text. A reader error is a finding: the
  // links are then unchecked, so the file must not pass.
  let links = [];
  try {
    links = pdfLinks(ctx, file);
  } catch (err) {
    findings.push({
      step: 4,
      check: 'links',
      file: source,
      message: `cannot be scanned: ${err.message}`,
      fix: 'export the PDF again from the source document, then run this again',
    });
  }
  for (const { page, url } of links) {
    if (/^mailto:/i.test(url)) {
      scanText(url.replace(/^mailto:/i, '').split('?')[0], page);
    } else if (/^https?:\/\//i.test(url)) {
      const host = hostOf(url);
      if (!linkAllowed(url, allow)) {
        add(
          4,
          'link',
          page,
          `u${host}`,
          `has a link to ${shown(host, 'host')}, which is not on the allowlist`,
          "remove the link in the source document, or add the domain to scripts/pdf/allow.json with Aditya's approval",
        );
      }
      scanText(url, page); // a name or a number inside the address
    } else {
      scanText(url, page);
      const scheme = (/^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1] ?? 'unknown').toLowerCase();
      if (scheme !== 'tel') {
        add(
          4,
          'link',
          page,
          `s${scheme}`,
          `has a ${scheme}: link`,
          'remove the link in the source document',
        );
      }
    }
  }

  // Every other string in the file: bookmark titles, annotation /Contents and /T, alternate
  // text, file paths. pdftotext reads none of them. As JOINED, each adds only what no page showed.
  let strings = [];
  let dicts = [];
  try {
    strings = pdfStrings(ctx, file);
    dicts = pdfDicts(ctx, file);
  } catch (err) {
    findings.push({
      step: 4,
      check: 'strings',
      file: source,
      message: `cannot be scanned: ${err.message}`,
      fix: 'export the PDF again from the source document, then run this again',
    });
  }
  for (const s of strings) scanText(s, JOINED);

  // Parts of the format no scan above can read, from qpdf's objects (names decoded, so
  // "/#4Caunch" reads "/Launch"). None of them belongs in a published PRD, so each stops the run.
  const EXPORT = 'export the PDF again from the source document, without it';
  for (const d of dicts) {
    const sub = d['/Subtype'];
    // An annotation has a /Rect. Only links may stay: a comment, a mark-up, a stamp, a shape or a
    // form field can hold a reviewer's name or a private note.
    if (d['/Rect'] && typeof sub === 'string' && sub !== '/Link') {
      add(4, 'comment', undefined, `a${sub}`, `holds a ${sub.slice(1)} annotation`, EXPORT);
    }
    if (ACTIONS.has(d['/S']) || '/JS' in d) {
      const action = (ACTIONS.has(d['/S']) ? d['/S'] : '/JavaScript').slice(1);
      add(4, 'active', undefined, `s${action}`, `holds a ${action} action`, EXPORT);
    }
    if ('/EmbeddedFiles' in d || '/EF' in d || d['/Type'] === '/EmbeddedFile') {
      add(4, 'active', undefined, 'att', 'holds an embedded file', EXPORT);
    }
    if ('/OCProperties' in d) {
      // A layer switched off hides its text from pdftotext, but a viewer can switch it on.
      add(
        4,
        'hidden',
        undefined,
        'ocg',
        'holds layers (optional content) that can hide text',
        EXPORT,
      );
    }
    if ('/AcroForm' in d || '/XFA' in d) {
      add(4, 'active', undefined, 'form', 'holds a form (AcroForm)', EXPORT);
    }
  }
  // Backstops from poppler, which reads the file on its own.
  const info = pdfInfo(ctx, file);
  if (pdfAttachments(ctx, file) > 0) {
    add(4, 'active', undefined, 'att', 'holds an embedded file', EXPORT);
  }
  if (info.JavaScript === 'yes') {
    add(4, 'active', undefined, 'sJavaScript', 'holds a JavaScript action', EXPORT);
  }
  if (info.Form && info.Form !== 'none') {
    add(4, 'active', undefined, 'form', `holds a form (${info.Form})`, EXPORT);
  }

  // Metadata inside the images: exiftool -all= cleans the PDF's own metadata, not the EXIF, IPTC
  // or comment of a JPEG stored in it (an owner name, a camera serial, a GPS position).
  try {
    for (const { page, marker } of pdfJpegMetadata(ctx, file)) {
      add(
        4,
        'image-meta',
        page,
        `j${marker}`,
        `holds an image with ${marker} metadata, which can name its owner or the place it was taken`,
        'remove the metadata from the image in the source (for example take a screenshot of it), export again, run again',
      );
    }
  } catch (err) {
    findings.push({
      step: 4,
      check: 'image-meta',
      file: source,
      message: `cannot be scanned: ${err.message}`,
      fix: 'see the message',
    });
  }

  // Step 5: the "we" rule (cohort PDFs only: a résumé is first person by nature).
  const mask = (s) =>
    s.replace(/[\p{L}][\p{L}'’-]*/gu, (w) => (nameWords.has(key(w)) ? '[NAME]' : w));
  pages.forEach((text, i) => {
    if (resume) return;
    for (const s of sentences(text)) {
      if (!RESEARCH.test(s)) continue;
      const said = holdsPrivate(s)
        ? '(the sentence is not shown: it holds a name, a number or an address)'
        : `"${snippet(mask(s), 90)}"`;
      if (SINGULAR.some((re) => re.test(s))) {
        add(
          5,
          'we-rule',
          i + 1,
          `w${s}`,
          `says "I" about research: ${said}`,
          'research the team ran says "we" (PRD T1): change it in the source document, export again, run again',
        );
      } else if (PLURAL.test(s)) {
        notes.push({
          step: 5,
          check: 'we-rule',
          file: source,
          page: i + 1,
          message: `says "we" about research (correct when the team did it): ${said}`,
        });
      }
    }
  });

  return { findings, notes, pages: pages.length };
}

// ── Step 6: clean metadata ──────────────────────────────────────────────────────────────────

export const AUTHOR = 'Aditya Gupta';

/** Runs a system tool; a missing tool throws with the install line. */
function tool(cmd, args, install) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 180_000 });
  if (r.error?.code === 'ENOENT') {
    throw new Error(`${cmd} is not installed, so the metadata cannot be cleaned (${install})`);
  }
  return r;
}

// The trailer keys a clean file keeps; qpdf writes a new /ID itself. Any other key goes: no scan
// reads the trailer, and LibreOffice's /DocChecksum changes on every export, so it would make
// every run's bytes differ (TC-D08, plan review C4).
const TRAILER_KEYS = new Set(['/Root', '/Info', '/Size']);

/**
 * Writes workDir/clean/<id>.pdf with Title `title` (default <id>), Author "Aditya Gupta" and no other metadata.
 * exiftool removes every tag and writes the two fields into the Info dictionary in one pass, but
 * a PDF edit by exiftool only appends a new revision: the old values stay in the bytes. qpdf then
 * rewrites the file from the objects in use, so the old revision is gone, and keeps only the
 * TRAILER_KEYS in the trailer (read as JSON, given back with --update-from-json).
 * --deterministic-id makes the ID from the content, so two runs give the same bytes (C3, C4).
 * Returns { path, warnings }: qpdf exit 3 means it wrote the file but repaired something; the
 * checks in checkClean() decide whether the result is good. Tool output is never printed: it can
 * quote a metadata value.
 */
export function cleanMetadata(file, id, workDir, title = id) {
  const stripped = join(workDir, 'exif', `${id}.pdf`);
  const out = join(workDir, 'clean', `${id}.pdf`);
  mkdirSync(join(workDir, 'exif'), { recursive: true });
  mkdirSync(join(workDir, 'clean'), { recursive: true });
  rmSync(stripped, { force: true }); // exiftool -o refuses to overwrite a file
  rmSync(out, { force: true });
  const ex = tool(
    'exiftool',
    ['-q', '-q', '-all=', `-PDF:Title=${title}`, `-PDF:Author=${AUTHOR}`, '-o', stripped, file],
    'brew install exiftool',
  );
  // Checked by the output file too: a tool can exit 0 and write nothing.
  if (ex.error || ex.status !== 0 || !existsSync(stripped)) {
    throw new Error(`exiftool did not clean the metadata (exit ${ex.status ?? ex.error?.code})`);
  }
  const t = tool(
    'qpdf',
    ['--json-output', '--json-object=trailer', stripped, '-'],
    'brew install qpdf',
  );
  let json;
  try {
    if (t.error || ![0, 3].includes(t.status)) throw new Error();
    json = JSON.parse(t.stdout);
    const trailer = json.qpdf[1].trailer.value;
    json.qpdf[1].trailer.value = Object.fromEntries(
      Object.entries(trailer).filter(([k]) => TRAILER_KEYS.has(k)),
    );
  } catch {
    throw new Error(`qpdf could not read the trailer (exit ${t.status ?? t.error?.code})`);
  }
  const trailerFile = join(workDir, 'exif', `${id}.trailer.json`);
  writeFileSync(trailerFile, JSON.stringify(json));
  const q = tool(
    'qpdf',
    ['--deterministic-id', `--update-from-json=${trailerFile}`, stripped, out],
    'brew install qpdf',
  );
  if (q.error || ![0, 3].includes(q.status) || !existsSync(out)) {
    throw new Error(`qpdf did not rewrite the file (exit ${q.status ?? q.error?.code})`);
  }
  const warnings = q.status === 3 ? (q.stderr.match(/^WARNING/gim) ?? []).length || 1 : 0;
  return { path: out, warnings };
}

/** The forms a word can take in PDF bytes: plain, UTF-16BE, and both as hex, lower case. */
const byteForms = (w) => {
  const be = Buffer.from(w, 'utf16le').swap16();
  return [
    w,
    be.toString('latin1'),
    be.toString('hex'),
    Buffer.from(w, 'latin1').toString('hex'),
  ].map((s) => s.toLowerCase());
};

/**
 * Whether the bytes hold a word, in one of its forms from byteForms(). The plain form does not
 * count when a "/" comes right before it: that is a PDF name such as /Pages, not a value. (A
 * Creator of "Pages" is a real case, ENG-09.) A value starts after "(", a space or a quote.
 */
function holdsWord(hay, [plain, ...others]) {
  if (others.some((s) => hay.includes(s))) return true;
  for (let i = hay.indexOf(plain); i !== -1; i = hay.indexOf(plain, i + 1)) {
    if (hay[i - 1] !== '/') return true;
  }
  return false;
}

/**
 * Checks the files in workDir/clean/ after step 6. VF-04 runs on them as it runs on the site.
 * Then every word (4+ letters) of each old metadata value is searched for in the raw and inflated
 * bytes, as text, UTF-16 and hex: pdfinfo reads only the newest revision, so it cannot see an old
 * value left behind. A word that is also in the page text, in "Aditya Gupta" or in the project
 * name is skipped, because it is allowed to be there. The page count must not change. Last,
 * steps 3–4 run again on the clean file: those are the bytes that ship, and a rewrite that
 * repaired the file (qpdf exit 3) can read objects the first scan did not. `scan` holds the
 * scanPdf() options.
 */
export function checkClean(workDir, files, scan) {
  const findings = [];
  const cleanDir = join(workDir, 'clean');
  const cleanCtx = { root: cleanDir, distDir: cleanDir };
  const byId = new Map(files.map((f) => [`${f.id}.pdf`, f]));
  for (const f of vf04.run(cleanCtx)) {
    findings.push({
      step: 6,
      check: f.check,
      file: byId.get(f.file)?.source ?? f.file,
      message: `after cleaning, ${f.message}`,
      fix: 'export the PDF again from the source document, then run this again',
    });
  }
  const workCtx = { root: workDir, distDir: workDir };
  for (const f of files) {
    const name = `${f.id}.pdf`;
    const old = pdfInfo(workCtx, name);
    const fail = (message) =>
      findings.push({
        step: 6,
        check: 'clean',
        file: f.source,
        message,
        fix: 'check that qpdf rewrote the file (prepare.mjs step 6), then run this again',
      });
    if (pdfInfo(cleanCtx, name).Pages !== old.Pages) {
      fail(`has ${pdfInfo(cleanCtx, name).Pages} pages after cleaning, not ${old.Pages}`);
    }
    const hay = pdfRaw(cleanCtx, name).toLowerCase();
    const allowed = new Set(
      key(`${AUTHOR} ${f.id} ${pdfPages(cleanCtx, name).join(' ')}`).split(' '),
    );
    const fields = [
      ...['Title', 'Subject', 'Keywords', 'Author', 'Creator', 'Producer'],
      ...Object.keys(old).filter((k) => !STANDARD.has(k)),
    ];
    for (const field of fields) {
      const words = (old[field] ?? '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 4 && !allowed.has(key(w)));
      if (words.some((w) => holdsWord(hay, byteForms(w)))) {
        fail(`still holds the old ${field} value in its bytes`);
      }
    }
    for (const g of scanPdf(cleanDir, name, f.source, scan).findings) {
      findings.push({ ...g, step: 6, check: `rescan/${g.check}` });
    }
  }
  return findings;
}

// ── Steps 7–9: size, write, image pages ─────────────────────────────────────────────────────

// 10 MB, counted in decimal (10 000 000 bytes), the stricter reading (ERD step 7). Cloudflare
// Pages allows 25 MiB per file.
export const MAX_BYTES = 10_000_000;
const mb = (n) => `${(n / 1_000_000).toFixed(1)} MB`;

/**
 * Checks before any write: each clean file is at most maxBytes (step 7), its image pages can be
 * read (step 9), and outDir holds no file other than the three outputs. Any other file would
 * ship with the site, because assemble-public.mjs copies all of public/ (a dot-file too).
 */
function checkBeforeWrite(workDir, files, outDir, maxBytes) {
  const findings = [];
  const cleanDir = join(workDir, 'clean');
  const cleanCtx = { root: cleanDir, distDir: cleanDir };
  for (const f of files) {
    f.bytes = statSync(f.clean).size;
    if (f.bytes > maxBytes) {
      findings.push({
        step: 7,
        check: 'size',
        file: f.source,
        message: `is ${mb(f.bytes)} after cleaning; the limit is ${mb(maxBytes)}`,
        fix: 'export it again with smaller images (for example LibreOffice from the DOCX, D86), then run this again',
      });
    }
    try {
      f.imagePages = pdfImagePages(cleanCtx, `${f.id}.pdf`);
    } catch (err) {
      findings.push({
        step: 9,
        check: 'images',
        file: f.source,
        message: err.message,
        fix: 'see the message',
      });
    }
  }
  const outputs = new Set(files.map((f) => `${f.id}.pdf`));
  if (existsSync(outDir)) {
    for (const n of readdirSync(outDir).filter((n) => !outputs.has(n))) {
      findings.push({
        step: 8,
        check: 'output',
        file: n,
        message: 'is in public/case-studies/ but is not one of the three outputs',
        fix: 'delete it: only Vendrax.pdf, Skooling.pdf and NyaySetu.pdf belong there',
      });
    }
  }
  return findings;
}

/**
 * Step 8: copies each clean file to outDir/<id>.pdf and records its path and sha256. All three
 * are copied to temp names first and renamed only when every copy worked, so a failed copy
 * leaves the old outputs as they were.
 */
export function writeOutputs(files, outDir) {
  mkdirSync(outDir, { recursive: true });
  const partial = (f) => join(outDir, `.${f.id}.pdf.partial`);
  try {
    for (const f of files) copyFileSync(f.clean, partial(f));
  } catch (err) {
    for (const f of files) rmSync(partial(f), { force: true });
    throw err;
  }
  for (const f of files) {
    f.output = join(outDir, `${f.id}.pdf`);
    renameSync(partial(f), f.output);
    f.sha256 = createHash('sha256').update(readFileSync(f.output)).digest('hex');
  }
}

// ── The run ─────────────────────────────────────────────────────────────────────────────────

/**
 * The names list as the scan needs it: { names, nameWords, findings, stop }. A missing or empty
 * names.txt stops the run (`stop`); a line that cannot be matched is a finding (step 4). Shared by
 * the cohort pipeline and the résumé intake, so both read the list the same way.
 */
export function loadNames(privateDir) {
  const findings = [];
  const state = privateState(privateDir, 'names.txt');
  if (state !== 'ok') {
    findings.push({
      step: 4,
      check: 'names',
      file: 'names.txt',
      message: `the private names list is ${state}, so the PDFs cannot be name-checked`,
      fix: 'put names.txt in the private folder ($PORTFOLIO_PRIVATE_DIR or ~/my_builds/portfolio/private)',
    });
    return { findings, stop: true };
  }
  const lines = privateLines(privateDir, 'names.txt');
  const names = nameMatchers(lines);
  for (const line of names.unmatchable) {
    findings.push({
      step: 4,
      check: 'names',
      file: 'names.txt',
      message: `line ${line} has no Latin letter or digit, so it cannot be checked`,
      fix: 'write the name in Latin letters too (one spelling per line)',
    });
  }
  const nameWords = new Set(
    lines.flatMap((l) => key(l.text).split(' ')).filter((w) => w.length > 2),
  );
  return { names, nameWords, findings, stop: false };
}

/**
 * Steps 1–9 over every input. Returns { findings, notes, files }; any finding means the run
 * failed and nothing was written. A missing or empty names list is a finding, never a skip.
 * Each step runs only when the steps before it found nothing, and step 8 writes only after
 * steps 7 and 9 passed for every file: all three files are written, or none.
 */
export function prepare({
  inputsDir,
  privateDir,
  allowFile,
  workDir,
  outDir,
  maxBytes = MAX_BYTES,
}) {
  const findings = [];
  const notes = [];
  const files = [];
  const loaded = loadNames(privateDir);
  if (loaded.stop) return { findings: loaded.findings, notes, files };
  findings.push(...loaded.findings);
  const { names, nameWords } = loaded;
  const allow = loadAllow(allowFile);

  const step1 = collectInputs(inputsDir);
  findings.push(...step1.findings);
  for (const input of step1.inputs) {
    let file;
    try {
      file = toPdf(input, inputsDir, workDir);
    } catch (err) {
      findings.push({
        step: 2,
        check: 'convert',
        file: input.source,
        message: err.message,
        fix: 'see the message',
      });
      continue;
    }
    const r = scanPdf(workDir, `${input.id}.pdf`, input.source, { names, nameWords, allow });
    findings.push(...r.findings);
    notes.push(...r.notes);
    files.push({ id: input.id, source: input.source, path: file, pages: r.pages });
  }
  if (findings.length > 0) return { findings, notes, files };

  // Step 6.
  for (const f of files) {
    try {
      const { path, warnings } = cleanMetadata(f.path, f.id, workDir);
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
  if (findings.length === 0)
    findings.push(...checkClean(workDir, files, { names, nameWords, allow }));
  if (findings.length > 0) return { findings, notes, files };

  // Steps 7 and 9 (read only), then step 8.
  findings.push(...checkBeforeWrite(workDir, files, outDir, maxBytes));
  if (findings.length === 0) writeOutputs(files, outDir);
  return { findings, notes, files };
}

/** One finding or note as text: step and check, file and page, what, and the fix. */
export function formatItem(f, mark = '✗') {
  const where = `${f.file}${f.page ? ` p${f.page}` : ''}`;
  return `  ${mark} step ${f.step}/${f.check} ${where} — ${f.message}${f.fix ? `\n      fix: ${f.fix}` : ''}`;
}
