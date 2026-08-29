import { describe, expect, it } from 'vitest';

import { daySections, packDay, sectionMinutes } from '../domain/packDay';
import { eatFromSections, isEventDay, nextSlot, sectionCapacity } from '../domain/sections';
import { nextAssignedDate, skipPushDate } from '../domain/skip';
import { EVENTS_ID } from '../domain/types';
import { bucket, item, settings, workBucket } from './fixtures';

const monday = '2026-08-31';

function base() {
  return {
    date: monday,
    settings: settings(),
    buckets: [workBucket()],
    items: [] as ReturnType<typeof item>[],
    appointments: [],
  };
}

describe('daySections', () => {
  it('splits the day into three equal thirds with remainder on evening', () => {
    const even = daySections(settings({ dayMinutes: 14 * 60, dayStartMinutes: 7 * 60 }));
    expect(even.morning).toEqual({ start: 7 * 60, end: 7 * 60 + 280 });
    expect(even.midday).toEqual({ start: 7 * 60 + 280, end: 7 * 60 + 560 });
    expect(even.evening).toEqual({ start: 7 * 60 + 560, end: 7 * 60 + 14 * 60 });
    const rem = daySections(settings({ dayMinutes: 10 * 60 + 10, dayStartMinutes: 0 }));
    expect(rem.morning.end - rem.morning.start).toBe(203);
    expect(rem.midday.end - rem.midday.start).toBe(203);
    expect(rem.evening.end - rem.evening.start).toBe(204);
  });
});

describe('sectionMinutes', () => {
  it('reports each third as hours and leftover minutes', () => {
    expect(sectionMinutes(settings({ dayMinutes: 14 * 60 }))).toEqual({
      morning: 280,
      midday: 280,
      evening: 280,
    });
  });
});

describe('packDay', () => {
  it('places Work in its assigned slot, not always midday', () => {
    const result = packDay({
      ...base(),
      buckets: [workBucket({ slot: 'morning', weeklyMinutes: 60, hoursMinutes: 60, days: ['Mon'] })],
      items: [item({ id: 'standup', bucketId: 'work', title: 'Standup', weight: 1, durationMinutes: 10 })],
    });
    expect(result.blocks.find((b) => b.itemId === 'standup')?.slot).toBe('morning');
  });

  it('fills a bucket only up to its daily max', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 30, days: ['Mon'], slot: 'morning' });
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [
        item({ id: 'a', bucketId: 'house', title: 'A', weight: 1, durationMinutes: 20 }),
        item({ id: 'b', bucketId: 'house', title: 'B', weight: 2, durationMinutes: 20 }),
      ],
    });
    expect(result.blocks.some((b) => b.itemId === 'a')).toBe(true);
    expect(result.dropped.some((d) => d.itemId === 'b')).toBe(true);
  });

  it('never drops a 0-duration item', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 0, days: ['Mon'], slot: 'morning' });
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [item({ id: 'note', bucketId: 'house', title: 'Remember', weight: 1, durationMinutes: 0 })],
    });
    expect(result.blocks.some((b) => b.itemId === 'note')).toBe(true);
    expect(result.dropped.some((d) => d.itemId === 'note')).toBe(false);
  });

  it('keeps morning items out of midday when the morning section is full', () => {
    const chores = bucket({
      id: 'chores',
      name: 'Chores',
      weight: 4,
      weeklyMinutes: 6 * 60,
      days: ['Mon'],
      slot: 'morning',
    });
    const fitness = bucket({
      id: 'fitness',
      name: 'Fitness',
      weight: 2,
      weeklyMinutes: 90,
      days: ['Mon'],
      slot: 'midday',
    });
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), chores, fitness],
      items: [
        item({ id: 'm1', bucketId: 'chores', title: 'A', weight: 1, durationMinutes: 3 * 60 }),
        item({ id: 'm2', bucketId: 'chores', title: 'B', weight: 2, durationMinutes: 3 * 60 }),
        item({ id: 'lift', bucketId: 'fitness', title: 'Lift', weight: 1, durationMinutes: 90 }),
      ],
    });
    expect(result.dropped.some((d) => d.itemId === 'm2')).toBe(true);
    expect(result.blocks.find((b) => b.itemId === 'lift')?.slot).toBe('midday');
  });

  it('uses Start Next leftover to place more items in the next section', () => {
    const fitness = bucket({
      id: 'fitness',
      name: 'Fitness',
      weight: 2,
      weeklyMinutes: 6 * 60,
      days: ['Mon'],
      slot: 'midday',
    });
    const tight = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 8 * 60, hoursMinutes: 8 * 60, days: ['Mon'] }), fitness],
      items: [
        item({ id: 'deep', bucketId: 'work', title: 'Deep', weight: 1, durationMinutes: 4 * 60 }),
        item({ id: 'lift', bucketId: 'fitness', title: 'Lift', weight: 1, durationMinutes: 90 }),
      ],
    });
    expect(tight.dropped.some((d) => d.itemId === 'lift')).toBe(true);
    const roomy = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 8 * 60, hoursMinutes: 8 * 60, days: ['Mon'] }), fitness],
      items: [
        item({ id: 'deep', bucketId: 'work', title: 'Deep', weight: 1, durationMinutes: 4 * 60 }),
        item({ id: 'lift', bucketId: 'fitness', title: 'Lift', weight: 1, durationMinutes: 90 }),
      ],
      sectionExtra: { midday: 2 * 60 },
    });
    expect(roomy.blocks.some((b) => b.itemId === 'lift')).toBe(true);
  });

  it('splits a long Work item around Break at 2 hours', () => {
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 10 * 60, hoursMinutes: 10 * 60, days: ['Mon'] })],
      items: [item({ id: 'deep', bucketId: 'work', title: 'Deep work', weight: 1, durationMinutes: 4 * 60 })],
    });
    const workBlocks = result.blocks.filter((b) => b.itemId === 'deep');
    const brk = result.blocks.find((b) => b.title === 'Break');
    expect(workBlocks.length).toBe(2);
    expect(brk).toBeDefined();
    expect(brk?.slot).toBe('midday');
  });

  it('places Break in Work’s slot when Work has no items', () => {
    const result = packDay({
      ...base(),
      buckets: [workBucket({ slot: 'evening', weeklyMinutes: 0, days: ['Tue'] })],
    });
    expect(result.blocks.find((b) => b.title === 'Break')?.slot).toBe('evening');
  });

  it('keeps appointments as duration-only blocks', () => {
    const result = packDay({
      ...base(),
      appointments: [{ id: 'dentist', title: 'Dentist', date: monday, durationMinutes: 60 }],
    });
    const appt = result.blocks.find((b) => b.appointmentId === 'dentist');
    expect(appt?.durationMinutes).toBe(60);
    expect(appt?.kind).toBe('appointment');
  });

  it('reorders pending items by weight only', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 60, days: ['Mon'] });
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [
        item({ id: 'a', bucketId: 'house', title: 'A', weight: 2, durationMinutes: 20 }),
        item({ id: 'b', bucketId: 'house', title: 'B', weight: 1, durationMinutes: 20 }),
      ],
    });
    const a = result.blocks.find((b) => b.itemId === 'a');
    const b = result.blocks.find((b) => b.itemId === 'b');
    expect((b?.startMinutes ?? 0) < (a?.startMinutes ?? 0)).toBe(true);
  });

  it('preserves complete status on rebuild', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 60, days: ['Mon'] });
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [item({ id: 'dishes', bucketId: 'house', title: 'Dishes', durationMinutes: 20 })],
      previous: [{ itemId: 'dishes', status: 'complete' }],
    });
    expect(result.blocks.find((b) => b.itemId === 'dishes')?.status).toBe('complete');
  });

  it('packs only event items on an event day', () => {
    const events = bucket({
      id: EVENTS_ID,
      name: 'Events',
      weight: 0,
      weeklyMinutes: 0,
      hoursMinutes: 0,
    });
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 60, days: ['Mon'] });
    const result = packDay({
      ...base(),
      buckets: [
        workBucket({ weeklyMinutes: 0, days: ['Tue'] }),
        { ...events, kind: 'event', startDate: monday, endDate: '2026-09-02' },
        house,
      ],
      items: [
        item({ id: 'trip', bucketId: EVENTS_ID, title: 'Travel day', weight: 1, durationMinutes: 0 }),
        item({ id: 'dishes', bucketId: 'house', title: 'Dishes', weight: 1, durationMinutes: 20 }),
      ],
    });
    expect(result.blocks.some((b) => b.itemId === 'trip')).toBe(true);
    expect(result.blocks.some((b) => b.itemId === 'dishes')).toBe(false);
  });

  it('places more in the next section only when leftover extra is passed in', () => {
    const house = bucket({
      id: 'house',
      name: 'House',
      weight: 4,
      weeklyMinutes: 100,
      hoursMinutes: 100,
      days: ['Mon'],
      slot: 'midday',
    });
    const items = [
      item({ id: 'a', bucketId: 'house', title: 'A', weight: 1, durationMinutes: 60 }),
      item({ id: 'b', bucketId: 'house', title: 'B', weight: 2, durationMinutes: 40 }),
    ];
    const tight = packDay({
      ...base(),
      settings: settings({ dayMinutes: 180 }),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items,
    });
    expect(tight.dropped.some((d) => d.itemId === 'b')).toBe(true);
    const carried = packDay({
      ...base(),
      settings: settings({ dayMinutes: 180 }),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items,
      sectionExtra: { midday: 40 },
    });
    expect(carried.blocks.some((b) => b.itemId === 'b')).toBe(true);
  });
});

