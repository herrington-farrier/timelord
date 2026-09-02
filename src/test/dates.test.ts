import { describe, expect, it } from 'vitest';

import { formatClock, formatDayLabel } from '../shared/dates';

describe('formatDayLabel', () => {
  it('reads a date key as a short weekday and date', () => {
    expect(formatDayLabel('2026-09-01')).toBe('Tue Sep 1');
    expect(formatDayLabel('2026-12-25')).toBe('Fri Dec 25');
  });

  it('does not shift the day across a timezone', () => {
    expect(formatDayLabel('2026-01-01')).toBe('Thu Jan 1');
  });

  it('returns the key back when it is not a date', () => {
    expect(formatDayLabel('')).toBe('');
    expect(formatDayLabel('nope')).toBe('nope');
  });
});

describe('formatClock', () => {
  it('reads an ISO instant in the app timezone', () => {
    expect(formatClock('2026-08-29T12:00:00.000Z')).toBe('7:00 AM');
    expect(formatClock('2026-01-15T00:30:00.000Z')).toBe('6:30 PM');
  });

  it('falls back to the raw value when it cannot parse', () => {
    expect(formatClock('not a time')).toBe('not a time');
  });
});
