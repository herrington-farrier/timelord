import { describe, expect, it } from 'vitest';

import { daySections, packDay, sectionMinutes } from '../domain/packDay';
import { PACK_RANGE_DAYS, packRange } from '../domain/packWeek';
import { appointmentLoad, capsAfterLoad, eatFromSections, isEventDay, liveSectionState, nextSlot, sectionCapacity } from '../domain/sections';
import { nextAssignedDate, skipPushDate } from '../domain/skip';
import { APPOINTMENTS_BUCKET } from '../domain/seed';
import { APPOINTMENTS_ID, EVENTS_ID } from '../domain/types';
import { weekStart } from '../shared/dates';
import { bucket, item, settings, workBucket } from './fixtures';

const monday = '2026-08-31';

function base() {
  return {
    date: monday,
    settings: settings(),
    buckets: [workBucket()],
    items: [] as ReturnType<typeof item>[],
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

  it('puts leftover minutes on evening, not on morning or midday', () => {
    expect(sectionMinutes(settings({ dayMinutes: 10 * 60 + 10 }))).toEqual({
      morning: 203,
      midday: 203,
      evening: 204,
    });
  });

  it('splits a 15h day into three 5h sections', () => {
    expect(sectionMinutes(settings({ dayMinutes: 15 * 60 }))).toEqual({
      morning: 5 * 60,
      midday: 5 * 60,
      evening: 5 * 60,
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

  it('packs a full evening third on a 15h day when midday has no buckets', () => {
    const food = bucket({
      id: 'food',
      name: 'Food',
      weight: 3,
      hoursMode: 'day',
      hoursMinutes: 5 * 60,
      weeklyMinutes: 5 * 60,
      days: ['Mon'],
      slot: 'evening',
    });
    const result = packDay({
      ...base(),
      settings: settings({ dayMinutes: 15 * 60 }),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), food],
      items: [item({ id: 'cook', bucketId: 'food', title: 'Cook', weight: 1, durationMinutes: 5 * 60 })],
    });
    expect(result.blocks.find((b) => b.itemId === 'cook')?.durationMinutes).toBe(5 * 60);
    expect(result.blocks.find((b) => b.itemId === 'cook')?.slot).toBe('evening');
  });

  it('does not let leftover eat shrink evening on an unstarted day', () => {
    const food = bucket({
      id: 'food',
      name: 'Food',
      weight: 3,
      hoursMode: 'day',
      hoursMinutes: 5 * 60,
      weeklyMinutes: 5 * 60,
      days: ['Mon'],
      slot: 'evening',
    });
    const stale = { extra: {}, used: { evening: 225 } };
    const live = liveSectionState({ sectionUsed: stale.used });
    const result = packDay({
      ...base(),
      settings: settings({ dayMinutes: 15 * 60 }),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), food],
      items: [item({ id: 'cook', bucketId: 'food', title: 'Cook', weight: 1, durationMinutes: 5 * 60 })],
      sectionExtra: live.extra,
      sectionUsed: live.used,
    });
    expect(live.used).toEqual({});
    expect(result.blocks.find((b) => b.itemId === 'cook')?.durationMinutes).toBe(5 * 60);
  });

  it('stamps evening on evening-bucket items', () => {
    const food = bucket({
      id: 'food',
      name: 'Food',
      weight: 3,
      weeklyMinutes: 60,
      days: ['Mon'],
      slot: 'evening',
    });
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), food],
      items: [item({ id: 'cook', bucketId: 'food', title: 'Cooking', weight: 1, durationMinutes: 30 })],
    });
    expect(result.blocks.find((b) => b.itemId === 'cook')?.slot).toBe('evening');
    expect(sectionCapacity(settings(), {}, {}).evening).toBe(sectionMinutes(settings()).evening);
  });

  it('uses section extra to place more items in the next section', () => {
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
    expect(workBlocks).toHaveLength(2);
    expect(brk?.slot).toBe('midday');
    expect(workBlocks[0].startMinutes).toBeLessThan(brk?.startMinutes ?? 0);
    expect(brk?.startMinutes ?? 0).toBeLessThan(workBlocks[1].startMinutes);
    expect(workBlocks[0].durationMinutes).toBe(2 * 60);
  });

  it('places Break even when Personal break hours are 0', () => {
    const result = packDay({
      ...base(),
      settings: settings({ breakMinutes: 0 }),
      buckets: [workBucket({ weeklyMinutes: 10 * 60, hoursMinutes: 10 * 60, days: ['Mon'] })],
      items: [item({ id: 'deep', bucketId: 'work', title: 'Deep work', weight: 1, durationMinutes: 4 * 60 })],
    });
    expect(result.blocks.some((b) => b.title === 'Break')).toBe(true);
  });

  it('places Break in midday even when Work is in another section', () => {
    const result = packDay({
      ...base(),
      buckets: [workBucket({ slot: 'evening', weeklyMinutes: 0, days: ['Tue'] })],
    });
    expect(result.blocks.find((b) => b.title === 'Break')?.slot).toBe('midday');
  });

  it('does not split morning Work; Break and the 2-hour split stay in midday', () => {
    const result = packDay({
      ...base(),
      buckets: [
        workBucket({
          slot: 'morning',
          slots: ['morning'],
          weeklyMinutes: 10 * 60,
          hoursMinutes: 10 * 60,
          days: ['Mon'],
        }),
      ],
      items: [item({ id: 'deep', bucketId: 'work', title: 'Deep work', weight: 1, durationMinutes: 4 * 60 })],
    });
    expect(result.blocks.filter((b) => b.itemId === 'deep')).toHaveLength(1);
    expect(result.blocks.find((b) => b.itemId === 'deep')?.slot).toBe('morning');
    expect(result.blocks.find((b) => b.title === 'Break')?.slot).toBe('midday');
  });

  it('spreads Work across selected sections and keeps Break in midday', () => {
    const result = packDay({
      ...base(),
      buckets: [
        workBucket({
          slot: 'morning',
          slots: ['morning', 'midday'],
          weeklyMinutes: 6 * 60,
          hoursMinutes: 6 * 60,
          days: ['Mon'],
        }),
      ],
      items: [
        item({ id: 'a', bucketId: 'work', title: 'A', weight: 1, durationMinutes: 4 * 60, slot: 'morning' }),
        item({ id: 'b', bucketId: 'work', title: 'B', weight: 2, durationMinutes: 60, slot: 'midday' }),
      ],
    });
    expect(result.blocks.find((b) => b.itemId === 'a')?.slot).toBe('morning');
    expect(result.blocks.filter((b) => b.itemId === 'a')).toHaveLength(1);
    expect(result.blocks.find((b) => b.itemId === 'b')?.slot).toBe('midday');
    const breaks = result.blocks.filter((b) => b.title === 'Break');
    expect(breaks).toHaveLength(1);
    expect(breaks[0]?.slot).toBe('midday');
  });

  it('keeps a Work item in its assigned section instead of spilling to the next', () => {
    const result = packDay({
      ...base(),
      buckets: [
        workBucket({
          slot: 'morning',
          slots: ['morning', 'midday'],
          weeklyMinutes: 6 * 60,
          hoursMinutes: 6 * 60,
          days: ['Mon'],
        }),
      ],
      items: [
        item({ id: 'a', bucketId: 'work', title: 'A', weight: 1, durationMinutes: 4 * 60, slot: 'morning' }),
        item({ id: 'b', bucketId: 'work', title: 'B', weight: 2, durationMinutes: 60, slot: 'morning' }),
      ],
    });
    expect(result.blocks.find((b) => b.itemId === 'a')?.slot).toBe('morning');
    expect(result.dropped.some((d) => d.itemId === 'b')).toBe(true);
    expect(result.blocks.some((b) => b.itemId === 'b')).toBe(false);
  });

  it('packs an appointment as a dated item, first in its section', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 600, days: ['Mon'] });
    const result = packDay({
      ...base(),
      buckets: [APPOINTMENTS_BUCKET, workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [
        item({ id: 'dishes', bucketId: 'house', title: 'Dishes', weight: 1, durationMinutes: 20, slot: 'morning' }),
        item({
          id: 'dentist',
          bucketId: APPOINTMENTS_ID,
          title: 'Dentist',
          type: 'scheduled',
          dueAt: monday,
          durationMinutes: 60,
          slot: 'morning',
        }),
      ],
    });
    const appt = result.blocks.find((b) => b.itemId === 'dentist');
    expect(appt?.durationMinutes).toBe(60);
    // the block kind is what drives the Quest and Quest Log appointment styling
    expect(appt?.kind).toBe('appointment');
    expect(appt?.slot).toBe('morning');
    const dishes = result.blocks.find((b) => b.itemId === 'dishes');
    expect((appt?.startMinutes ?? 0) < (dishes?.startMinutes ?? 0)).toBe(true);
  });

  it('gives an appointment section capacity, so what it displaces falls off', () => {
    // morning third of a 3h day is 60m; the appointment takes all of it
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 600, days: ['Mon'] });
    const result = packDay({
      ...base(),
      settings: settings({ dayMinutes: 180 }),
      buckets: [APPOINTMENTS_BUCKET, workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [
        item({ id: 'dishes', bucketId: 'house', title: 'Dishes', weight: 1, durationMinutes: 45, slot: 'morning' }),
        item({
          id: 'dentist',
          bucketId: APPOINTMENTS_ID,
          title: 'Dentist',
          type: 'scheduled',
          dueAt: monday,
          durationMinutes: 60,
          slot: 'morning',
        }),
      ],
    });
    expect(result.blocks.some((b) => b.itemId === 'dentist')).toBe(true);
    expect(result.dropped.some((d) => d.itemId === 'dishes')).toBe(true);
  });

  it('spills an appointment past its own section into the ones after it', () => {
    // 3h day = 60m a section. A 2h morning appointment eats all of morning and
    // 60m of midday, so the midday task has nothing left and falls off.
    const house = bucket({
      id: 'house',
      name: 'House',
      weight: 4,
      weeklyMinutes: 600,
      days: ['Mon'],
      slots: ['morning', 'midday', 'evening'],
    });
    const result = packDay({
      ...base(),
      settings: settings({ dayMinutes: 180 }),
      buckets: [APPOINTMENTS_BUCKET, workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [
        item({ id: 'am', bucketId: 'house', title: 'Morning task', weight: 1, durationMinutes: 30, slot: 'morning' }),
        item({ id: 'noon', bucketId: 'house', title: 'Midday task', weight: 2, durationMinutes: 30, slot: 'midday' }),
        item({ id: 'pm', bucketId: 'house', title: 'Evening task', weight: 3, durationMinutes: 30, slot: 'evening' }),
        item({
          id: 'dentist',
          bucketId: APPOINTMENTS_ID,
          title: 'Dentist',
          type: 'scheduled',
          dueAt: monday,
          durationMinutes: 120,
          slot: 'morning',
        }),
      ],
    });
    expect(result.blocks.some((b) => b.itemId === 'dentist')).toBe(true);
    expect(result.dropped.some((d) => d.itemId === 'am')).toBe(true);
    expect(result.dropped.some((d) => d.itemId === 'noon')).toBe(true);
    // evening is untouched: the 2h ran out before it
    expect(result.blocks.some((b) => b.itemId === 'pm')).toBe(true);
  });

  it('treats a 0-duration appointment as a checklist entry that never drops', () => {
    const result = packDay({
      ...base(),
      settings: settings({ dayMinutes: 0 }),
      buckets: [APPOINTMENTS_BUCKET, workBucket({ weeklyMinutes: 0, days: ['Tue'] })],
      items: [
        item({
          id: 'call',
          bucketId: APPOINTMENTS_ID,
          title: 'Call back',
          type: 'scheduled',
          dueAt: monday,
          durationMinutes: 0,
          slot: 'morning',
        }),
      ],
    });
    expect(result.blocks.some((b) => b.itemId === 'call')).toBe(true);
    expect(result.dropped.some((d) => d.itemId === 'call')).toBe(false);
  });

  it('only packs an appointment on its own date', () => {
    const result = packDay({
      ...base(),
      buckets: [APPOINTMENTS_BUCKET, workBucket({ weeklyMinutes: 0, days: ['Tue'] })],
      items: [
        item({
          id: 'dentist',
          bucketId: APPOINTMENTS_ID,
          title: 'Dentist',
          type: 'scheduled',
          dueAt: '2026-09-04',
          durationMinutes: 60,
          slot: 'morning',
        }),
      ],
    });
    expect(result.blocks.some((b) => b.itemId === 'dentist')).toBe(false);
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

  it('treats a later Events range as an event day', () => {
    const events = {
      ...bucket({ id: EVENTS_ID, name: 'Events', weight: 0, weeklyMinutes: 0, hoursMinutes: 0 }),
      kind: 'event' as const,
      ranges: [{ id: 'a', startDate: '2026-09-10', endDate: '2026-09-10' }],
    };
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 60, days: ['Thu'] });
    const result = packDay({
      ...base(),
      date: '2026-09-10',
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Fri'] }), events, house],
      items: [item({ id: 'dishes', bucketId: 'house', title: 'Dishes', durationMinutes: 20 })],
    });
    expect(result.blocks.some((b) => b.itemId === 'dishes')).toBe(false);
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
        item({
          id: 'trip',
          bucketId: EVENTS_ID,
          title: 'Travel day',
          type: 'scheduled',
          weight: 1,
          durationMinutes: 0,
          dueAt: monday,
        }),
        item({ id: 'dishes', bucketId: 'house', title: 'Dishes', weight: 1, durationMinutes: 20 }),
      ],
    });
    const trip = result.blocks.find((b) => b.itemId === 'trip');
    expect(trip?.kind).toBe('event');
    expect(result.blocks.some((b) => b.itemId === 'dishes')).toBe(false);
  });

  it('places an event item only on its date', () => {
    const events = {
      ...bucket({ id: EVENTS_ID, name: 'Events', weight: 0, weeklyMinutes: 0, hoursMinutes: 0 }),
      kind: 'event' as const,
      startDate: monday,
      endDate: '2026-09-02',
    };
    const trip = item({
      id: 'trip',
      bucketId: EVENTS_ID,
      title: 'Travel day',
      type: 'scheduled',
      dueAt: '2026-09-01',
      durationMinutes: 60,
    });
    const onDate = packDay({
      ...base(),
      date: '2026-09-01',
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), events],
      items: [trip],
    });
    const otherDay = packDay({
      ...base(),
      date: monday,
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), events],
      items: [trip],
    });
    expect(onDate.blocks.some((b) => b.itemId === 'trip')).toBe(true);
    expect(otherDay.blocks.some((b) => b.itemId === 'trip')).toBe(false);
  });

  it('places an event item on its date even when the day is not an event day', () => {
    const events = {
      ...bucket({ id: EVENTS_ID, name: 'Events', weight: 0, weeklyMinutes: 0, hoursMinutes: 0 }),
      kind: 'event' as const,
      startDate: '',
      endDate: '',
    };
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 60, days: ['Mon'] });
    const result = packDay({
      ...base(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), events, house],
      items: [
        item({
          id: 'trip',
          bucketId: EVENTS_ID,
          title: 'Travel day',
          type: 'scheduled',
          dueAt: monday,
          durationMinutes: 60,
        }),
        item({ id: 'dishes', bucketId: 'house', title: 'Dishes', weight: 1, durationMinutes: 20 }),
      ],
    });
    const trip = result.blocks.find((b) => b.itemId === 'trip');
    expect(trip?.kind).toBe('event');
    expect(result.blocks.some((b) => b.itemId === 'dishes')).toBe(true);
    expect(trip && 'slot' in trip).toBe(false);
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
  it('keeps leftover eat only after the day has started', () => {
    expect(liveSectionState({ sectionUsed: { evening: 225 } })).toEqual({ extra: {}, used: {} });
    expect(liveSectionState({ startedAt: '2026-08-29T12:00:00.000Z', sectionUsed: { evening: 225 } }).used).toEqual({
      evening: 225,
    });
  });

  it('packs six weeks from this week’s Sunday', () => {
    const from = weekStart('2026-08-29');
    const rows = packRange(from, PACK_RANGE_DAYS, base());
    expect(PACK_RANGE_DAYS).toBe(42);
    expect(rows).toHaveLength(42);
    expect(rows[0].date).toBe('2026-08-23');
    expect(rows[41].date).toBe('2026-10-03');
  });

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

