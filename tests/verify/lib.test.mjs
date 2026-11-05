// Tests for the shared readers in scripts/verify/lib/ (ENG-07): they decode HTML the way a visitor
// reads it, and they fail when there is nothing to read instead of passing on an empty build.
import { describe, expect, test } from 'vitest';
import { pdfInfo, pdfRaw, pdfText, pdfUrls } from '../../scripts/verify/lib/pdf.mjs';
import { privateLines, privateState } from '../../scripts/verify/lib/private.mjs';
import { blocks, localFile, pages, readable } from '../../scripts/verify/lib/site.mjs';
import { fold } from '../../scripts/verify/lib/text.mjs';
import { buildDir, fakePrivate, makePdf, siteCtx } from './helpers.mjs';

describe('site.mjs', () => {
  test('a build with no HTML page throws: nothing to check is never a pass', () => {
    const ctx = siteCtx(buildDir(null, { 'robots.txt': 'User-agent: *\n' }));
    expect(() => pages(ctx)).toThrow(/no HTML page in/);
  });

  test('text is decoded and folded: &amp;, curly quotes, no-break spaces, inline tags', () => {
    const html = '<p>apps &amp; monetization</p><p>What’s&nbsp;<b>next</b></p><script>x!</script>';
    const [page] = pages(siteCtx(buildDir(null, { 'index.html': html })));
    expect(blocks(page.doc)).toEqual(['apps & monetization', "What's next"]);
    expect(fold('a‑b — c')).toBe('a-b - c');
  });

  test('readable text adds the title, alt text and descriptions, not other attributes', () => {
    const html =
      '<head><title>T</title><meta name="description" content="D"><meta name="x" content="no"></head>' +
      '<body><img alt="A" src="/no.png" data-x="no"></body>';
    const [page] = pages(siteCtx(buildDir(null, { 'index.html': html })));
    expect(readable(page)).toEqual(['T', 'D', 'A']); // body text, then attributes in page order
  });

  test('localFile maps same-site URLs to build paths, and outside URLs to null', () => {
    const page = { file: 'work/a.html' };
    expect(localFile(page, '/_astro/x.js?v=1')).toBe('_astro/x.js');
    expect(localFile(page, 'img/b%20c.png')).toBe('work/img/b c.png');
    expect(localFile(page, '../index.html')).toBe('index.html');
    for (const u of ['https://x.com/a.js', '//x.com/a.js', 'mailto:a@b.c', '#top', 'data:,x']) {
      expect(localFile(page, u)).toBeNull();
    }
  });
});

describe('pdf.mjs', () => {
  test('reads text, info fields and XMP from a PDF', () => {
    const xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"/>';
    const ctx = siteCtx(
      buildDir(null, {
        'a.pdf': makePdf({
          text: 'Hello there\nWorld of letters',
          info: { Author: 'A B', Company: 'C' },
          xmp,
          links: ['https://a.example/x'],
        }),
      }),
    );
    expect(pdfText(ctx, 'a.pdf')).toMatch(/Hello there\s+World of letters/);
    expect(pdfInfo(ctx, 'a.pdf')).toMatchObject({
      Author: 'A B',
      Company: 'C',
      'Custom Metadata': 'yes',
    });
    expect(pdfUrls(ctx, 'a.pdf')).toEqual(['https://a.example/x']);
    expect(pdfRaw(ctx, 'a.pdf')).toContain('xmpmeta');
  });

  test('an unreadable PDF throws, never reads as empty', () => {
    const ctx = siteCtx(buildDir(null, { 'bad.pdf': 'not a pdf' }));
    expect(() => pdfText(ctx, 'bad.pdf')).toThrow(/pdftotext could not read/);
  });
});

describe('private.mjs', () => {
  test('missing, empty (comments only) and ok', () => {
    const dir = fakePrivate({ 'a.txt': '# c\n\n', 'b.txt': '# c\n  Name One  \nTwo\n' });
    expect(privateState(dir, 'none.txt')).toBe('missing');
    expect(privateState(dir, 'a.txt')).toBe('empty');
    expect(privateState(dir, 'b.txt')).toBe('ok');
    expect(privateState(null, 'b.txt')).toBe('missing');
    expect(privateLines(dir, 'b.txt')).toEqual([
      { text: 'Name One', line: 2 },
      { text: 'Two', line: 3 },
    ]);
  });
});