describe('section carry', () => {
  it('eats appointment time from the current section then the next', () => {
    const caps = sectionCapacity(settings(), {}, {});
    const after = eatFromSections(caps, 'morning', 300);
    expect(after.morning).toBe(0);
    expect(after.midday).toBe(caps.midday - 20);
    expect(nextSlot('evening')).toBeNull();
  });

  it('detects an event day from the date range', () => {
    expect(
      isEventDay({ ...bucket({ id: EVENTS_ID, name: 'Events', weight: 0 }), kind: 'event', startDate: monday, endDate: '2026-09-02' }, monday)
    ).toBe(true);
    expect(
      isEventDay({ ...bucket({ id: EVENTS_ID, name: 'Events', weight: 0 }), kind: 'event', startDate: monday, endDate: '2026-09-02' }, '2026-08-30')
    ).toBe(false);
  });
});

describe('skip push', () => {
  it('pushes a skipped scheduled item to the next assigned bucket day', () => {
    const work = workBucket({ days: ['Mon', 'Wed', 'Fri'] });
    const scheduled = item({
      id: 'ship',
      bucketId: 'work',
      title: 'Ship',
      type: 'scheduled',
      cadence: { kind: 'weekdays' },
    });
    expect(skipPushDate(scheduled, work, '2026-08-31')).toBe('2026-09-02');
  });

  it('does not push a skipped recurring item', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4 });
    const dishes = item({ id: 'dishes', bucketId: 'house', title: 'Dishes', type: 'recurring' });
    expect(skipPushDate(dishes, house, monday)).toBeNull();
  });

  it('finds the next assigned date after Tuesday for a Mon/Wed/Fri bucket', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, days: ['Mon', 'Wed', 'Fri'] });
    expect(nextAssignedDate(house, '2026-09-01')).toBe('2026-09-02');
  });
});
