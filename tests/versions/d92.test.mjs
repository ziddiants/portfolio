// D92 (ENG-09): the ₹20–25L vendor-dues bullet stays on the Payments résumé PDF and is never put
// on a site page. Its figure is left out of approvedNumbers, so VF-08 fails any page that shows
// it, and its bullet is left out of carinfoBullets, which is where the pages copy bullets from.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (id) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../versions/${id}/version.json`, import.meta.url)),
      'utf8',
    ),
  );
const FIGURE = /20\s*[–—-]\s*25\s*L/i;
const BULLET = /untracked\s+PG\/vendor\s+dues/i;

for (const id of ['payments', 'consumer']) {
  test(`${id}: the vendor-dues figure and bullet are not page data (D92)`, () => {
    const v = read(id);
    assert.ok(!v.approvedNumbers.some((n) => FIGURE.test(n)), 'figure in approvedNumbers');
    assert.ok(
      !v.carinfoBullets.some((b) => FIGURE.test(b) || BULLET.test(b)),
      'bullet in carinfoBullets',
    );
  });
}

test('payments still lists four CarInfo bullets (the four D92 leaves on pages)', () => {
  assert.equal(read('payments').carinfoBullets.length, 4);
});
