// Build-time checks for component inputs (ENG-12). A wrong input stops the build with a plain
// message; nothing wrong reaches a page. Each check is a function so a test can feed it one bad
// input at a time.

/** ExternalLink: only an outside address (https or http). Inside links use Link. */
export function assertOutsideHref(href: string): void {
  if (!/^https?:\/\//i.test(href)) {
    throw new Error(
      `ExternalLink: "${href}" is not an outside address; use Link or a mailto: link`,
    );
  }
}

/** MarginNote: a source ID such as S-014 (VF-05 checks it against the private register). */
export function assertSourceId(source: string): void {
  if (!/^S-\d{3}$/.test(source)) throw new Error(`MarginNote: "${source}" is not a source ID`);
}

/** SectionHeader: the label number runs 01 to 07 (PRD H1). */
export function assertSectionNumber(number: string): void {
  if (!/^0[1-7]$/.test(number)) throw new Error(`SectionHeader: "${number}" is not 01 to 07`);
}

/** Figure: the caption is always required; an image needs alt text; a diagram needs its slot. */
export function assertFigure(input: {
  caption: string;
  hasImage: boolean;
  alt?: string;
  hasSlot: boolean;
}): void {
  if (!input.caption.trim()) throw new Error('Figure: caption must not be empty');
  if (input.hasImage && !input.alt?.trim()) throw new Error('Figure: an image needs alt text');
  if (!input.hasImage && !input.hasSlot) throw new Error('Figure: give it a src or a diagram');
}