describe('a cancelled appointment', () => {
  it('hands its hours back to the day', () => {
    const house = bucket({
      id: 'house',
      name: 'House',
      weight: 4,
      weeklyMinutes: 600,
      days: ['Mon'],
      slots: ['morning', 'midday', 'evening'],
    });
    const appt = item({
      id: 'dentist',
      bucketId: APPOINTMENTS_ID,
      title: 'Dentist',
      type: 'scheduled',
      dueAt: monday,
      durationMinutes: 120,
      slot: 'morning',
    });
    const input = {
      ...base(),
      settings: settings({ dayMinutes: 180 }),
      buckets: [APPOINTMENTS_BUCKET, workBucket({ weeklyMinutes: 0, days: ['Tue'] }), house],
      items: [
        item({ id: 'am', bucketId: 'house', title: 'Morning task', weight: 1, durationMinutes: 30, slot: 'morning' }),
        appt,
      ],
    };
    // while the appointment stands, it takes the morning and the task falls off
    expect(packDay(input).dropped.some((d) => d.itemId === 'am')).toBe(true);

    // cancelled, the morning is free again
    const afterSkip = packDay({
      ...input,
      previous: [{ id: 'x', itemId: 'dentist', status: 'skipped' }],
    });
    expect(afterSkip.blocks.some((b) => b.itemId === 'am')).toBe(true);
    expect(afterSkip.dropped.some((d) => d.itemId === 'am')).toBe(false);
  });
});

