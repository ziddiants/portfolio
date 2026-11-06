// The résumé intake (ENG-09, D88, D89; TC-B01, TC-B08 and TC-C03 on the real files are a local
// run). Every input is made at test time in a temp private folder; the numbers and names are
// invented (D83). Uses the real exiftool, qpdf and poppler, as the ENG-08 tests do.
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { holdsWord } from '../../scripts/pdf/pipeline.mjs';
import { prepareResumes } from '../../scripts/pdf/resume.mjs';
import vf01 from '../../scripts/verify/rules/vf-01.mjs';
import vf04 from '../../scripts/verify/rules/vf-04.mjs';
import { pdfInfo, pdfRaw, pdfText } from '../../scripts/verify/lib/pdf.mjs';
import { golden } from '../verify/golden.mjs';
import { fakePhone, makePdf, tempDir, writeFiles } from '../verify/helpers.mjs';

const own = fakePhone();
let other = fakePhone();
while (other === own) other = fakePhone();
const BODY = (id, extra = '') =>
  `Aditya Gupta, product manager for ${id} products. Built checkout flows and launched them to many users.\n${extra}`;
const raw = (id, opts = {}) => makePdf({ text: BODY(id, `Phone ${own}`), ...opts });

/** A temp private folder with names, phone and the two raw résumés; `files` adds or replaces (null removes). */
function setup({ files = {}, phone = `${own}\n`, names = 'Kelvaro Dunn\nZorvath Pell\n' } = {}) {
  const dir = tempDir('resume-private-');
  const base = {
    'names.txt': names,
    ...(phone === null ? {} : { 'phone.txt': phone }),
    'resumes/raw/payments.pdf': raw('payments'),
    'resumes/raw/consumer.pdf': raw('consumer'),
  };
  for (const [k, v] of Object.entries(files)) {
    if (v === null) delete base[k];
    else base[k] = v;
  }
  writeFiles(dir, base);
  return dir;
}
const allowFile = () => {
  const f = join(tempDir('resume-allow-'), 'allow.json');
  writeFileSync(f, JSON.stringify({ domains: [], emails: [] }));
  return f;
};
const run = (privateDir, extra = {}) =>
  prepareResumes({
    privateDir,
    allowFile: allowFile(),
    workDir: tempDir('resume-work-'),
    ...extra,
  });
const ids = (r) =>
  r.findings.map((f) => `${f.step}/${f.check} ${f.file}${f.page ? ` p${f.page}` : ''}`).sort();
