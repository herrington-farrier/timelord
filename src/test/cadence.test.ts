import { describe, expect, it } from 'vitest';

import { cadenceHitsDate, weekdayFromKey } from '../domain/cadence';
import type { Weekday } from '../domain/types';

describe('cadenceHitsDate', () => {
  it('treats 2026-08-31 as a Monday', () => {
    expect(weekdayFromKey('2026-08-31')).toBe('Mon');
  });

  it('hits every day for daily cadence', () => {
    expect(cadenceHitsDate({ kind: 'daily' }, '2026-08-30')).toBe(true);
  });

  it('skips Saturday for weekdays cadence', () => {
    expect(cadenceHitsDate({ kind: 'weekdays' }, '2026-08-29')).toBe(false);
  });

  it('hits Saturday for weekends cadence', () => {
    expect(cadenceHitsDate({ kind: 'weekends' }, '2026-08-29')).toBe(true);
  });

  it('hits listed weekdays for weekly cadence', () => {
    expect(cadenceHitsDate({ kind: 'weekly', days: ['Tue', 'Fri'] }, '2026-08-28')).toBe(true);
  });

  it('does not hit Monday for every-other-day starting Tuesday', () => {
    expect(
      cadenceHitsDate({ kind: 'everyNDays', n: 2, startWeekday: 'Tue' }, '2000-01-03')
    ).toBe(false);
  });

  it('hits the start weekday for every-other-day', () => {
    expect(
      cadenceHitsDate({ kind: 'everyNDays', n: 2, startWeekday: 'Tue' }, '2000-01-04')
    ).toBe(true);
  });

  it('does not hit a matching day before startDate', () => {
    const cadence = { kind: 'everyNDays' as const, n: 2, startWeekday: 'Tue' as const, startDate: '2000-01-10' };
    expect(cadenceHitsDate(cadence, '2000-01-04')).toBe(false);
    expect(cadenceHitsDate(cadence, '2000-01-08')).toBe(false);
  });

  it('hits the first matching day on or after startDate', () => {
    const cadence = { kind: 'everyNDays' as const, n: 2, startWeekday: 'Tue' as const, startDate: '2000-01-10' };
    expect(cadenceHitsDate(cadence, '2000-01-10')).toBe(true);
    expect(cadenceHitsDate(cadence, '2000-01-11')).toBe(false);
  });

  it('counts from startDate, not from the weekday lattice', () => {
    // 2026-09-03 is a Thursday. Every 28 days from it: Oct 1, Oct 29.
    const cadence = { kind: 'everyNDays' as const, n: 28, startWeekday: 'Thu' as const, startDate: '2026-09-03' };
    expect(cadenceHitsDate(cadence, '2026-09-03')).toBe(true);
    expect(cadenceHitsDate(cadence, '2026-10-01')).toBe(true);
    expect(cadenceHitsDate(cadence, '2026-10-29')).toBe(true);
    // The right weekday in between is not a hit.
    expect(cadenceHitsDate(cadence, '2026-09-10')).toBe(false);
    expect(cadenceHitsDate(cadence, '2026-09-17')).toBe(false);
    expect(cadenceHitsDate(cadence, '2026-09-24')).toBe(false);
  });

  it('keeps two streams on the same weekday and n apart', () => {
    // The reported bug: four 28-day appointments with different start dates
    // all landed on the same day, because only the weekday set the phase.
    const a = { kind: 'everyNDays' as const, n: 28, startWeekday: 'Thu' as const, startDate: '2026-09-03' };
    const b = { kind: 'everyNDays' as const, n: 28, startWeekday: 'Thu' as const, startDate: '2026-09-10' };
    expect(cadenceHitsDate(a, '2026-09-03')).toBe(true);
    expect(cadenceHitsDate(b, '2026-09-03')).toBe(false);
    expect(cadenceHitsDate(a, '2026-09-10')).toBe(false);
    expect(cadenceHitsDate(b, '2026-09-10')).toBe(true);
  });

  it('still uses the weekday lattice when no startDate is given', () => {
    expect(cadenceHitsDate({ kind: 'everyNDays', n: 28, startWeekday: 'Tue' }, '2000-01-04')).toBe(true);
    expect(cadenceHitsDate({ kind: 'everyNDays', n: 28, startWeekday: 'Tue' }, '2000-02-01')).toBe(true);
    expect(cadenceHitsDate({ kind: 'everyNDays', n: 28, startWeekday: 'Tue' }, '2000-01-11')).toBe(false);
  });

  it('survives a cadence with no anchor at all', () => {
    // startWeekday is no longer written, so the shape is reachable. It must
    // still phase consistently rather than throwing or hitting every day.
    const cadence = { kind: 'everyNDays' as const, n: 3 };
    const hits = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].filter((d) =>
      cadenceHitsDate(cadence, d)
    );
    expect(hits).toHaveLength(2);
  });

  it('hits the first of the month for monthly cadence', () => {
    expect(cadenceHitsDate({ kind: 'monthly', dayOfMonth: 1 }, '2026-09-01')).toBe(true);
  });
});

