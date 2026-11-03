// Writes one version's _headers and robots.txt into its assembled public folder.
// STUB (ENG-04). ENG-23 writes the real security headers, caching and the indexing rules.
// Until then it is safe by default: every version tells crawlers to stay out, so no
// preview or early deploy can be indexed (review note N1).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeHeaders(settings, publicDir) {
  writeFileSync(
    join(publicDir, '_headers'),
    `# ${settings.id}: header stub (ENG-04). ENG-23 writes the real headers.\n`,
  );
  writeFileSync(join(publicDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
}