const outputs = (dir) =>
  existsSync(join(dir, 'resumes'))
    ? readdirSync(join(dir, 'resumes'))
        .filter((n) => n.endsWith('.pdf'))
        .sort()
    : [];
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('resume:prepare', () => {
  test('two clean résumés are written to private/resumes/<id>.pdf, with a sha256 each', () => {
    const dir = setup();
    const r = run(dir);
    expect(r.findings).toEqual([]);
    expect(outputs(dir)).toEqual(['consumer.pdf', 'payments.pdf']);
    for (const f of r.files) expect(f.sha256).toBe(sha(join(dir, 'resumes', `${f.id}.pdf`)));
  });

  test('the written file keeps his number in the text and has Title and Author "Aditya Gupta"', () => {
    const dir = setup();
    run(dir);
    const out = join(dir, 'resumes');
    const ctx = { root: out, distDir: out };
    const info = pdfInfo(ctx, 'payments.pdf');
    expect(info.Title).toBe('Aditya Gupta');
    expect(info.Author).toBe('Aditya Gupta');
    expect(pdfText(ctx, 'payments.pdf').replace(/\D/g, '')).toContain(own);
  });

  test('a manifest lists the sha256 of both written files (the build ships only these)', () => {
    const dir = setup();
    const r = run(dir);
    const manifest = JSON.parse(readFileSync(join(dir, 'resumes', 'manifest.json'), 'utf8'));
    expect(manifest).toEqual({
      payments: sha(join(dir, 'resumes', 'payments.pdf')),
      consumer: sha(join(dir, 'resumes', 'consumer.pdf')),
    });
    expect(r.files.map((f) => f.sha256).sort()).toEqual(Object.values(manifest).sort());
  });

  test('nothing is written, and no manifest, when a step fails', () => {
    const dir = setup({ files: { 'resumes/raw/consumer.pdf': null } });
    run(dir);
    expect(existsSync(join(dir, 'resumes', 'manifest.json'))).toBe(false);
  });

  test('the written file passes VF-01 and VF-04 under the name it ships with', () => {
    const dir = setup();
    run(dir);
    const bytes = readFileSync(join(dir, 'resumes', 'payments.pdf'));
    const ctx = golden({ privateDir: dir, files: { 'Aditya-Gupta-Resume.pdf': bytes } });
    expect(vf01.run(ctx)).toEqual([]);
    expect(vf04.run(ctx)).toEqual([]);
  });

  test('old metadata (Creator, Producer, Subject, a custom key) is gone from the bytes', () => {
    const info = {
      Creator: 'Zebulonic Writer',
      Producer: 'Quixotic Maker',
      Subject: 'Plumtree Notes',
      Title: 'Hidden Draft Heading',
      Company: 'Wombat Holdings',
    };
    const dir = setup({ files: { 'resumes/raw/payments.pdf': raw('payments', { info }) } });
    const r = run(dir);
    expect(r.findings).toEqual([]);
    const out = join(dir, 'resumes');
    const bytes = pdfRaw({ root: out, distDir: out }, 'payments.pdf').toLowerCase();
    for (const w of ['zebulonic', 'quixotic', 'plumtree', 'hidden draft', 'wombat']) {
      expect(bytes).not.toContain(w);
    }
  });

  test('a Creator that is also a PDF structure name ("Pages") is not a leftover value', () => {
    const dir = setup({
      files: { 'resumes/raw/payments.pdf': raw('payments', { info: { Creator: 'Pages' } }) },
    });
    expect(run(dir).findings).toEqual([]);
    const out = join(dir, 'resumes');
    expect(pdfInfo({ root: out, distDir: out }, 'payments.pdf').Creator).toBeUndefined();
  });

  test('holdsWord: a standard PDF name is structure; a word in a path or a link is a value', () => {
    expect(holdsWord('<< /type /catalog /pages 4 0 r >>', ['pages'])).toBe(false);
    expect(holdsWord('/creator (pages)', ['pages'])).toBe(true);
    expect(holdsWord('/title (/users/zorvath/desktop/notes)', ['zorvath'])).toBe(true);
    expect(holdsWord('/uri (https://x.dev/zorvath)', ['zorvath'])).toBe(true);
    expect(holdsWord('/type /pages', ['pages', 'zz'])).toBe(false);
    expect(holdsWord('/type /pages zz', ['pages', 'zz'])).toBe(true); // another form still counts
  });

  test('two runs from the same inputs give the same bytes', () => {
    const dir = setup();
    run(dir);
    const first = sha(join(dir, 'resumes', 'payments.pdf'));
    run(dir);
    expect(sha(join(dir, 'resumes', 'payments.pdf'))).toBe(first);
  });

  test('a dot-file in raw/ is ignored; the raw files are not changed or removed', () => {
    const dir = setup({ files: { 'resumes/raw/.DS_Store': 'junk' } });
    expect(run(dir).findings).toEqual([]);
    expect(readdirSync(join(dir, 'resumes', 'raw')).sort()).toEqual([
      '.DS_Store',
      'consumer.pdf',
      'payments.pdf',
    ]);
  });

  test('"I" about research is fine in a résumé: the "we" rule does not apply', () => {
    const text = BODY('payments', `I interviewed twenty users and I tested the flow. Phone ${own}`);
    const dir = setup({ files: { 'resumes/raw/payments.pdf': makePdf({ text }) } });
    const r = run(dir);
    expect(r.findings).toEqual([]);
    expect(r.notes.filter((n) => n.check === 'we-rule')).toEqual([]);
  });
});

