// The CarInfo payment-flow diagram (DS-DIA, ENG-11). Hand-written inline SVG, real text, no hex values:
// colours come from tokens (var(--color-*)) in the stylesheet of CarInfoDiagram.astro.
// Steps and colours follow the content pack, line 223. Title and description follow line 400.
// A pre-payment screen and a confirmation screen stay out until Aditya confirms them at M3.
// Redrawn from the summary only: no partner logos, no screen captures, no fees (D31).

export type Layout = 'row' | 'column';

export const DIAGRAM_TITLE = 'How a CarInfo payment flows after the change';
export const DIAGRAM_DESC =
  "A customer pays. Routing picks a gateway; if that gateway fails, the payment switches automatically to another. If it fails on the customer's side, a retry page shows the bank's error in plain words and why a retry should work.";
export const DIAGRAM_KEY = ['Indigo: what we added.', 'Grey: what already existed.'] as const;

type Kind = 'new' | 'old';
interface Node {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: Kind;
  lines: string[];
}
interface Edge {
  d: string;
  label?: { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end' };
}
interface Plan {
  width: number;
  height: number;
  nodes: Node[];
  edges: Edge[];
  keyY: number;
  keyStacked: boolean;
}

const N = (x: number, y: number, w: number, h: number, kind: Kind, ...lines: string[]): Node => ({
  x,
  y,
  w,
  h,
  kind,
  lines,
});

// Wide layout (from 600 px): the main flow runs left to right; the failure branch drops to a second lane.
const ROW: Plan = {
  width: 844,
  height: 330,
  keyY: 306,
  keyStacked: false,
  nodes: [
    N(0, 20, 120, 72, 'old', 'Customer pays'),
    N(156, 20, 140, 72, 'new', 'Routing', 'picks a gateway', 'from its signals'),
    N(332, 20, 120, 72, 'old', 'Gateway A'),
    N(548, 20, 140, 72, 'new', 'Automatic switch'),
    N(724, 20, 120, 72, 'old', 'Gateway B'),
    N(335, 184, 150, 72, 'new', 'Retry page', 'error in plain words'),
    N(176, 184, 100, 72, 'new', 'Retry'),
  ],
  edges: [
    { d: 'M120 56H156' },
    { d: 'M296 56H332' },
    { d: 'M452 56H548', label: { x: 500, y: 44, text: 'gateway fault', anchor: 'middle' } },
    { d: 'M688 56H724' },
    { d: 'M392 92V184', label: { x: 402, y: 144, text: 'user-side failure', anchor: 'start' } },
    { d: 'M335 220H276' },
    { d: 'M226 184V92' },
  ],
};

// Narrow layout (under 600 px): the same flow, top to bottom, with the two branches side by side.
const COLUMN: Plan = {
  width: 404,
  height: 566,
  keyY: 534,
  keyStacked: true,
  nodes: [
    N(0, 0, 320, 48, 'old', 'Customer pays'),
    N(0, 88, 320, 72, 'new', 'Routing', 'picks a gateway', 'from its signals'),
    N(100, 200, 120, 48, 'old', 'Gateway A'),
    N(0, 330, 150, 48, 'new', 'Automatic switch'),
    N(0, 418, 150, 48, 'old', 'Gateway B'),
    N(170, 330, 150, 72, 'new', 'Retry page', 'error in plain words'),
    N(170, 442, 150, 48, 'new', 'Retry'),
  ],
  edges: [
    { d: 'M160 48V88' },
    { d: 'M160 160V200' },
    { d: 'M160 248V280H75V330', label: { x: 83, y: 312, text: 'gateway fault', anchor: 'start' } },
    {
      d: 'M160 280H245V330',
      label: { x: 253, y: 312, text: 'user-side failure', anchor: 'start' },
    },
    { d: 'M75 378V418' },
    { d: 'M245 402V442' },
    { d: 'M320 466H384V124H320' },
  ],
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function nodeSvg(n: Node): string {
  const cx = n.x + n.w / 2;
  const lineH = 20;
  const firstY = n.y + n.h / 2 - ((n.lines.length - 1) * lineH) / 2 + 5;
  const text = n.lines
    .map((t, i) => {
      const cls = i === 0 && n.lines.length > 1 ? ' class="cd-strong"' : '';
      return `<tspan x="${cx}" y="${firstY + i * lineH}"${cls}>${esc(t)}</tspan>`;
    })
    .join('');
  return (
    `<rect class="cd-${n.kind}" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="4"/>` +
    `<text class="cd-text" text-anchor="middle">${text}</text>`
  );
}

/** One layout as an SVG string. `id` is a prefix that keeps ids unique when both layouts share a page. */
export function diagramSvg(layout: Layout): string {
  const p = layout === 'row' ? ROW : COLUMN;
  const id = `carinfo-${layout}`;
  const marker =
    `<marker id="${id}-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">` +
    '<path class="cd-head" d="M0 1 10 5 0 9z"/></marker>';
  const edges = p.edges
    .map((e) => {
      const line = `<path class="cd-edge" d="${e.d}" marker-end="url(#${id}-arrow)"/>`;
      const l = e.label;
      const label = l
        ? `<text class="cd-label" x="${l.x}" y="${l.y}" text-anchor="${l.anchor ?? 'middle'}">${esc(l.text)}</text>`
        : '';
      return line + label;
    })
    .join('');
  const keyX = [0, 0];
  const keyYs = p.keyStacked ? [p.keyY, p.keyY + 26] : [p.keyY, p.keyY];
  if (!p.keyStacked) keyX[1] = 236;
  const key = DIAGRAM_KEY.map(
    (t, i) =>
      `<path class="cd-${i === 0 ? 'new' : 'old'}" d="M${keyX[i]} ${keyYs[i] - 5}h28"/>` +
      `<text class="cd-label" x="${keyX[i] + 38}" y="${keyYs[i]}">${esc(t)}</text>`,
  ).join('');
  return (
    `<svg class="cd-${layout}" viewBox="0 0 ${p.width} ${p.height}" role="img" aria-labelledby="${id}-title ${id}-desc" xmlns="http://www.w3.org/2000/svg">` +
    `<title id="${id}-title">${esc(DIAGRAM_TITLE)}</title>` +
    `<desc id="${id}-desc">${esc(DIAGRAM_DESC)}</desc>` +
    `<defs>${marker}</defs>` +
    p.nodes.map(nodeSvg).join('') +
    edges +
    key +
    '</svg>'
  );
}
