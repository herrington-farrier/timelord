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

  it('hits the first of the month for monthly cadence', () => {
    expect(cadenceHitsDate({ kind: 'monthly', dayOfMonth: 1 }, '2026-09-01')).toBe(true);
  });
});
