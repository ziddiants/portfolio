// VF-13 tests (ENG-07, TC-B13): an outside link without rel="noopener noreferrer" or without the
// marker (↗ and "(opens in a new tab)") fails; mailto: and same-site links pass.
import { describe, expect, test } from 'vitest';
import vf13 from '../../scripts/verify/rules/vf-13.mjs';
import { golden } from './golden.mjs';
import { ids } from './helpers.mjs';

const MARK =
  '<span aria-hidden="true">↗</span><span class="visually-hidden">(opens in a new tab)</span>';
const link = (attrs, inner) =>
  golden({
    edit: { 'index.html': (s) => s.replace('</body>', `<a ${attrs}>${inner}</a></body>`) },
  });

describe('VF-13 outside links', () => {
  test.each([
    ['rel', 'href="https://example.com" target="_blank"', `Site ${MARK}`],
    ['rel', 'href="https://example.com" rel="noopener"', `Site ${MARK}`],
    ['rel', 'href="//example.com" rel="nofollow"', `Site ${MARK}`],
    ['marker', 'href="https://example.com" rel="noopener noreferrer"', 'Site'],
    ['marker', 'href="https://example.com" rel="noopener noreferrer"', 'Site ↗'],
    ['marker', 'href="https://example.com" rel="noopener noreferrer"', 'Site (opens in a new tab)'],
  ])('%s: <a %s> fails', (check, attrs, inner) => {
    expect(ids(vf13.run(link(attrs, inner)))).toEqual([`${check} index.html`]);
  });

  test('a link with both rel values and the marker passes; mailto: and same-site links pass', () => {
    expect(
      vf13.run(link('href="https://example.com" rel="noreferrer noopener"', `Site ${MARK}`)),
    ).toEqual([]);
    expect(vf13.run(link('href="mailto:pm@example.com"', 'Email'))).toEqual([]);
    expect(vf13.run(link('href="https://alpha-test.pages.dev/work/x"', 'Here'))).toEqual([]);
  });
});
