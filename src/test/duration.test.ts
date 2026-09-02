import { describe, expect, it } from 'vitest';

import { durationInputs, formatApptTime, formatDuration, formatTimeInput, hoursToMinutes, parseTimeInput } from '../domain/duration';

describe('formatDuration', () => {
  it('formats 20 minutes as 20m', () => {
    expect(formatDuration(20)).toBe('20m');
  });

  it('formats 90 minutes as 1h 30m', () => {
    expect(formatDuration(90)).toBe('1h 30m');
  });

  it('formats 60 minutes as 1h', () => {
    expect(formatDuration(60)).toBe('1h');
  });

  it('does not emit decimal hour labels', () => {
    expect(formatDuration(18)).not.toMatch(/hrs|0\./);
  });

  it('converts 0 hours and 20 minutes to 20', () => {
    expect(hoursToMinutes(0, 20)).toBe(20);
  });

  it('keeps a 30m appointment as 0 hours', () => {
    expect(durationInputs(30)).toEqual({ hours: 0, minutes: 30 });
    expect(durationInputs(undefined)).toEqual({ hours: 1, minutes: 0 });
  });

  it('round-trips a clock time', () => {
    expect(formatTimeInput(10 * 60 + 30)).toBe('10:30');
    expect(parseTimeInput('10:30')).toBe(10 * 60 + 30);
  });
});

describe('formatApptTime', () => {
  it('reads a stored 24h value as a clock label', () => {
    expect(formatApptTime('14:30')).toBe('2:30 PM');
    expect(formatApptTime('09:05')).toBe('9:05 AM');
    expect(formatApptTime('00:00')).toBe('12:00 AM');
    expect(formatApptTime('12:00')).toBe('12:00 PM');
  });

  it('passes through anything that is not HH:MM, so older free text still shows', () => {
    expect(formatApptTime('2:30pm')).toBe('2:30pm');
    expect(formatApptTime('after lunch')).toBe('after lunch');
    expect(formatApptTime('')).toBe('');
    expect(formatApptTime(undefined)).toBe('');
  });
});
