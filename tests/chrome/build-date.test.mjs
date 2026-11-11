// The footer date (DS-CMP-19): "2 Nov 2026", the day in India (IST), a fixed three-letter month.
import { describe, expect, test } from 'vitest';
import { formatBuildDate } from '../../src/lib/build-date.ts';

describe('formatBuildDate', () => {
  test.each([
    ['2026-01-05T12:00:00Z', '5 Jan 2026'],
    ['2026-02-05T12:00:00Z', '5 Feb 2026'],
    ['2026-03-05T12:00:00Z', '5 Mar 2026'],
    ['2026-04-05T12:00:00Z', '5 Apr 2026'],
    ['2026-05-05T12:00:00Z', '5 May 2026'],
    ['2026-06-05T12:00:00Z', '5 Jun 2026'],
    ['2026-07-05T12:00:00Z', '5 Jul 2026'],
    ['2026-08-05T12:00:00Z', '5 Aug 2026'],
    ['2026-09-05T12:00:00Z', '5 Sep 2026'], // Intl en-GB writes "Sept"
    ['2026-10-05T12:00:00Z', '5 Oct 2026'],
    ['2026-11-02T12:00:00Z', '2 Nov 2026'],
    ['2026-12-05T12:00:00Z', '5 Dec 2026'],
  ])('%s → %s', (iso, want) => {
    expect(formatBuildDate(new Date(iso))).toBe(want);
  });

  test('the day is the IST day: 20:00 UTC on 31 Dec is already 1 Jan in India', () => {
    expect(formatBuildDate(new Date('2026-12-31T20:00:00Z'))).toBe('1 Jan 2027');
  });
  test('the day is the IST day: 18:29 UTC is still the same day, 18:30 UTC is the next', () => {
    expect(formatBuildDate(new Date('2026-11-02T18:29:00Z'))).toBe('2 Nov 2026');
    expect(formatBuildDate(new Date('2026-11-02T18:30:00Z'))).toBe('3 Nov 2026');
  });
  test('no leading zero on the day', () => {
    expect(formatBuildDate(new Date('2026-11-09T05:00:00Z'))).toBe('9 Nov 2026');
  });
  test('a bad date stops the build', () => {
    expect(() => formatBuildDate(new Date('nope'))).toThrow();
  });
});
