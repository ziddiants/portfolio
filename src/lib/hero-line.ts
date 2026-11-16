// The hero line with a no-break space before its last word, so the last line is never one word
// alone (DR-K3). A line with no space is returned as it is. The rendering only changes the space;
// the approved copy in src/content/home/hero.yaml is not touched (C14).
const NBSP = ' ';

export function keepLastWordsTogether(line: string): string {
  const cut = line.lastIndexOf(' ');
  return cut > 0 ? `${line.slice(0, cut)}${NBSP}${line.slice(cut + 1)}` : line;
}
