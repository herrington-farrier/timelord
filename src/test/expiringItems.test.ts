import { describe, expect, it } from 'vitest';

import { isFinalOccurrence, itemExpired } from '../domain/cadence';
import {
  evenSectionSplit,
  rescaleSectionSplit,
  sectionMinutes,
  sectionSplitFits,
  stepSectionSplit,
} from '../domain/sections';
import { packDay } from '../domain/packDay';
import { DEFAULT_SETTINGS } from '../domain/types';
import { bucket, item, workBucket } from './fixtures';

describe('an expiry date', () => {
  it('includes the day it names', () => {
    expect(itemExpired('2026-09-14', '2026-09-14')).toBe(false);
    expect(itemExpired('2026-09-14', '2026-09-15')).toBe(true);
  });

  it('does not bound an item that has none', () => {
    expect(itemExpired(undefined, '2026-09-15')).toBe(false);
  });
});

describe('the last time round', () => {
  const daily = { kind: 'daily' } as const;

  it('marks the expiry day itself', () => {
    expect(isFinalOccurrence(daily, '2026-09-14', '2026-09-14')).toBe(true);
  });

  it('does not mark the days before it', () => {
    expect(isFinalOccurrence(daily, '2026-09-13', '2026-09-14')).toBe(false);
  });

  it('marks the last hit even when the expiry falls between occurrences', () => {
    const weekly = { kind: 'weekly', days: ['Mon'] } as const;
    // Mon 14th runs; the next Monday is the 21st, past a Thursday expiry.
    expect(isFinalOccurrence(weekly, '2026-09-14', '2026-09-17')).toBe(true);
    expect(isFinalOccurrence(weekly, '2026-09-07', '2026-09-17')).toBe(false);
  });

  it('marks nothing when the item never expires', () => {
    expect(isFinalOccurrence(daily, '2026-09-14', undefined)).toBe(false);
  });

  it('respects the bucket days, so a closed last day is not the last', () => {
    // Daily cadence, bucket open only on Monday: the Monday is the final hit,
    // not the Friday the expiry happens to name.
    expect(isFinalOccurrence(daily, '2026-09-14', '2026-09-18', ['Mon'])).toBe(true);
    expect(isFinalOccurrence(daily, '2026-09-18', '2026-09-18', ['Mon'])).toBe(false);
  });
});

describe('the packer and an expiring item', () => {
  const home = bucket({ id: 'home', name: 'Home', weight: 2 });
  const rows = [item({ id: 'physio', bucketId: 'home', title: 'Physio', durationMinutes: 30, expiresAt: '2026-09-14' })];

  function pack(date: string) {
    return packDay({
      date,
      settings: DEFAULT_SETTINGS,
      buckets: [workBucket({}), home],
      items: rows,
      skipPushes: [],
    });
  }

  it('places it up to and including the expiry', () => {
    expect(pack('2026-09-14').blocks.some((b) => b.itemId === 'physio')).toBe(true);
  });

  it('stops placing it the day after', () => {
    expect(pack('2026-09-15').blocks.some((b) => b.itemId === 'physio')).toBe(false);
  });

  it('marks the last one so a screen can say so', () => {
    const last = pack('2026-09-14').blocks.find((b) => b.itemId === 'physio');
    expect(last?.finalOccurrence).toBe(true);
  });

  it('leaves the earlier ones unmarked', () => {
    const earlier = pack('2026-09-13').blocks.find((b) => b.itemId === 'physio');
    expect(earlier?.finalOccurrence).toBeUndefined();
  });
});

describe('the day split', () => {
  it('divides evenly by default, remainder on evening', () => {
    expect(evenSectionSplit(14 * 60)).toMatchObject({ morning: 280, midday: 280, evening: 280 });
    expect(evenSectionSplit(100)).toMatchObject({ morning: 33, midday: 33, evening: 34 });
  });

  it('uses a stored split that adds back to the day', () => {
    const split = { morning: 240, midday: 300, evening: 300 };
    expect(sectionMinutes({ dayMinutes: 840, sectionSplit: split })).toMatchObject(split);
  });

  it('ignores a split left over from a different day length', () => {
    // Day Length is the truth: a stale split must not contradict it.
    const stale = { morning: 240, midday: 300, evening: 300 };
    expect(sectionMinutes({ dayMinutes: 600, sectionSplit: stale })).toMatchObject({
      morning: 200,
      midday: 200,
      evening: 200,
    });
  });

  it('refuses a negative stretch', () => {
    expect(sectionSplitFits({ morning: -60, midday: 450, evening: 450 }, 840)).toBe(false);
  });

  it('allows a stretch of nothing at all', () => {
    expect(sectionSplitFits({ morning: 0, midday: 420, evening: 420 }, 840)).toBe(true);
  });
});

describe('stepping a stretch', () => {
  const even = { morning: 280, midday: 280, evening: 280 };

  it('takes the hour it gives out of the next stretch', () => {
    expect(stepSectionSplit(even, 'morning', 60)).toMatchObject({
      morning: 340,
      midday: 220,
      evening: 280,
    });
  });

  it('gives the hour it drops back to the next stretch', () => {
    expect(stepSectionSplit(even, 'morning', -60)).toMatchObject({
      morning: 220,
      midday: 340,
      evening: 280,
    });
  });

  it('wraps, so evening borrows from morning', () => {
    expect(stepSectionSplit(even, 'evening', 60)).toMatchObject({
      morning: 220,
      midday: 280,
      evening: 340,
    });
  });

  it('keeps the day the same length however it is stepped', () => {
    let split = even;
    for (const slot of ['morning', 'midday', 'evening', 'morning'] as const) {
      split = stepSectionSplit(split, slot, 60);
    }
    expect(split.morning + split.midday + split.evening).toBe(840);
  });

  it('refuses a step the next stretch cannot pay for', () => {
    const tight = { morning: 800, midday: 40, evening: 0 };
    expect(stepSectionSplit(tight, 'morning', 60)).toBe(tight);
  });

  it('refuses to take a stretch below nothing', () => {
    const tight = { morning: 0, midday: 420, evening: 420 };
    expect(stepSectionSplit(tight, 'morning', -60)).toBe(tight);
  });
});

describe('changing the day length', () => {
  it('keeps the proportions that were set', () => {
    // A quarter, a quarter, a half — on a day twice as long.
    const scaled = rescaleSectionSplit({ morning: 210, midday: 210, evening: 420 }, 840, 1680);
    expect(scaled).toMatchObject({ morning: 420, midday: 420, evening: 840 });
  });

  it('still adds back to the new day exactly', () => {
    const scaled = rescaleSectionSplit({ morning: 250, midday: 300, evening: 290 }, 840, 500);
    expect(scaled.morning + scaled.midday + scaled.evening).toBe(500);
  });

  it('falls back to an even split when there was no day to scale from', () => {
    expect(rescaleSectionSplit({ morning: 0, midday: 0, evening: 0 }, 0, 300)).toMatchObject({
      morning: 100,
      midday: 100,
      evening: 100,
    });
  });
});