describe('bucket days bound the cadence', () => {
  // Garden runs weekends only; mow every 60 days. 60 walks through the week,
  // so most occurrences land on a day the bucket is shut.
  const garden: Weekday[] = ['Sat', 'Sun'];
  const mow = { kind: 'everyNDays' as const, n: 60, startDate: '2026-09-05' }; // a Saturday

  it('never runs on a day the bucket is closed', () => {
    for (const d of ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']) {
      expect(cadenceHitsDate(mow, d, garden)).toBe(false);
    }
  });

  it('moves an occurrence forward to the next open day instead of losing it', () => {
    // 60 days from Sat Sep 5 is Wed Nov 4 — closed. It should land Sat Nov 7.
    expect(cadenceHitsDate(mow, '2026-11-04', garden)).toBe(false);
    expect(cadenceHitsDate(mow, '2026-11-07', garden)).toBe(true);
  });

  it('keeps the rhythm rather than drifting from the push', () => {
    // The third occurrence still counts from the anchor, not from the pushed
    // date: Sep 5 + 120 = Sun Jan 3, which is open and lands as-is.
    expect(cadenceHitsDate(mow, '2027-01-03', garden)).toBe(true);
  });

  it('lands on the start date itself when that day is open', () => {
    expect(cadenceHitsDate(mow, '2026-09-05', garden)).toBe(true);
  });

  it('leaves an unrestricted bucket exactly as it was', () => {
    expect(cadenceHitsDate(mow, '2026-11-04', [])).toBe(true);
    expect(cadenceHitsDate(mow, '2026-11-04')).toBe(true);
  });

  it('does not stack a daily item onto one open day', () => {
    // Dense cadences are filtered, not pushed — there is another one tomorrow.
    const weekdaysOnly: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    expect(cadenceHitsDate({ kind: 'daily' }, '2026-09-05', weekdaysOnly)).toBe(false);
    expect(cadenceHitsDate({ kind: 'daily' }, '2026-09-07', weekdaysOnly)).toBe(true);
  });

  it('moves a monthly item off a closed day too', () => {
    // The 1st of Nov 2026 is a Sunday; a weekday bucket takes it on Monday.
    const weekdaysOnly: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const monthly = { kind: 'monthly' as const, dayOfMonth: 1 };
    expect(cadenceHitsDate(monthly, '2026-11-01', weekdaysOnly)).toBe(false);
    expect(cadenceHitsDate(monthly, '2026-11-02', weekdaysOnly)).toBe(true);
  });

  it('fires once when several occurrences crowd the same open day', () => {
    // Every 2 days into a Monday-only bucket: Mondays, and only Mondays.
    const monday: Weekday[] = ['Mon'];
    const often = { kind: 'everyNDays' as const, n: 2, startDate: '2026-09-07' };
    const hits = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-14'].filter((d) =>
      cadenceHitsDate(often, d, monday)
    );
    expect(hits).toEqual(['2026-09-07', '2026-09-14']);
  });
});
