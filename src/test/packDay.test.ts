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

  it('places work items first and generic Work last', () => {
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 35 * 60, hoursMinutes: 35 * 60, days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] })],
      items: [
        item({ id: 'standup', bucketId: 'work', title: 'Standup', weight: 1, durationMinutes: 10 }),
        item({ id: 'deep', bucketId: 'work', title: 'Deep work', weight: 2, durationMinutes: 4 * 60 }),
      ],
    });
    const workBlocks = result.blocks.filter((b) => b.kind === 'work');
    const standup = workBlocks.find((b) => b.itemId === 'standup');
    const deep = workBlocks.filter((b) => b.itemId === 'deep');
    const generic = workBlocks.filter((b) => !b.itemId);
    const genericMinutes = generic.reduce((s, b) => s + b.durationMinutes, 0);
    const lastItemEnd = Math.max(standup?.endMinutes ?? 0, ...deep.map((b) => b.endMinutes));
    expect(standup).toBeDefined();
    expect(deep.reduce((s, b) => s + b.durationMinutes, 0)).toBe(4 * 60);
    expect(result.dropped.some((d) => d.itemId === 'deep')).toBe(false);
    expect(genericMinutes).toBe(2 * 60 + 50);
    expect(generic.every((b) => b.startMinutes >= lastItemEnd)).toBe(true);
  });

  it('puts Break after a work item of 3h or less instead of splitting it', () => {
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 3 * 60, hoursMinutes: 3 * 60, days: ['Mon'] })],
      items: [item({ id: 'review', bucketId: 'work', title: 'Review', weight: 1, durationMinutes: 2 * 60 })],
    });
    const review = result.blocks.filter((b) => b.itemId === 'review');
    const brk = result.blocks.find((b) => b.title === 'Break');
    expect(review).toHaveLength(1);
    expect(review[0].durationMinutes).toBe(2 * 60);
    expect(brk?.startMinutes).toBe(review[0].endMinutes);
  });

  it('generic Work blocks omit itemId so Firestore can write them', () => {
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 7 * 60, days: ['Mon'] })],
    });
    const generic = result.blocks.filter((b) => b.kind === 'work' && !b.itemId);
    expect(generic.length).toBeGreaterThan(0);
    for (const block of generic) {
      expect(block).not.toHaveProperty('itemId');
    }
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

  it('places items around appointments', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 120, days: ['Mon'], slot: 'midday' });
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [
        item({ id: 'a', bucketId: 'house', title: 'Before', weight: 1, durationMinutes: 30 }),
        item({ id: 'b', bucketId: 'house', title: 'After', weight: 2, durationMinutes: 30 }),
      ],
      appointments: [{ id: 'meeting', title: 'Meeting', date: monday, startMinutes: 12 * 60, durationMinutes: 60 }],
    });
    const meeting = result.blocks.find((b) => b.appointmentId === 'meeting');
    const itemBlocks = result.blocks.filter((b) => b.bucketId === 'house');
    expect(meeting).toBeDefined();
    expect(itemBlocks.length).toBe(2);
    for (const block of itemBlocks) {
      const overlaps = block.startMinutes < meeting!.endMinutes && block.endMinutes > meeting!.startMinutes;
      expect(overlaps).toBe(false);
    }
  });

  it('uses the saved appointment color', () => {
    const result = packDay({
      ...base(),
      appointments: [{ id: 'meeting', title: 'Meeting', date: monday, startMinutes: 12 * 60, durationMinutes: 60, color: '22c55e' }],
    });
    expect(result.blocks.find((b) => b.appointmentId === 'meeting')?.color).toBe('22c55e');
  });

  it('reorders pending items when weights change even if previous times exist', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 60, days: ['Mon'] });
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [
        item({ id: 'a', bucketId: 'house', title: 'A', weight: 2, durationMinutes: 20 }),
        item({ id: 'b', bucketId: 'house', title: 'B', weight: 1, durationMinutes: 20 }),
      ],
      previous: [
        { itemId: 'a', status: 'pending', startMinutes: 8 * 60, endMinutes: 8 * 60 + 20 },
        { itemId: 'b', status: 'pending', startMinutes: 8 * 60 + 30, endMinutes: 8 * 60 + 50 },
      ],
    });
    const a = result.blocks.find((b) => b.itemId === 'a');
    const b = result.blocks.find((b) => b.itemId === 'b');
    expect(b?.startMinutes).toBeLessThan(a?.startMinutes ?? Infinity);
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
