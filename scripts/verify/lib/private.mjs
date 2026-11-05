// The private folder (ERD § Repository layout, D82). VF-02 reads names.txt and VF-05 reads
// content-sources.md from it. It lives in the vault, never in this repo.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** $PORTFOLIO_PRIVATE_DIR, or ~/my_builds/portfolio/private. */
export function privateDir(env = process.env) {
  return env.PORTFOLIO_PRIVATE_DIR || join(homedir(), 'my_builds', 'portfolio', 'private');
}

/** 'ok', 'missing' or 'empty'. A file with only blank lines and comments is empty. */
export function privateState(dir, name) {
  if (!dir) return 'missing';
  const path = join(dir, name);
  if (!existsSync(path) || !statSync(path).isFile()) return 'missing';
  return privateLines(dir, name).length > 0 ? 'ok' : 'empty';
}

/**
 * The file's lines with their 1-based line numbers, without blank lines and comments. A comment
 * is "#" alone or "# " and text: "#growth-pod" is a label (a Slack channel), not a comment.
 */
export function privateLines(dir, name) {
  return readFileSync(join(dir, name), 'utf8')
    .split(/\r?\n/)
    .map((text, i) => ({ text: text.trim(), line: i + 1 }))
    .filter((l) => l.text !== '' && !/^#(\s|$)/.test(l.text));
}

/** The whole file as text. */
export const privateText = (dir, name) => readFileSync(join(dir, name), 'utf8');
