// The cohort PDF pipeline, steps 1–6 (ENG-08; ERD § Assets). Every input is made at test time in
// a temp folder; the names are invented and are not on the real names list (D83). The real-file
// run (TC-B04 on the real files) is local only, because .inputs/ is git-ignored.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  collectInputs,
  hostOf,
  isReserved,
  loadAllow,
  prepare,
  sentences,
} from '../../scripts/pdf/pipeline.mjs';
import { fakePhone, fakePrivate, makePdf, tempDir, writeFiles } from '../verify/helpers.mjs';

const NAMES = 'Kelvaro Dunn\n# a comment line\nZorvath Pell\n';
const CLEAN = 'A short PRD by Aditya Gupta about a product problem and its solution.';
const clean = () => ({
  'Vendrax.pdf': makePdf({ text: CLEAN }),
  'Skooling-PRD.pdf': makePdf({ text: CLEAN }),
  'NyaySetu_PRD.pdf': makePdf({ text: CLEAN }),
});

/** Runs steps 1–5 on a temp .inputs/ holding the three clean files plus `files` (null deletes). */
function run({ files = {}, names = NAMES, allow = { domains: [], emails: [] } } = {}) {
  const inputsDir = tempDir('pdf-inputs-');
  const all = { ...clean(), ...files };
  for (const [name, body] of Object.entries(all)) {
    if (body !== null) writeFileSync(join(inputsDir, name), body);
  }
  const privateDir = names === null ? tempDir('pdf-private-') : fakePrivate({ 'names.txt': names });
  const allowFile = join(tempDir('pdf-allow-'), 'allow.json');
  writeFileSync(allowFile, JSON.stringify(allow));
  return prepare({ inputsDir, privateDir, allowFile, workDir: tempDir('pdf-work-') });
}

const ids = (findings) =>
  findings.map((f) => `${f.step}/${f.check} ${f.file}${f.page ? ` p${f.page}` : ''}`).sort();
const vendrax = (opts) => ({ 'Vendrax.pdf': makePdf(opts) });

describe('the clean case', () => {
  test('three clean PDFs give no finding, and .DS_Store is ignored', () => {
    const r = run({ files: { '.DS_Store': 'finder' } });
    expect(r.findings).toEqual([]);
    expect(r.files.map((f) => `${f.id}:${f.pages}`)).toEqual([
      'Vendrax:1',
      'Skooling:1',
      'NyaySetu:1',
    ]);
  });

  test('the real allowlist loads', () => {
    const allow = loadAllow(new URL('../../scripts/pdf/allow.json', import.meta.url));
    expect(Object.keys(allow)).toEqual(['domains', 'emails']);
  });
});

describe('step 1: inputs', () => {
  test('a missing cohort file stops the run', () => {
    expect(ids(run({ files: { 'NyaySetu_PRD.pdf': null } }).findings)).toEqual([
      '1/inputs NyaySetu_PRD.pdf',
    ]);
  });

  test('a file that is not a cohort file stops the run', () => {
    expect(ids(run({ files: { 'notes.txt': 'x' } }).findings)).toEqual(['1/inputs notes.txt']);
  });

  test('Skooling given as both PDF and DOCX stops the run', () => {
    expect(ids(run({ files: { 'Skooling-PRD.docx': 'x' } }).findings)).toEqual([
      '1/inputs Skooling-PRD.pdf + Skooling-PRD.docx',
    ]);
  });

  test('Vendrax given as both PDF and DOCX stops the run (D86)', () => {
    expect(ids(run({ files: { 'Vendrax.docx': 'x' } }).findings)).toEqual([
      '1/inputs Vendrax.pdf + Vendrax.docx',
    ]);
  });

  test('NyaySetu as a DOCX is not a cohort file', () => {
    expect(ids(run({ files: { 'NyaySetu_PRD.docx': 'x' } }).findings)).toEqual([
      '1/inputs NyaySetu_PRD.docx',
    ]);
  });

  test('a folder with a cohort file name stops the run', () => {
    const dir = tempDir('pdf-inputs-');
    writeFiles(dir, { 'Vendrax.pdf/x': 'x', 'Skooling-PRD.pdf': 'x', 'NyaySetu_PRD.pdf': 'x' });
    expect(ids(collectInputs(dir).findings)).toEqual(['1/inputs Vendrax.pdf']);
  });

  test('no inputs folder stops the run', () => {
    const r = collectInputs(join(tempDir('pdf-none-'), '.inputs'));
    expect(r.findings.map((f) => f.message)).toEqual([
      expect.stringMatching(/^there is no inputs folder/),
    ]);
  });
});

