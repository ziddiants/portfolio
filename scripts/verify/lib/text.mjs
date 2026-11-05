// Text folding shared by the verify rules (ENG-07). Every text rule compares folded text, so the
// same words match however the build wrote them: Markdown turns ' into ’, a hyphen can be a
// non-breaking one, and spaces can be non-breaking or doubled.

/** NFKC, straight quotes, plain hyphens, single spaces, trimmed. */
export function fold(s) {
  return s
    .normalize('NFKC')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first `max` characters of a text, for a finding message. */
export const snippet = (s, max = 80) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** A string as a literal piece of a regular expression. */
export const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
