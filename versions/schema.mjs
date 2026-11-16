// The version settings file (versions/<id>/version.json), checked before every build (V2).
// Field list and meaning: ERD § Multi-version build design. Unknown fields are rejected (TC-A05).
import { z } from 'astro/zod';

// Lowercase words joined by single hyphens. Used for folder names and paths, so it must
// never hold a slash, a dot or an upper-case letter.
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// A plain file name inside the version folder: no folder part, no "..".
// Each type names its own plain message, so no Zod default text reaches Aditya.
const str = () => z.string({ error: 'must be text' });

const fileName = str().regex(
  /^[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)+$/,
  'must be a plain file name in the version folder',
);

const text = str().trim().min(1, 'must not be empty');
// One figure of the hero proof strip (D106): "45% → 63%" is before + after; "+16%" is after only.
const proofItem = z.object({ before: text.optional(), after: text, label: text }).strict();
const list = (message) => z.array(text, { error: 'must be a list of text' }).min(1, message);

export const versionSchema = z
  .object({
    id: str().regex(SLUG, 'must be a lowercase slug'),
    siteUrl: z.url({ protocol: /^https$/, error: 'must be an https URL' }),
    pagesProject: str().regex(SLUG, 'must be a lowercase slug'),
    pageTitle: text,
    heroSubline: text,
    proofStrip: z
      .array(proofItem, { error: 'must be a list of figures' })
      .min(3, 'must list 3 or 4 figures')
      .max(4, 'must list 3 or 4 figures'),
    carinfoBullets: list('must list at least one bullet'),
    ogImage: fileName,
    indexable: z.boolean({ error: 'must be true or false' }),
    analyticsToken: text,
    approvedNumbers: list('must list at least one number'),
  })
  .strict();

// Every field name, in schema order. load.mjs uses it to tell "missing" from "wrong".
export const FIELDS = Object.keys(versionSchema.shape);