describe('step 2: DOCX to PDF', () => {
  test('soffice that exits 0 but writes nothing is a failure, not a pass', () => {
    const bin = tempDir('pdf-bin-');
    writeFileSync(join(bin, 'soffice'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(bin, 'soffice'), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    try {
      const r = run({ files: { 'Skooling-PRD.pdf': null, 'Skooling-PRD.docx': 'x' } });
      expect(ids(r.findings)).toEqual(['2/convert Skooling-PRD.docx']);
      expect(r.findings[0].message).toMatch(
        /^soffice did not convert Skooling-PRD.docx \(exit 0\)/,
      );
    } finally {
      process.env.PATH = path;
    }
  });

  const hasSoffice = spawnSync('soffice', ['--version']).status === 0;
  test.skipIf(!hasSoffice)(
    'a real DOCX is converted and scanned (skipped when LibreOffice is not installed)',
    () => {
      // Make a DOCX with LibreOffice itself, from a text file that holds an invented name.
      const dir = tempDir('pdf-docx-');
      writeFileSync(join(dir, 'Skooling-PRD.txt'), `${CLEAN}\nPrepared with Zorvath Pell.\n`);
      const r1 = spawnSync(
        'soffice',
        ['--headless', '--convert-to', 'docx', '--outdir', dir, join(dir, 'Skooling-PRD.txt')],
        { encoding: 'utf8', timeout: 180_000 },
      );
      expect(r1.status).toBe(0);
      const docx = readFileSync(join(dir, 'Skooling-PRD.docx'));
      const r = run({ files: { 'Skooling-PRD.pdf': null, 'Skooling-PRD.docx': docx } });
      expect(ids(r.findings)).toEqual(['4/names Skooling-PRD.docx p1']);
      expect(r.files.find((f) => f.id === 'Skooling').pages).toBe(1);
    },
    200_000,
  );
});

describe('step 3: text layer', () => {
  test('a PDF with no text layer stops, and is not scanned further', () => {
    const r = run({ files: vendrax({ text: '', links: ['https://unlisted.example.net.zz/'] }) });
    expect(ids(r.findings)).toEqual(['3/text Vendrax.pdf']);
    expect(r.findings[0].message).toMatch(/no readable text layer/);
  });
});

describe('step 4: names', () => {
  test('a name in the text stops the run; the message shows the line, not the name', () => {
    const r = run({ files: vendrax({ text: `${CLEAN}\fThanks to Kelvaro Dunn.` }) });
    expect(ids(r.findings)).toEqual(['4/names Vendrax.pdf p2']);
    expect(r.findings[0].message).toBe('holds the name or label on names.txt line 1');
    expect(JSON.stringify(r)).not.toMatch(/Kelvaro|Dunn/);
  });

  test('a name split across a page break is found, without a page', () => {
    const r = run({ files: vendrax({ text: `${CLEAN} With Zorvath\fPell and others.` }) });
    expect(ids(r.findings)).toEqual(['4/names Vendrax.pdf']);
    expect(r.findings[0].message).toBe('holds the name or label on names.txt line 3');
  });

  test('a name inside a link address is found', () => {
    const r = run({
      files: vendrax({ text: CLEAN, links: ['https://docs.example.com/kelvaro-dunn'] }),
    });
    expect(ids(r.findings)).toEqual(['4/names Vendrax.pdf p1']);
  });

  test('a missing names list stops the run before any scan', () => {
    const r = run({ names: null, files: vendrax({ text: 'Kelvaro Dunn' }) });
    expect(ids(r.findings)).toEqual(['4/names names.txt']);
    expect(r.findings[0].message).toMatch(/is missing/);
    expect(r.files).toEqual([]);
  });

  test('an empty names list stops the run', () => {
    expect(run({ names: '# only a comment\n\n' }).findings[0].message).toMatch(/is empty/);
  });

  test('a names.txt entry with no Latin letter stops the run', () => {
    const r = run({ names: `${NAMES}ज़ोरवथ\n` });
    expect(r.findings.map((f) => f.message)).toEqual([
      'line 4 has no Latin letter or digit, so it cannot be checked',
    ]);
  });
});

describe('step 4: phone numbers', () => {
  test('a phone number in the text stops the run and shows only the last two digits', () => {
    const phone = fakePhone();
    const r = run({ files: vendrax({ text: `${CLEAN} Call ${phone}.` }) });
    expect(ids(r.findings)).toEqual(['4/phone Vendrax.pdf p1']);
    expect(JSON.stringify(r)).not.toContain(phone.slice(0, 8));
  });

  test('a tel: link stops the run', () => {
    const r = run({ files: vendrax({ text: CLEAN, links: ['tel:+15550100'] }) });
    // Two findings, as in VF-01: the number and the tel: link itself.
    expect(r.findings.map((f) => f.message).sort()).toEqual([
      'holds a phone number (+••••••00)',
      'holds a tel: link',
    ]);
  });
});

describe('step 4: email addresses and links', () => {
  test('an email address stops the run and shows only its domain', () => {
    const r = run({ files: vendrax({ text: `${CLEAN} Write to kd.private@mailhost.zz now.` }) });
    expect(ids(r.findings)).toEqual(['4/email Vendrax.pdf p1']);
    expect(r.findings[0].message).toBe(
      'holds an email address at mailhost.zz that is not on the allowlist',
    );
    expect(JSON.stringify(r)).not.toContain('kd.private');
  });

  test('demo addresses at reserved domains pass; an exact allowed address passes', () => {
    const text = `${CLEAN} ceo@meridian.test, a@b.example.com, ops@vendor.zz`;
    expect(
      run({ files: vendrax({ text }), allow: { domains: [], emails: ['ops@vendor.zz'] } }).findings,
    ).toEqual([]);
  });

  test('a mailto: link is checked as an email address', () => {
    const r = run({ files: vendrax({ text: CLEAN, links: ['mailto:kd@mailhost.zz?subject=x'] }) });
    expect(ids(r.findings)).toEqual(['4/email Vendrax.pdf p1']);
  });

  test.each([
    ['https://drafts.unlisted.zz/doc/1', 'drafts.unlisted.zz'],
    ['www.unlisted.zz/page', 'www.unlisted.zz'],
    ['unlisted.zz/document/d/abc', 'unlisted.zz'],
  ])('a link in the text (%s) stops the run and shows only its host', (url, host) => {
    const r = run({ files: vendrax({ text: `${CLEAN} See ${url} for more.` }) });
    expect(r.findings.map((f) => f.message)).toEqual([
      `holds a link to ${host}, which is not on the allowlist`,
    ]);
  });

  test('a link annotation with no visible text stops the run', () => {
    const r = run({ files: vendrax({ text: CLEAN, links: ['https://hidden.unlisted.zz/x'] }) });
    expect(r.findings.map((f) => f.message)).toEqual([
      'has a link to hidden.unlisted.zz, which is not on the allowlist',
    ]);
  });

  test('an allowed domain covers its subdomains, not look-alikes', () => {
    const allow = { domains: ['gov.zz'], emails: [] };
    const ok = run({ files: vendrax({ text: `${CLEAN} https://data.gov.zz/a` }), allow });
    expect(ok.findings).toEqual([]);
    const bad = run({ files: vendrax({ text: `${CLEAN} https://evilgov.zz/a` }), allow });
    expect(ids(bad.findings)).toEqual(['4/link Vendrax.pdf p1']);
  });

  test('a javascript: link stops the run', () => {
    const r = run({ files: vendrax({ text: CLEAN, links: ['javascript:void(0)'] }) });
    expect(r.findings.map((f) => f.message)).toEqual(['has a javascript: link']);
  });

  test('hostOf and isReserved', () => {
    expect(hostOf('HTTPS://Docs.Example.COM:443/x?y')).toBe('docs.example.com');
    expect(hostOf('www.site.zz.')).toBe('www.site.zz');
    expect(['a.test', 'example.org', 'x.example.com', 'h.localhost'].every(isReserved)).toBe(true);
    expect(['example.com.zz', 'notexample.com', 'test.zz'].some(isReserved)).toBe(false);
  });
});

describe('step 4: comments and active content', () => {
  test('a comment printed into the page stops the run', () => {
    const r = run({ files: vendrax({ text: `${CLEAN}\fCommented [1]: please check this` }) });
    expect(ids(r.findings)).toEqual(['4/comment Vendrax.pdf p2']);
  });

  test('a comment annotation stops the run', () => {
    const r = run({
      files: vendrax({
        text: CLEAN,
        annots: ['<< /Type /Annot /Subtype /Text /Rect [0 0 10 10] /Contents (note) >>'],
      }),
    });
    expect(ids(r.findings)).toEqual(['4/comment Vendrax.pdf']);
  });

  test.each([
    ['an embedded file', '/Names << /EmbeddedFiles << /Names [] >> >>', 'holds an embedded file'],
    [
      'a script',
      '/OpenAction << /S /JavaScript /JS (app.alert(1)) >>',
      'holds a script or a launch action',
    ],
    ['a form', '/AcroForm << /Fields [] >>', 'holds a form (AcroForm)'],
  ])('%s stops the run', (_, catalog, message) => {
    const r = run({ files: vendrax({ text: CLEAN, catalog }) });
    expect(r.findings.map((f) => f.message)).toContain(message);
  });
});

describe('step 5: the "we" rule', () => {
  test('"I" about research stops the run; the printed sentence masks names', () => {
    const r = run({
      files: { 'Skooling-PRD.pdf': makePdf({ text: 'I interviewed 12 parents with Zorvath.' }) },
    });
    expect(ids(r.findings)).toEqual(['5/we-rule Skooling-PRD.pdf p1']);
    expect(r.findings[0].message).toBe(
      'says "I" about research: "I interviewed 12 parents with [NAME]."',
    );
  });

  test.each(['My survey of 40 teachers showed this.', 'The parents spoke to me at length.'])(
    'a singular pronoun near a research word stops the run: %s',
    (text) => {
      const r = run({ files: { 'NyaySetu_PRD.pdf': makePdf({ text }) } });
      expect(ids(r.findings)).toEqual(['5/we-rule NyaySetu_PRD.pdf p1']);
    },
  );

  test('"we" about research is a note, not a finding', () => {
    const r = run({ files: vendrax({ text: 'We interviewed 12 buyers. It went well.' }) });
    expect(r.findings).toEqual([]);
    expect(r.notes.map((n) => n.message)).toEqual([
      'says "we" about research (correct when the team did it): "We interviewed 12 buyers."',
    ]);
  });

  test('a pronoun joined by a hyphen or slash does not count', () => {
    const text = 'The research bundle lives in docs/grill-me. Phase-I research is done.';
    expect(run({ files: vendrax({ text }) }).findings).toEqual([]);
  });

  test('a sentence with no research word is not flagged', () => {
    expect(run({ files: vendrax({ text: 'I wrote this PRD in my own words.' }) }).findings).toEqual(
      [],
    );
  });

  test('sentences split at full stops, blank lines and bullets', () => {
    expect(sentences('One. Two\n\nThree • Four')).toEqual(['One.', 'Two', 'Three', 'Four']);
  });
});

describe('step 6: clean metadata', () => {
  const XMP =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Kelvaro Dunn</dc:creator>' +
    '</rdf:Description></rdf:RDF></x:xmpmeta>';
  const dirty = {
    'NyaySetu_PRD.pdf': makePdf({
      text: CLEAN,
      info: { Author: 'Kelvaro Dunn', Creator: 'Zorvath Writer', Company: 'Quillmere Labs' },
      xmp: XMP,
    }),
  };
  const nyay = (r) => r.files.find((f) => f.id === 'NyaySetu');
  const info = (file) => {
    const out = spawnSync('pdfinfo', ['-custom', file], { encoding: 'utf8' }).stdout;
    return Object.fromEntries(
      [...out.matchAll(/^([A-Za-z][A-Za-z ]*?):\s*(.*)$/gm)].map((m) => [m[1], m[2]]),
    );
  };
  const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

  /**
   * Runs fn with a fake `name` tool first on PATH. The script sees $src and $dst, the last two
   * arguments, so it does not depend on the flags before them.
   */
  function withFake(name, script, fn) {
    const bin = tempDir('pdf-bin-');
    writeFileSync(join(bin, name), `#!/bin/sh\nfor a; do src=$dst; dst=$a; done\n${script}\n`);
    chmodSync(join(bin, name), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    try {
      return fn();
    } finally {
      process.env.PATH = path;
    }
  }

  test('a clean file gets Title = project, Author = Aditya Gupta, and nothing else', () => {
    const r = run({ files: dirty });
    expect(r.findings).toEqual([]);
    const after = info(nyay(r).clean);
    expect([after.Title, after.Author]).toEqual(['NyaySetu', 'Aditya Gupta']);
    expect(after.Creator).toBeUndefined();
    expect(after.Company).toBeUndefined();
    expect(r.files.map((f) => f.clean.split('/').slice(-2).join('/'))).toEqual([
      'clean/Vendrax.pdf',
      'clean/Skooling.pdf',
      'clean/NyaySetu.pdf',
    ]);
  });

  test('the old values and the XMP are gone from the bytes, not only from pdfinfo', () => {
    const r = run({ files: dirty });
    const before = readFileSync(nyay(r).path, 'latin1');
    const after = readFileSync(nyay(r).clean, 'latin1');
    // The control: the input holds every value, so a search that finds nothing proves something.
    for (const s of ['Kelvaro', 'Zorvath', 'Quillmere', 'xmpmeta']) {
      expect(before).toContain(s);
      expect(after).not.toContain(s);
    }
  });

  test('two runs give the same bytes (deterministic id, no new dates)', () => {
    const a = run({ files: dirty });
    const b = run({ files: dirty });
    expect(a.files.map((f) => sha(f.clean))).toEqual(b.files.map((f) => sha(f.clean)));
  });

  test('XMP on a page object stops the run, and the message names no value', () => {
    const r = run({ files: { 'Vendrax.pdf': makePdf({ text: CLEAN, pageXmp: XMP }) } });
    expect(ids(r.findings)).toEqual(['6/xmp Vendrax.pdf']);
    expect(r.findings[0].message).toBe('after cleaning, still holds XMP metadata');
  });

  test('step 6 does not run when a scan found something', () => {
    const r = run({ files: vendrax({ text: `${CLEAN} Thanks to Kelvaro Dunn.` }) });
    expect(ids(r.findings)).toEqual(['4/names Vendrax.pdf p1']);
    expect(r.files.every((f) => f.clean === undefined)).toBe(true);
  });

  test('exiftool that exits 0 but writes nothing is a failure, not a pass', () => {
    const r = withFake('exiftool', 'exit 0', () => run());
    expect(r.findings.map((f) => f.message)).toEqual([
      'exiftool did not clean the metadata (exit 0)',
      'exiftool did not clean the metadata (exit 0)',
      'exiftool did not clean the metadata (exit 0)',
    ]);
  });

  test('qpdf exit 2 (errors) stops the run', () => {
    const r = withFake('qpdf', 'cp "$src" "$dst"; echo "qpdf: damaged" >&2; exit 2', () => run());
    expect(ids(r.findings)).toEqual([
      '6/clean NyaySetu_PRD.pdf',
      '6/clean Skooling-PRD.pdf',
      '6/clean Vendrax.pdf',
    ]);
    expect(r.findings[0].message).toBe('qpdf did not rewrite the file (exit 2)');
  });

  test('qpdf exit 3 (warnings) is a note, and the checks still run on its output', () => {
    const r = withFake(
      'qpdf',
      'cp "$src" "$dst"; echo "WARNING: x: object 3 0: dictionary has duplicated key" >&2; exit 3',
      () => run(),
    );
    expect(r.findings).toEqual([]);
    expect(r.notes.map((n) => `${n.file}: ${n.message}`)).toContain(
      'Vendrax.pdf: qpdf repaired 1 problem(s) in the file (exit 3); the checks below ran on the result',
    );
  });

  test('an old value left in an earlier revision stops the run (qpdf did not rewrite)', () => {
    // A qpdf that copies its input keeps exiftool's appended revision, with the old Author in it.
    // pdfinfo reads only the newest revision, so VF-04 passes; only the byte search sees it.
    const files = { 'Vendrax.pdf': makePdf({ text: CLEAN, info: { Author: 'Kelvaro Dunn' } }) };
    const r = withFake('qpdf', 'cp "$src" "$dst"', () => run({ files }));
    expect(ids(r.findings)).toEqual(['6/clean Vendrax.pdf']);
    expect(r.findings[0].message).toBe('still holds the old Author value in its bytes');
    expect(JSON.stringify(r)).not.toMatch(/Kelvaro|Dunn/);
  });

  test('a page lost in the rewrite stops the run', () => {
    const onePage = join(tempDir('pdf-one-'), 'one.pdf');
    writeFileSync(onePage, makePdf({ text: CLEAN }));
    process.env.FAKE_ONE_PAGE = onePage;
    try {
      const files = { 'Vendrax.pdf': makePdf({ text: `${CLEAN}\f${CLEAN}` }) };
      const r = withFake('qpdf', 'cp "$FAKE_ONE_PAGE" "$dst"', () => run({ files }));
      expect(r.findings.map((f) => `${f.file}: ${f.message}`)).toEqual([
        'Vendrax.pdf: has 1 pages after cleaning, not 2',
      ]);
    } finally {
      delete process.env.FAKE_ONE_PAGE;
    }
  });
});

describe('the allowlist file', () => {
  const file = (body) => {
    const p = join(tempDir('pdf-allow-'), 'allow.json');
    writeFileSync(p, JSON.stringify(body));
    return p;
  };
  test.each([
    [{ domains: [] }, /"emails" must be a list/],
    [{ domains: ['Example.zz'], emails: [] }, /"domains" must be a list of lower-case strings/],
    [{ domains: ['https://x.zz'], emails: [] }, /must be a bare domain/],
    [{ domains: ['x.zz/path'], emails: [] }, /must be a bare domain/],
  ])('a bad allowlist throws (%j)', (body, error) => {
    expect(() => loadAllow(file(body))).toThrow(error);
  });
});
