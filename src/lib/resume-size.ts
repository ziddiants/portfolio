// The size of this build's résumé, for the hero button's label ("Résumé · PDF, 118 KB").
// The assembler copies the file to .build/public-<id>/ before every build and dev server
// (scripts/assemble-public.mjs). A missing file stops the build: a label with a wrong size is worse.
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { RESUME_NAME } from './resume-name.mjs';

export function resumeBytes(versionId: string, root = process.cwd()): number {
  const file = join(root, '.build', `public-${versionId}`, RESUME_NAME);
  try {
    return statSync(file).size;
  } catch {
    throw new Error(
      `resumeBytes: ${file} is missing. Run npm run build or npm run dev:${versionId}: they copy the résumé first.`,
    );
  }
}
