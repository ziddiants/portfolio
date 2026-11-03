// Runs gitleaks and turns its JSON report into verify findings (VF-16, ENG-06).
// Exit codes: gitleaks uses 1 for its own errors, so leaks get exit code 2 here. Any other
// non-zero code, or a missing binary, is a finding. A scan that could not run is never a pass.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LEAKS_FOUND = 2;

/**
 * @param {string} root  repo root: gitleaks runs here and reads .gitleaksignore here
 * @param {string[]} args  for example ['git', '--staged'] or ['dir', 'dist/payments']
 * @returns {{ file: string, line: number, message: string, fix: string, fingerprint?: string }[]}
 */
export function scan(root, args) {
  const tmp = mkdtempSync(join(tmpdir(), 'gitleaks-'));
  const report = join(tmp, 'report.json');
  try {
    const r = spawnSync(
      'gitleaks',
      [
        ...args,
        '--redact',
        '--no-banner',
        '--exit-code',
        String(LEAKS_FOUND),
        '--report-format',
        'json',
        '--report-path',
        report,
        '--gitleaks-ignore-path',
        root,
        // A "gitleaks:allow" comment must not switch the scan off. Only .gitleaksignore may.
        '--ignore-gitleaks-allow',
      ],
      { cwd: root, encoding: 'utf8' },
    );
    if (r.error?.code === 'ENOENT') {
      return [
        {
          file: '',
          message: 'gitleaks is not installed, so no secret scan ran',
          fix: 'run: brew install gitleaks',
        },
      ];
    }
    if (r.status === 0) return [];
    if (r.status !== LEAKS_FOUND) {
      return [
        {
          file: '',
          message: `gitleaks failed (exit ${r.status}): ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`,
          fix: 'run the same gitleaks command by hand and read its error',
        },
      ];
    }
    const leaks = JSON.parse(readFileSync(report, 'utf8'));
    if (!Array.isArray(leaks) || leaks.length === 0) {
      return [
        {
          file: '',
          message: 'gitleaks reported leaks (exit 2) but its report is empty or unreadable',
          fix: 'run the same gitleaks command by hand and read its output',
        },
      ];
    }
    return leaks.map((l) => ({
      file: l.File,
      line: l.StartLine,
      message: `secret found (${l.RuleID})${l.Commit ? ` in commit ${l.Commit.slice(0, 8)}` : ''}`,
      fix:
        'rotate the key now, then remove it from the file. A public demo login may instead be ' +
        `allowed by adding this line to .gitleaksignore: ${l.Fingerprint}`,
      fingerprint: l.Fingerprint,
    }));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
