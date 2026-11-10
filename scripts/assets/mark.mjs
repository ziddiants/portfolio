// The mark (DS-MARK): "AG" on an accent square. The letters are drawn as paths, not <text>,
// so the mark looks the same on every machine (no dependency on a system font).
// The shapes approximate weight-600 system type. Aditya approves them by eye.
// Numbers in the path data are joined by commas where a long run of digits would otherwise form: the
// VF-01 phone check reads a run of digits and spaces as a possible number ("6.6 6.6 0 1 0 28.8" matched).
import { BRAND } from './brand.mjs';

const LETTERS =
  '<path d="M3.8 23.6 7.7 8.4l3.9 15.2M5 19h5.4"/>' +
  '<path d="M27.6 12.2A6.6,6.6,0,1,0,28.8,16h-6.2"/>';

/**
 * Returns the mark as an SVG string on a 32-unit grid.
 * rounded: true gives the 6/32 corners (favicon, "any" icons). false gives a full-bleed
 * square (Apple touch icon and maskable icon: the system applies its own mask).
 */
export function markSvg({ rounded = true } = {}) {
  const rx = rounded ? ' rx="6"' : '';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    `<rect width="32" height="32"${rx} fill="${BRAND.accent}"/>` +
    `<g transform="translate(16 16) scale(.78) translate(-16.3 -16)" fill="none" stroke="${BRAND.onAccent}" stroke-width="2.8" stroke-linejoin="round">` +
    LETTERS +
    '</g></svg>\n'
  );
}
