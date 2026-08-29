import { describe, expect, it } from 'vitest';

import { elapsedSince, sectionRemainingNow } from '../domain/timer';

describe('sectionRemainingNow', () => {
  it('holds the remaining minutes while paused', () => {
    expect(sectionRemainingNow(12, '2026-08-29T12:00:00.000Z', '2026-08-29T12:05:00.000Z', Date.parse('2026-08-29T12:20:00.000Z'))).toBe(12);
  });

  it('counts down from the last resume', () => {
    const started = Date.parse('2026-08-29T12:00:00.000Z');
    expect(sectionRemainingNow(10, '2026-08-29T12:00:00.000Z', null, started + 3 * 60000)).toBe(7);
  });
});

describe('elapsedSince', () => {
  it('counts minutes from a start timestamp', () => {
    expect(elapsedSince('2026-08-29T12:00:00.000Z', Date.parse('2026-08-29T12:08:00.000Z'))).toBe(8);
  });
});
