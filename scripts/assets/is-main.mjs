// True when this file was started directly (`node file.mjs`), also through a symlinked path.
// A plain `process.argv[1] === fileURLToPath(import.meta.url)` is false through a symlink
// (macOS /tmp is one), so the script would print nothing and exit 0 (ENG-07 lesson).
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isMain(metaUrl) {
  const entry = process.argv[1];
  return Boolean(entry) && realpathSync(entry) === realpathSync(fileURLToPath(metaUrl));
}
