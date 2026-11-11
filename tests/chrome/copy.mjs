// The fixed strings of the page chrome (ENG-13), written out here on purpose: the specs do not read
// them from the code under test. tests/chrome/copy.test.mjs compares them with design-brand.md
// § Interface copy, so a change of the doc breaks that test first.
export const NAV = [
  ['Work', '/#work'],
  ['Projects', '/#projects'],
  ['How I think', '/#principles'],
  ['About', '/#about'],
  ['Experience', '/#experience'],
  ['Toolkit', '/#toolkit'],
  ['Contact', '/#contact'],
];
export const NAME = 'Aditya Gupta';
export const RESUME = 'Résumé';
export const MENU = 'Menu';
export const MENU_CLOSE = 'Close';
export const SKIP = 'Skip to content';
export const THEME_LABEL = 'Dark theme';
export const TITLE_TO_DARK = 'Switch to dark theme';
export const TITLE_TO_LIGHT = 'Switch to light theme';
export const DOWNLOADING = 'Downloading';
export const RESUME_FILE = 'Aditya-Gupta-Resume.pdf';
export const RESUME_HREF = `/${RESUME_FILE}`;

/** "© 2026 Aditya Gupta · Updated 2 Nov 2026": the date part is a day, a 3-letter month, a year. */
export const FOOTER_RE =
  /^© 2026 Aditya Gupta · Updated (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/;

/** The head theme script, whitespace folded (design-brand.md § Engineering handoff). */
export const THEME_SCRIPT =
  "try { var t = localStorage.getItem('theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}";
export const fold = (s) => s.replace(/\s+/g, ' ').trim();

/** The first element in <head> of a page's HTML, as { tag, text }; null when there is none. */
export function firstInHead(html) {
  const m = /<head[^>]*>\s*<([a-z]+)([^>]*)>([\s\S]*?)(?:<\/\1>|$)/i.exec(html);
  return m ? { tag: m[1].toLowerCase(), attrs: m[2].trim(), text: m[3] } : null;
}