describe('resume:prepare — what stops it, and writes nothing', () => {
  const stops = (dir, expected) => {
    const r = run(dir);
    expect(ids(r)).toEqual(expected);
    expect(outputs(dir)).toEqual([]);
    return r;
  };

  test('another phone number in a résumé (step 4)', () => {
    const f = { 'resumes/raw/payments.pdf': makePdf({ text: BODY('payments', `Phone ${other}`) }) };
    const r = stops(setup({ files: f }), ['4/phone resumes/raw/payments.pdf p1']);
    expect(JSON.stringify(r.findings)).not.toContain(other);
  });

  test('his number with no phone.txt, an empty one, or a short one: fails', () => {
    for (const phone of [null, '# empty\n', '12345\n']) {
      stops(setup({ phone }), [
        '4/phone resumes/raw/consumer.pdf p1',
        '4/phone resumes/raw/payments.pdf p1',
      ]);
    }
  });

  test('a note says phone.txt is missing, empty or too short to be a number', () => {
    for (const phone of [null, '# empty\n', '12345\n']) {
      const r = run(setup({ phone }));
      expect(
        r.notes.map((n) => `${n.check} ${n.file}`),
        String(phone),
      ).toContain('phone phone.txt');
    }
    expect(run(setup()).notes.map((n) => n.check)).not.toContain('phone');
  });

  test('his own number in a link of a raw résumé fails (the exception is page text only)', () => {
    for (const links of [[`tel:+91${own}`], [`https://wa.me/91${own}`]]) {
      const f = {
        'resumes/raw/payments.pdf': makePdf({ text: BODY('payments', `Phone ${own}`), links }),
      };
      const dir = setup({ files: f });
      const r = run(dir);
      expect(
        ids(r).some((i) => i.startsWith('4/phone')),
        links[0],
      ).toBe(true);
      expect(outputs(dir)).toEqual([]);
      expect(JSON.stringify(r.findings)).not.toContain(own);
    }
  });

  test('his own number in the metadata of a raw résumé is removed by the clean step', () => {
    const info = { Subject: `Call ${own}` };
    const f = {
      'resumes/raw/payments.pdf': makePdf({ text: BODY('payments', `Phone ${own}`), info }),
    };
    const dir = setup({ files: f });
    expect(run(dir).findings).toEqual([]);
    const out = join(dir, 'resumes');
    expect(pdfInfo({ root: out, distDir: out }, 'payments.pdf').Subject).toBeUndefined();
    expect(pdfRaw({ root: out, distDir: out }, 'payments.pdf')).not.toContain(`Call ${own}`);
  });

  test('an email and a link are refused, unless private/resumes/allow.json allows them (D91)', () => {
    const text = BODY('payments', `Phone ${own} mail pat.example.org/x`);
    const mail = 'jordan.test@mailhost.dev';
    const links = ['https://www.linkedin.com/in/someone'];
    const f = {
      'resumes/raw/payments.pdf': makePdf({ text: `${text} ${mail}`, links }),
    };
    const dir = setup({ files: f });
    expect(ids(run(dir)).sort()).toEqual([
      '4/email resumes/raw/payments.pdf p1',
      '4/link resumes/raw/payments.pdf p1',
    ]);
    const allowed = {
      'resumes/allow.json': JSON.stringify({ domains: ['linkedin.com'], emails: [mail] }),
    };
    expect(run(setup({ files: { ...f, ...allowed } })).findings).toEqual([]);
  });

  test('the private allow file does not allow a different address, and a bad file stops the run', () => {
    const f = {
      'resumes/raw/payments.pdf': makePdf({
        text: `${BODY('payments', `Phone ${own}`)} a.b@mailhost.dev`,
      }),
    };
    const allowed = {
      'resumes/allow.json': JSON.stringify({ domains: [], emails: ['other@mailhost.dev'] }),
    };
    expect(ids(run(setup({ files: { ...f, ...allowed } })))).toEqual([
      '4/email resumes/raw/payments.pdf p1',
    ]);
    const secret = 'jordan.secret@mailhost.dev';
    const bad = setup({ files: { 'resumes/allow.json': `{ "emails": ["${secret}" ` } });
    expect(() => run(bad)).toThrow(/is not valid JSON/);
    expect(() => run(bad)).not.toThrow(new RegExp(secret.split('@')[0]));
  });

  test('another number right before his in the résumé text fails (review finding 1)', () => {
    const joined = `${other.slice(0, 5)} ${other.slice(5)}\n${own.slice(0, 5)} ${own.slice(5)}`;
    const f = { 'resumes/raw/payments.pdf': makePdf({ text: BODY('payments', joined) }) };
    const r = stops(setup({ files: f }), ['4/phone resumes/raw/payments.pdf p1']);
    expect(JSON.stringify(r.findings)).not.toContain(other);
  });

  test('a name from names.txt (step 4)', () => {
    const f = {
      'resumes/raw/consumer.pdf': makePdf({ text: BODY('consumer', 'Manager: Kelvaro Dunn') }),
    };
    stops(setup({ files: f }), ['4/names resumes/raw/consumer.pdf p1']);
  });

  test('a missing or empty names.txt', () => {
    expect(ids(run(setup({ files: { 'names.txt': null } })))).toEqual(['4/names names.txt']);
    expect(ids(run(setup({ names: '# nothing\n' })))).toEqual(['4/names names.txt']);
  });

  test('one raw file missing: nothing is written, not even the other résumé', () => {
    stops(setup({ files: { 'resumes/raw/consumer.pdf': null } }), [
      '1/input resumes/raw/consumer.pdf',
    ]);
  });

  test('no raw folder at all', () => {
    const bare = tempDir('resume-bare-');
    writeFiles(bare, { 'names.txt': 'Kelvaro Dunn\n' });
    expect(ids(run(bare))).toEqual(['1/input resumes/raw/']);
  });

  test('a stray file in raw/ (a third résumé)', () => {
    const dir = setup({ files: { 'resumes/raw/old-version.pdf': raw('old') } });
    stops(dir, ['1/input resumes/raw/old-version.pdf']);
  });

  test('a raw file that is a link', () => {
    const dir = setup({ files: { 'resumes/raw/payments.pdf': null } });
    const target = join(tempDir('resume-elsewhere-'), 'x.pdf');
    writeFileSync(target, raw('payments'));
    symlinkSync(target, join(dir, 'resumes', 'raw', 'payments.pdf'));
    stops(dir, ['1/input resumes/raw/payments.pdf']);
  });

  test('a résumé with no text layer (step 3)', () => {
    const f = { 'resumes/raw/payments.pdf': makePdf({ text: '' }) };
    const r = stops(setup({ files: f }), ['3/text resumes/raw/payments.pdf']);
    expect(r.findings[0].message).toMatch(/cannot be scanned/);
  });

  test('over the size limit (step 7)', () => {
    const dir = setup();
    const r = run(dir, { maxBytes: 100 });
    expect(ids(r)).toEqual(['7/size resumes/raw/consumer.pdf', '7/size resumes/raw/payments.pdf']);
    expect(outputs(dir)).toEqual([]);
  });

  test('a link to a host that is not allowed (step 4)', () => {
    const links = ['https://unlisted-host.dev/x'];
    const f = {
      'resumes/raw/payments.pdf': makePdf({ text: BODY('payments', `Phone ${own}`), links }),
    };
    const dir = setup({ files: f });
    const r = run(dir);
    expect(ids(r)).toEqual(['4/link resumes/raw/payments.pdf p1']);
    expect(outputs(dir)).toEqual([]);
  });
});