describe('capsAfterLoad', () => {
  const caps = { morning: 300, midday: 300, evening: 300 };

  it('spills what a section cannot cover into the ones after it', () => {
    // an 8h appointment in the morning of a 15h day: 5h from morning, 3h from midday
    const after = capsAfterLoad(caps, { morning: 480, midday: 0, evening: 0 });
    expect(after).toEqual({ morning: 0, midday: 120, evening: 300 });
  });

  it('never returns a negative section, and stops when the day runs out', () => {
    const after = capsAfterLoad(caps, { morning: 6000, midday: 0, evening: 0 });
    expect(after).toEqual({ morning: 0, midday: 0, evening: 0 });
  });

  it('leaves the day alone when there are no appointments', () => {
    expect(capsAfterLoad(caps, { morning: 0, midday: 0, evening: 0 })).toEqual(caps);
  });
});

describe('appointmentLoad', () => {
  it('totals appointment minutes per section and ignores everything else', () => {
    const load = appointmentLoad([
      { kind: 'appointment', slot: 'morning', durationMinutes: 60 },
      { kind: 'appointment', slot: 'morning', durationMinutes: 30 },
      { kind: 'appointment', slot: 'evening', durationMinutes: 45 },
      { kind: 'weighted', slot: 'morning', durationMinutes: 90 },
      { kind: 'personal', slot: 'midday', durationMinutes: 0 },
    ]);
    expect(load).toEqual({ morning: 90, midday: 0, evening: 45 });
  });
});

describe('skipPushDate', () => {
  it('does not defer a cancelled appointment or event to another day', () => {
    const appt = item({
      id: 'dentist',
      bucketId: APPOINTMENTS_ID,
      title: 'Dentist',
      type: 'scheduled',
      dueAt: monday,
      durationMinutes: 60,
    });
    expect(skipPushDate(appt, APPOINTMENTS_BUCKET, monday)).toBeNull();
  });
});

describe('packRange', () => {
  it('packs each date once and returns them in order', () => {
    const out = packRange(monday, 3, {
      settings: settings(),
      buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] })],
      items: [],
    });
    expect(out.map((r) => r.date)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02']);
    expect(out.every((r) => Array.isArray(r.result.blocks))).toBe(true);
  });
});
