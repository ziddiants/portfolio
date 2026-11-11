// The page script (ENG-13): the phone menu (DR-IX6), the theme button (DR-IX7) and the section
// highlight (DR-IX12). One file, bundled under /_astro/ (astro.config.mjs keeps it out of the HTML).
// With the inline theme script it stays under 1,650 bytes (the end-of-page mark, the download cue and
// the review fixes took the margin from 1,400), so the Copy buttons (ENG-15, ENG-16) fit in VF-10's
// 2,000 with about 350 bytes: they add a branch to the one document click handler. The markup and
// CSS carry the rest: the menu label, icon and panel follow aria-expanded, and the theme icon follows
// data-theme. ARIA properties (ariaExpanded) save bytes.
const root = document.documentElement;
const header = document.querySelector<HTMLElement>('.site-header')!;
const menu = header.querySelector<HTMLButtonElement>('.menu-button')!;
const theme = header.querySelector<HTMLButtonElement>('.theme-toggle')!;
const links = [...header.querySelectorAll<HTMLAnchorElement>('.links a')];
const dark = matchMedia('(prefers-color-scheme: dark)');

// Menu: closes on Esc, on choosing a link and on a tap outside, and gives focus back to the button.
const isOpen = () => menu.ariaExpanded === 'true';
// Focus goes back one tick later: the jump to a #section runs after the click handler and moves
// focus to the page, so an immediate focus() would be lost.
const toggle = (open: boolean, focus?: boolean) => {
  menu.ariaExpanded = String(open);
  if (focus) setTimeout(() => menu.focus({ preventScroll: true }));
};
menu.onclick = () => toggle(!isOpen());
// A block body, not `&&`: an on-handler that returns false cancels the key (Tab and Enter too).
document.onkeydown = (e) => {
  if (e.key === 'Escape' && isOpen()) toggle(false, true);
};
// One click handler for the page. A download button that has a busy label (D101) shows it for 2
// seconds: the browser does the download and tells the page nothing, so the cue says only that it
// started. A download link does not close the menu, or the cue would be hidden.
document.onclick = (e) => {
  const target = e.target as Element;
  const cue = target.closest<HTMLElement>('a[data-cue]');
  if (cue) {
    cue.dataset.wait = '';
    setTimeout(() => delete cue.dataset.wait, 2000);
  }
  if (isOpen() && (target.closest('#site-menu a:not([download])') || !header.contains(target))) {
    toggle(false, true);
  }
};

// Theme: the pick is data-theme on <html>, kept in localStorage (the head script reads it back).
const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : dark.matches);
const syncTheme = () => {
  theme.ariaPressed = String(isDark());
  theme.title = `Switch to ${isDark() ? 'light' : 'dark'} theme`;
  const colour = getComputedStyle(root).backgroundColor; // html paints --color-bg
  document
    .querySelectorAll<HTMLMetaElement>('meta[name=theme-color]')
    .forEach((m) => (m.content = colour));
};
theme.onclick = () => {
  const pick = isDark() ? 'light' : 'dark';
  root.dataset.theme = pick;
  try {
    localStorage.setItem('theme', pick);
  } catch {
    // Storage is blocked: the pick holds for this page view only.
  }
  syncTheme();
};
dark.onchange = syncTheme;
syncTheme();

// Highlight (DR-IX12): the last section whose top is above 40% of the window is marked. At the very
// end of the page the last section is marked too: a short last section never gets its top that high.
// The observers only say when something crosses (a section the 40% line, the footer the window
// edge); the answer is worked out from positions. Below 1100 px the link list is display:none, so a
// mark there is neither seen nor read. A page that does not have all seven sections (a detail page)
// keeps the mark its markup gave it, even if one of its headings happens to use an id like "about".
// The page end counts only when the page scrolls (a page that fits has no end to reach).
const sections = links
  .map((a) => document.querySelector(`main > section${a.hash}`)!)
  .filter(Boolean);
const update = () => {
  const end = scrollY > 0 && innerHeight + scrollY >= root.scrollHeight - 1;
  const now = (
    end
      ? sections.at(-1)
      : sections.findLast((s) => s.getBoundingClientRect().top <= innerHeight * 0.4)
  )?.id;
  links.forEach((a) => (a.ariaCurrent = now && a.hash === `#${now}` ? 'true' : null));
};
if (sections.length === links.length) {
  const line = new IntersectionObserver(update, { rootMargin: '-40% 0px -60% 0px' });
  sections.forEach((s) => line.observe(s));
  new IntersectionObserver(update, { threshold: 1 }).observe(document.querySelector('footer')!);
}
