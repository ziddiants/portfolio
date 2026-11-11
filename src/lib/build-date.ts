// The footer date (DS-CMP-19): "2 Nov 2026". The day is the day in India (IST, UTC+5:30, no summer
// time), and the month is a fixed three-letter name. Intl would write "Sept" for September in
// en-GB and would follow the machine's time zone; the copy rules (§ Interface copy) allow neither.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

export function formatBuildDate(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error('formatBuildDate: not a valid date');
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}
