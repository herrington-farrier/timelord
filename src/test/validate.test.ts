import { describe, expect, it } from 'vitest';

import {
  clampRangeDays,
  isDateKey,
  parseBucketDays,
  parseCadence,
  parseDateKey,
  parseEnum,
  parseId,
  parseWeekdays,
  resolveBucketKind,
  ValidationError,
} from '../domain/validate';

describe('date keys', () => {
  it('accepts a real date', () => {
    expect(parseDateKey(' 2026-02-28 ', 'Date')).toBe('2026-02-28');
    expect(parseDateKey('2028-02-29', 'Date')).toBe('2028-02-29');
  });

  it.each(['', '2026-2-3', '2026-02-30', '2026-13-01', '2026-00-10', '20260228', '2026-02-28T00:00', 'tomorrow', 5, null])(
    'refuses %j',
    (bad) => {
      expect(isDateKey(bad)).toBe(false);
      expect(() => parseDateKey(bad, 'Date')).toThrow(ValidationError);
    }
  );
});

describe('ids', () => {
  it('accepts an ordinary id', () => expect(parseId('id_abc_123', 'Item')).toBe('id_abc_123'));

  it.each(['', '  ', 'a/b', '../x', '..', '.', '__name__', 'x'.repeat(201), 7, undefined])('refuses %j', (bad) => {
    expect(() => parseId(bad, 'Item')).toThrow(ValidationError);
  });
});

describe('enums', () => {
  it('refuses a value outside the list', () => {
    expect(parseEnum('daily', ['daily', 'weekly'] as const, 'Repeat')).toBe('daily');
    expect(() => parseEnum('hourly', ['daily', 'weekly'] as const, 'Repeat')).toThrow(/one of daily, weekly/);
    expect(() => parseEnum(undefined, ['daily'] as const, 'Repeat')).toThrow(ValidationError);
  });
});

describe('weekdays', () => {
  it('keeps week order and drops duplicates', () => {
    expect(parseWeekdays(['Fri', 'Mon', 'Fri'], 'Days')).toEqual(['Mon', 'Fri']);
  });
  it('refuses a non-weekday and a non-list', () => {
    expect(() => parseWeekdays(['Mon', 'Funday'], 'Days')).toThrow(ValidationError);
    expect(() => parseWeekdays('Mon', 'Days')).toThrow(ValidationError);
  });
});

describe('cadence', () => {
  it('defaults a missing cadence to daily', () => expect(parseCadence(undefined)).toEqual({ kind: 'daily' }));

  it('rebuilds each shape from known fields only', () => {
    expect(parseCadence({ kind: 'weekdays', evil: 1 })).toEqual({ kind: 'weekdays' });
    expect(parseCadence({ kind: 'weekly', days: ['Sat', 'Mon'], x: 1 })).toEqual({ kind: 'weekly', days: ['Mon', 'Sat'] });
    expect(parseCadence({ kind: 'everyNDays', n: '3', startDate: '2026-01-05' })).toEqual({
      kind: 'everyNDays',
      n: 3,
      startDate: '2026-01-05',
    });
    expect(parseCadence({ kind: 'monthly', dayOfMonth: 31 })).toEqual({ kind: 'monthly', dayOfMonth: 31 });
  });

  it.each([
    'daily',
    { kind: 'sometimes' },
    { kind: 'weekly', days: [] },
    { kind: 'weekly', days: ['Moonday'] },
    { kind: 'weekly' },
    { kind: 'everyNDays', n: 0 },
    { kind: 'everyNDays', n: 1.5 },
    { kind: 'everyNDays', n: 2, startDate: '2026-02-30' },
    { kind: 'everyNDays', n: 2, startWeekday: 'Nope' },
    { kind: 'monthly', dayOfMonth: 32 },
    { kind: 'monthly', dayOfMonth: 0 },
    [],
  ])('refuses %j', (bad) => {
    expect(() => parseCadence(bad)).toThrow(ValidationError);
  });
});

describe('range days', () => {
  it('defaults to the max and clamps into 1..max', () => {
    expect(clampRangeDays(undefined, 42)).toBe(42);
    expect(clampRangeDays(10, 42)).toBe(10);
    expect(clampRangeDays(9999, 42)).toBe(42);
    // Deliberate: 0 is a number below the range, so it clamps up to 1. It does
    // not mean "use the default"; only a missing value does.
    expect(clampRangeDays(0, 42)).toBe(1);
    expect(clampRangeDays(-5, 42)).toBe(1);
    expect(clampRangeDays(3.9, 42)).toBe(3);
  });
  it('refuses a non-number', () => expect(() => clampRangeDays('lots', 42)).toThrow(ValidationError));
});

describe('bucket kinds', () => {
  it('pins the fixed ids to their kinds whatever the row says', () => {
    expect(resolveBucketKind('work', 'weighted')).toBe('work');
    expect(resolveBucketKind('events', 'weighted')).toBe('event');
    expect(resolveBucketKind('appointments', undefined)).toBe('appointment');
    expect(resolveBucketKind('personal', 'work')).toBe('personal');
  });

  it('defaults a custom bucket to weighted', () => expect(resolveBucketKind('id_x', undefined)).toBe('weighted'));

  it('refuses an empty-string kind rather than defaulting it', () => {
    // Deliberate: only a missing kind defaults to weighted. The client always sends one.
    expect(() => resolveBucketKind('id_x', '')).toThrow(ValidationError);
  });

  it('refuses a kind outside the list', () => {
    expect(() => resolveBucketKind('id_x', 'admin')).toThrow(ValidationError);
  });

  it('refuses a second work, event, appointment or personal bucket', () => {
    for (const kind of ['work', 'event', 'appointment', 'personal']) {
      expect(() => resolveBucketKind('id_x', kind)).toThrow(/already exists/);
    }
  });
});

describe('bucket days', () => {
  it('refuses an empty list for every bucket except Events', () => {
    expect(() => parseBucketDays([], 'weighted', 'Study')).toThrow(/pick at least one day/);
    expect(() => parseBucketDays(undefined, 'work', 'Work')).toThrow(ValidationError);
    expect(parseBucketDays([], 'event', 'Events')).toEqual([]);
  });
  it('keeps valid days and refuses others', () => {
    expect(parseBucketDays(['Tue', 'Mon'], 'weighted', 'Study')).toEqual(['Mon', 'Tue']);
    expect(() => parseBucketDays(['Mon', 3], 'weighted', 'Study')).toThrow(ValidationError);
  });
});
