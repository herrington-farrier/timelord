import { describe, expect, it } from 'vitest';

import { packDay } from '../domain/packDay';
import { nextAssignedDate, skipPushDate } from '../domain/skip';
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

describe('packDay', () => {
  it('keeps Morning Routine at day start', () => {
    const result = packDay(base());
    const morning = result.blocks.find((b) => b.title === 'Morning Routine');
    expect(morning?.startMinutes).toBe(7 * 60);
  });

  it('splits Work around Break', () => {
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 10 * 60, days: ['Mon'] })],
    });
    const workBlocks = result.blocks.filter((b) => b.kind === 'work' && !b.itemId);
    const brk = result.blocks.find((b) => b.title === 'Break');
    expect(workBlocks.length).toBe(2);
    expect(workBlocks[0].endMinutes).toBe(brk?.startMinutes);
    expect(workBlocks[1].startMinutes).toBe(brk?.endMinutes);
  });

  it('places Break even when Work has no hours that day', () => {
    const result = packDay({
      ...base(),
      date: '2026-08-30',
      buckets: [workBucket({ days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] })],
    });
    expect(result.blocks.some((b) => b.title === 'Break')).toBe(true);
    expect(result.blocks.filter((b) => b.kind === 'work' && !b.itemId)).toHaveLength(0);
  });

  it('packs higher-weight items first and rescues dropped with extra time', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 30, days: ['Mon'] });
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [
        item({ id: 'a', bucketId: 'house', title: 'A', weight: 1, durationMinutes: 20 }),
        item({ id: 'b', bucketId: 'house', title: 'B', weight: 2, durationMinutes: 20 }),
      ],
    });
    expect(result.blocks.some((b) => b.itemId === 'a')).toBe(true);
    expect(result.blocks.some((b) => b.itemId === 'b')).toBe(true);
  });

  it('drops a lower-priority bucket as a unit when it does not fit', () => {
    const house = bucket({
      id: 'house',
      name: 'House',
      weight: 4,
      weeklyMinutes: 4 * 60,
      days: ['Mon'],
      slot: 'morning',
    });
    const garden = bucket({
      id: 'garden',
      name: 'Garden',
      weight: 5,
      weeklyMinutes: 4 * 60,
      days: ['Mon'],
      slot: 'morning',
    });
    const result = packDay({
      ...base(),
      settings: settings({ morningMinutes: 60, breakMinutes: 30, eveningMinutes: 120, dayMinutes: 8 * 60 }),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house, garden],
      items: [
        item({ id: 'h1', bucketId: 'house', title: 'Floors', weight: 1, durationMinutes: 180 }),
        item({ id: 'g1', bucketId: 'garden', title: 'Weeding', weight: 1, durationMinutes: 180 }),
      ],
    });
    expect(result.droppedBuckets.some((d) => d.bucketId === 'garden')).toBe(true);
    expect(result.dropped.some((d) => d.itemId === 'g1')).toBe(true);
  });

  it('does not insert a transition between two House items', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 120, days: ['Mon'] });
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [
        item({ id: 'a', bucketId: 'house', title: 'Dishes', weight: 1, durationMinutes: 20 }),
        item({ id: 'b', bucketId: 'house', title: 'Counters', weight: 2, durationMinutes: 15 }),
      ],
    });
    const houseBlocks = result.blocks.filter((b) => b.bucketId === 'house');
    const between = result.blocks.filter(
      (b) => b.kind === 'transition' && b.startMinutes >= houseBlocks[0].endMinutes && b.endMinutes <= houseBlocks[1].startMinutes
    );
    expect(between).toHaveLength(0);
  });

  it('keeps an appointment at 10:00 for 1h', () => {
    const result = packDay({
      ...base(),
      appointments: [{ id: 'dentist', title: 'Dentist', date: monday, startMinutes: 10 * 60, durationMinutes: 60 }],
    });
    const appt = result.blocks.find((b) => b.appointmentId === 'dentist');
    expect(appt?.startMinutes).toBe(10 * 60);
    expect(appt?.endMinutes).toBe(11 * 60);
  });

  it('preserves complete status on rebuild for the same item', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 60, days: ['Mon'] });
    const dishes = item({ id: 'dishes', bucketId: 'house', title: 'Dishes', durationMinutes: 20 });
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [dishes],
      previous: [{ itemId: 'dishes', status: 'complete' }],
    });
    expect(result.blocks.find((b) => b.itemId === 'dishes')?.status).toBe('complete');
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
