import { describe, expect, it } from 'vitest';

import { cadenceHitsDate, weekdayFromKey } from '../domain/cadence';

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

  it('hits the first of the month for monthly cadence', () => {
    expect(cadenceHitsDate({ kind: 'monthly', dayOfMonth: 1 }, '2026-09-01')).toBe(true);
  });
});
