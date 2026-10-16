import { describe, expect, it } from 'vitest';

import { assignableWeekMinutes } from '../domain/budget';
import { weekdayFromKey } from '../domain/cadence';
import { collectEndDaySkipPushes, daySections, packDay, sectionMinutes } from '../domain/packDay';
import { todaySectionItems } from '../domain/today';
import { PACK_RANGE_DAYS, packRange } from '../domain/packWeek';
import { reservedLoad, capsAfterLoad, eatFromSections, isEventDay, liveSectionState, nextSlot, sectionCapacity, transitionLoad } from '../domain/sections';
import { leftoverSectionBlocks, nextAssignedDate, skipPushDate } from '../domain/skip';
import { APPOINTMENTS_BUCKET } from '../domain/seed';
import { APPOINTMENTS_ID, EVENTS_ID, SLOTS, type PackedBlock, type Slot } from '../domain/types';
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
  it('divides the day into whole hours, the spare ones later in the day', () => {
    // 14h is 4h, 5h, 5h — never 4h40m three times. A day is planned in hours.
    const even = daySections(settings({ dayMinutes: 14 * 60, dayStartMinutes: 7 * 60 }));
    expect(even.morning).toEqual({ start: 7 * 60, end: 7 * 60 + 240 });
    expect(even.midday).toEqual({ start: 7 * 60 + 240, end: 7 * 60 + 540 });
    expect(even.evening).toEqual({ start: 7 * 60 + 540, end: 7 * 60 + 14 * 60 });
  });

  it('keeps the odd minutes of a part-hour day on evening', () => {
    const rem = daySections(settings({ dayMinutes: 10 * 60 + 10, dayStartMinutes: 0 }));
    expect(rem.morning.end - rem.morning.start).toBe(3 * 60);
    expect(rem.midday.end - rem.midday.start).toBe(3 * 60);
    expect(rem.evening.end - rem.evening.start).toBe(4 * 60 + 10);
  });
});

describe('sectionMinutes', () => {
  it('reports whole hours, with the spare ones on the later stretches', () => {
    expect(sectionMinutes(settings({ dayMinutes: 14 * 60 }))).toEqual({
      morning: 4 * 60,
      midday: 5 * 60,
      evening: 5 * 60,
    });
  });

  it('puts the odd minutes on evening, not on morning or midday', () => {
    expect(sectionMinutes(settings({ dayMinutes: 10 * 60 + 10 }))).toEqual({
      morning: 3 * 60,
      midday: 3 * 60,
      evening: 4 * 60 + 10,
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
    // Morning is 4h on a 14h day, so 5h of appointment spills an hour forward.
    const after = eatFromSections(caps, 'morning', 300);
    expect(after.morning).toBe(0);
    expect(after.midday).toBe(caps.midday - 60);
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

describe('an appointment spanning sections', () => {
  it('stays on the list through every section it spans', () => {
    const result = packDay({
      ...base(),
      settings: settings({ dayMinutes: 900 }),
      buckets: [APPOINTMENTS_BUCKET, workBucket({ weeklyMinutes: 0, days: ['Tue'] })],
      items: [
        item({
          id: 'long',
          bucketId: APPOINTMENTS_ID,
          title: 'All afternoon',
          type: 'scheduled',
          dueAt: monday,
          durationMinutes: 240,
          slots: ['midday', 'evening'],
        }),
      ],
    });
    const appt = result.blocks.find((b) => b.itemId === 'long');
    // its time comes out of the first section it spans
    expect(appt?.slot).toBe('midday');
    expect(appt?.slots).toEqual(['midday', 'evening']);
    expect(todaySectionItems(result.blocks, 'midday').some((b) => b.itemId === 'long')).toBe(true);
    expect(todaySectionItems(result.blocks, 'evening').some((b) => b.itemId === 'long')).toBe(true);
    expect(todaySectionItems(result.blocks, 'morning').some((b) => b.itemId === 'long')).toBe(false);
  });

  it('takes its hours from the first section it spans, not the morning', () => {
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
        item({ id: 'am', bucketId: 'house', title: 'Morning task', weight: 1, durationMinutes: 45, slot: 'morning' }),
        item({ id: 'pm', bucketId: 'house', title: 'Evening task', weight: 2, durationMinutes: 45, slot: 'evening' }),
        item({
          id: 'evening-appt',
          bucketId: APPOINTMENTS_ID,
          title: 'Evening booking',
          type: 'scheduled',
          dueAt: monday,
          durationMinutes: 60,
          slots: ['evening'],
        }),
      ],
    });
    // the morning is untouched; the evening loses its whole hour
    expect(result.blocks.some((b) => b.itemId === 'am')).toBe(true);
    expect(result.dropped.some((d) => d.itemId === 'pm')).toBe(true);
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

describe('reservedLoad', () => {
  it('totals what a section owes before any bucket competes for it', () => {
    const load = reservedLoad([
      { kind: 'appointment', slot: 'morning', durationMinutes: 60 },
      { kind: 'appointment', slot: 'morning', durationMinutes: 30 },
      { kind: 'appointment', slot: 'evening', durationMinutes: 45 },
      { kind: 'weighted', slot: 'morning', durationMinutes: 90 },
      // Personal carries 0 unless it counts as day time, so it costs nothing here
      { kind: 'personal', slot: 'midday', durationMinutes: 0 },
    ]);
    expect(load).toEqual({ morning: 90, midday: 0, evening: 45 });
  });

  it('counts Personal once it carries minutes, and drops anything skipped', () => {
    const load = reservedLoad([
      { kind: 'personal', slot: 'morning', durationMinutes: 30 },
      { kind: 'personal', slot: 'midday', durationMinutes: 15 },
      { kind: 'personal', slot: 'evening', durationMinutes: 20, status: 'skipped' },
      { kind: 'appointment', slot: 'morning', durationMinutes: 60 },
    ]);
    expect(load).toEqual({ morning: 90, midday: 15, evening: 0 });
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

describe('auto-skip when moving to the next section', () => {
  const midday = (over: Record<string, unknown>) =>
    ({
      id: String(over.id),
      itemId: String(over.itemId ?? over.id),
      date: monday,
      bucketId: 'house',
      title: 'Thing',
      kind: 'weighted',
      slot: 'midday',
      startMinutes: 0,
      endMinutes: 30,
      durationMinutes: 30,
      status: 'pending',
      color: 'fff',
      flexible: true,
      ...over,
    }) as PackedBlock;

  it('auto-skips a missed appointment but spares one still spanning ahead', () => {
    const blocks = [
      midday({ id: 'task' }),
      midday({ id: 'spanning', kind: 'appointment', bucketId: APPOINTMENTS_ID, slots: ['midday', 'evening'] }),
      midday({ id: 'missed', kind: 'appointment', bucketId: APPOINTMENTS_ID }),
    ];
    // leaving midday: the spanning one carries on, the missed one is missed
    expect(leftoverSectionBlocks(blocks, [], 'midday').map((b) => b.id)).toEqual(['task', 'missed']);
    // leaving evening: nothing follows, so the spanning one is left over too
    expect(leftoverSectionBlocks(blocks, [], 'evening').map((b) => b.id)).toEqual(['spanning']);
  });

  it('still renews a scheduled item to the bucket’s next day', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 600, days: ['Mon', 'Thu'] });
    const scheduled = item({
      id: 'renew',
      bucketId: 'house',
      title: 'Deliver report',
      type: 'scheduled',
      dueAt: monday,
      durationMinutes: 30,
    });
    const pushes = collectEndDaySkipPushes(monday, [midday({ id: 'renew' })], [], [scheduled], [house]);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].toDate).toBe('2026-09-03');
  });

  it('does not renew a cancelled appointment', () => {
    const appt = item({
      id: 'dentist',
      bucketId: APPOINTMENTS_ID,
      title: 'Dentist',
      type: 'scheduled',
      dueAt: monday,
      durationMinutes: 60,
    });
    const pushes = collectEndDaySkipPushes(
      monday,
      [midday({ id: 'dentist', kind: 'appointment', bucketId: APPOINTMENTS_ID })],
      [],
      [appt],
      [APPOINTMENTS_BUCKET]
    );
    expect(pushes).toEqual([]);
  });
});

describe('Personal counted as day time', () => {
  const base3h = () => ({
    date: monday,
    buckets: [workBucket({ weeklyMinutes: 0, days: ['Tue'] }), bucket({
      id: 'house',
      name: 'House',
      weight: 4,
      weeklyMinutes: 600,
      days: ['Mon'],
      slots: ['morning', 'midday', 'evening'],
    })],
    items: [item({ id: 'am', bucketId: 'house', title: 'Morning task', durationMinutes: 45, slot: 'morning' })],
  });

  it('leaves the day alone when Personal sits beside it', () => {
    const result = packDay({
      ...base3h(),
      settings: settings({ dayMinutes: 180, morningMinutes: 30, breakMinutes: 15, eveningMinutes: 30 }),
    });
    const routine = result.blocks.find((b) => b.title === 'Morning Routine');
    expect(routine?.durationMinutes).toBe(0);
    expect(result.blocks.some((b) => b.itemId === 'am')).toBe(true);
  });

  it('takes Personal minutes out of their sections when it counts as day time', () => {
    const result = packDay({
      ...base3h(),
      settings: settings({
        dayMinutes: 180,
        morningMinutes: 45,
        breakMinutes: 15,
        eveningMinutes: 30,
        personalCountsAsDay: true,
      }),
    });
    const routine = result.blocks.find((b) => b.title === 'Morning Routine');
    // the routine now carries its minutes and is a real item
    expect(routine?.durationMinutes).toBe(45);
    // morning is 60m; 45m of routine leaves 15m, so the 45m task falls off
    expect(result.dropped.some((d) => d.itemId === 'am')).toBe(true);
  });
});

describe('assignable week', () => {
  it('comes off the top only when Personal counts as day time', () => {
    const beside = settings({ dayMinutes: 180, morningMinutes: 30, breakMinutes: 15, eveningMinutes: 15 });
    expect(assignableWeekMinutes(beside)).toBe(180 * 7);
    expect(assignableWeekMinutes({ ...beside, personalCountsAsDay: true })).toBe((180 - 60) * 7);
  });

  it('never goes negative when Personal outgrows the day', () => {
    const s = settings({ dayMinutes: 60, morningMinutes: 60, breakMinutes: 60, eveningMinutes: 60 });
    expect(assignableWeekMinutes({ ...s, personalCountsAsDay: true })).toBe(0);
  });
});

describe('a repeating appointment', () => {
  const weekly = (over = {}) =>
    item({
      id: 'therapy',
      bucketId: APPOINTMENTS_ID,
      title: 'Therapy',
      type: 'recurring',
      cadence: { kind: 'weekly', days: ['Mon'] },
      durationMinutes: 60,
      slots: ['midday'],
      ...over,
    });

  it('packs on every day its cadence hits, not on a single date', () => {
    const input = {
      ...base(),
      settings: settings({ dayMinutes: 900 }),
      buckets: [APPOINTMENTS_BUCKET, workBucket({ weeklyMinutes: 0, days: ['Tue'] })],
      items: [weekly()],
    };
    // monday is 2026-08-31
    expect(packDay({ ...input, date: monday }).blocks.some((b) => b.itemId === 'therapy')).toBe(true);
    expect(packDay({ ...input, date: '2026-09-01' }).blocks.some((b) => b.itemId === 'therapy')).toBe(false);
    expect(packDay({ ...input, date: '2026-09-07' }).blocks.some((b) => b.itemId === 'therapy')).toBe(true);
  });

  it('still takes its hours out of the day when it repeats', () => {
    const result = packDay({
      ...base(),
      date: monday,
      settings: settings({ dayMinutes: 180 }),
      buckets: [
        APPOINTMENTS_BUCKET,
        workBucket({ weeklyMinutes: 0, days: ['Tue'] }),
        bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 600, days: ['Mon'], slots: ['midday'] }),
      ],
      items: [weekly(), item({ id: 'task', bucketId: 'house', title: 'Task', durationMinutes: 45, slot: 'midday' })],
    });
    expect(result.blocks.some((b) => b.itemId === 'therapy')).toBe(true);
    expect(result.dropped.some((d) => d.itemId === 'task')).toBe(true);
  });

  it('keeps a one-off appointment on its date only', () => {
    const input = {
      ...base(),
      settings: settings({ dayMinutes: 900 }),
      buckets: [APPOINTMENTS_BUCKET, workBucket({ weeklyMinutes: 0, days: ['Tue'] })],
      items: [weekly({ id: 'dentist', type: 'scheduled', dueAt: monday, cadence: { kind: 'daily' } })],
    };
    expect(packDay({ ...input, date: monday }).blocks.some((b) => b.itemId === 'dentist')).toBe(true);
    // a daily cadence must not leak through on a scheduled appointment
    expect(packDay({ ...input, date: '2026-09-01' }).blocks.some((b) => b.itemId === 'dentist')).toBe(false);
  });
});

describe('every-N-days items in the packer', () => {
  // The cadence unit tests cover the rule; these cover the path an ordinary
  // list item actually takes through packDay, which had no coverage at all.
  const house = bucket({ id: 'house', name: 'House', weight: 4 });
  const chore = (startDate?: string) =>
    item({
      id: 'deep-clean',
      bucketId: 'house',
      title: 'Deep clean',
      cadence: { kind: 'everyNDays', n: 28, startWeekday: 'Mon', ...(startDate ? { startDate } : {}) },
    });

  function titlesOn(date: string, it: ReturnType<typeof item>) {
    return packDay({ date, settings: settings(), buckets: [workBucket(), house], items: [it] })
      .blocks.map((b: PackedBlock) => b.title);
  }

  it('lands on the start date and 28 days later, not the weeks between', () => {
    const it = chore('2026-08-31'); // a Monday
    expect(titlesOn('2026-08-31', it)).toContain('Deep clean');
    expect(titlesOn('2026-09-28', it)).toContain('Deep clean');
    expect(titlesOn('2026-09-07', it)).not.toContain('Deep clean');
    expect(titlesOn('2026-09-14', it)).not.toContain('Deep clean');
    expect(titlesOn('2026-09-21', it)).not.toContain('Deep clean');
  });

  it('never lands before its start date', () => {
    const it = chore('2026-09-28');
    expect(titlesOn('2026-08-31', it)).not.toContain('Deep clean');
  });

  it('two chores a week apart stay a week apart', () => {
    const a = chore('2026-08-31');
    const b = { ...chore('2026-09-07'), id: 'other' };
    expect(titlesOn('2026-08-31', a)).toContain('Deep clean');
    expect(titlesOn('2026-08-31', b)).not.toContain('Deep clean');
    expect(titlesOn('2026-09-07', b)).toContain('Deep clean');
  });

  it('falls back to the weekday lattice with no start date', () => {
    const it = chore();
    // Phase origin is the Monday 2000-01-03; 2026-08-31 is 9737 days on,
    // and 9737 % 28 is not 0, so this Monday is not a hit.
    const hits = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].filter(
      (d) => titlesOn(d, it).includes('Deep clean')
    );
    expect(hits).toHaveLength(1);
  });

  it('packs across a range without the cadence drifting', () => {
    const it = chore('2026-08-31');
    const days = packRange('2026-08-31', 60, {
      settings: settings(),
      buckets: [workBucket(), house],
      items: [it],
    });
    const hit = days
      .filter((d) => d.result.blocks.some((b: PackedBlock) => b.title === 'Deep clean'))
      .map((d) => d.date);
    expect(hit).toEqual(['2026-08-31', '2026-09-28', '2026-10-26']);
  });
});

describe('transitions between buckets', () => {
  const house = bucket({ id: 'house', name: 'House', weight: 4, slots: ['morning'] });
  const errands = bucket({ id: 'errands', name: 'Errands', weight: 5, slots: ['morning'] });

  function packWith(over = {}) {
    return packDay({
      date: monday,
      settings: settings({ transitionMinutes: 10, ...over }),
      buckets: [workBucket(), house, errands],
      items: [
        item({ id: 'dishes', bucketId: 'house', title: 'Dishes', durationMinutes: 30 }),
        item({ id: 'post', bucketId: 'errands', title: 'Post office', durationMinutes: 30 }),
      ],
    });
  }

  it('marks the switch between two buckets in the same section', () => {
    const trans = packWith().blocks.filter((b: PackedBlock) => b.kind === 'transition');
    expect(trans).toHaveLength(1);
    expect(trans[0].title).toBe('10m');
    expect(trans[0].durationMinutes).toBe(10);
    expect(trans[0].slot).toBe('morning');
  });

  it('sits between the two buckets it separates', () => {
    const morning = packWith()
      .blocks.filter((b: PackedBlock) => b.slot === 'morning' && b.kind !== 'personal')
      .map((b: PackedBlock) => b.bucketId);
    expect(morning).toEqual(['house', 'transition', 'errands']);
  });

  it('charges the time to the section, so it is gone from what work can use', () => {
    const withTrans = packWith().blocks;
    const without = packWith({ transitionMinutes: 0 }).blocks;
    expect(reservedLoad(withTrans).morning - reservedLoad(without).morning).toBe(10);
  });

  it('the timers lose exactly what the packer charged', () => {
    // reservedLoad is what the section countdown reads, so a charged switch has
    // to show up there or the clock hands back time the day does not have.
    const blocks = packWith().blocks;
    const trans = blocks.filter((b: PackedBlock) => b.kind === 'transition');
    const charged = trans.reduce((s: number, b: PackedBlock) => s + b.durationMinutes, 0);
    expect(reservedLoad(blocks).morning).toBeGreaterThanOrEqual(charged);
  });

  it('one bucket in a section pays nothing', () => {
    const only = packDay({
      date: monday,
      settings: settings({ transitionMinutes: 10 }),
      buckets: [workBucket(), house],
      items: [item({ id: 'dishes', bucketId: 'house', title: 'Dishes', durationMinutes: 30 })],
    });
    const morning = only.blocks.filter((b: PackedBlock) => b.slot === 'morning');
    expect(morning.some((b: PackedBlock) => b.kind === 'transition')).toBe(false);
  });

  it('zero transition minutes emits nothing at all', () => {
    expect(packWith({ transitionMinutes: 0 }).blocks.some((b: PackedBlock) => b.kind === 'transition')).toBe(
      false
    );
  });

  it('never scores and never renews', () => {
    const blocks = packWith().blocks;
    const trans = blocks.find((b: PackedBlock) => b.kind === 'transition');
    expect(trans?.itemId).toBeUndefined();
    expect(collectEndDaySkipPushes(monday, blocks, [], [], [workBucket(), house, errands])).toEqual([]);
  });
});

describe('bucket days bound an item in the packer', () => {
  const garden = bucket({
    id: 'garden',
    name: 'Garden',
    weight: 4,
    days: ['Sat', 'Sun'],
    slots: ['morning'],
  });
  const mow = item({
    id: 'mow',
    bucketId: 'garden',
    title: 'Mow',
    durationMinutes: 60,
    cadence: { kind: 'everyNDays', n: 60, startDate: '2026-09-05' },
  });

  function mowDates(start: string, days: number) {
    return packRange(start, days, { settings: settings(), buckets: [workBucket(), garden], items: [mow] })
      .filter((d) => d.result.blocks.some((b: PackedBlock) => b.title === 'Mow'))
      .map((d) => d.date);
  }

  it('lands only on days the bucket runs', () => {
    const hits = mowDates('2026-09-05', 130);
    expect(hits.every((d) => ['Sat', 'Sun'].includes(weekdayFromKey(d)))).toBe(true);
  });

  it('moves the 60-day mark forward rather than skipping the cut', () => {
    // Sep 5 + 60 is Wed Nov 4, which Garden is shut for. It mows the 7th.
    // The third is Sep 5 + 120 = Sun Jan 3, counted from the anchor rather
    // than from the pushed date, so the push does not drift the rhythm.
    expect(mowDates('2026-09-05', 130)).toEqual(['2026-09-05', '2026-11-07', '2027-01-03']);
  });
});

describe('a Work item split around Break', () => {
  const wednesday = '2026-10-14';
  const deep = item({ id: 'w', bucketId: 'work', title: 'Deep', durationMinutes: 240 });
  const pack = (over = {}) =>
    packDay({
      date: wednesday,
      settings: settings(),
      buckets: [workBucket({ weeklyMinutes: 40 * 60 })],
      items: [deep],
      ...over,
    });

  it('keeps the second half pending when a repack knows only the first half is complete', () => {
    const first = pack();
    const previous = first.blocks
      .filter((b) => b.id.endsWith('-a'))
      .map((b) => ({ ...b, status: 'complete' as const }));
    const again = pack({ previous });
    const halves = again.blocks.filter((b) => b.itemId === 'w');
    expect(halves.map((b) => [b.id.slice(-2), b.status])).toEqual([
      ['-a', 'complete'],
      ['-b', 'pending'],
    ]);
  });

  it('yields one skip push when both halves are left pending', () => {
    const scheduled = { ...deep, type: 'scheduled' as const };
    const r = pack({ items: [scheduled] });
    expect(r.blocks.filter((b) => b.itemId === 'w')).toHaveLength(2);
    const pushes = collectEndDaySkipPushes(wednesday, r.blocks, r.dropped, [scheduled], [workBucket({ weeklyMinutes: 40 * 60 })]);
    expect(pushes).toHaveLength(1);
  });
});

describe('appointments in two sections with Work and Home between them', () => {
  const day = '2026-10-14';
  function packSpread() {
    return packDay({
      date: day,
      settings: settings({ transitionMinutes: 10 }),
      buckets: [
        workBucket({ slots: ['morning', 'midday'], weeklyMinutes: 40 * 60 }),
        APPOINTMENTS_BUCKET,
        bucket({ id: 'h', name: 'Home', weight: 2, slot: 'evening' }),
      ],
      items: [
        item({ id: 'a1', bucketId: 'appointments', title: 'Doc', type: 'scheduled', dueAt: day, slots: ['morning'], slot: 'morning', durationMinutes: 30 }),
        item({ id: 'a2', bucketId: 'appointments', title: 'Dent', type: 'scheduled', dueAt: day, slots: ['evening'], slot: 'evening', durationMinutes: 30 }),
        item({ id: 'w1', bucketId: 'work', title: 'W', slot: 'morning', durationMinutes: 60 }),
        item({ id: 'h1', bucketId: 'h', title: 'H', durationMinutes: 30 }),
      ],
    });
  }

  it('carries a switch marker in each section that was charged for one', () => {
    expect(reservedLoad(packSpread().blocks)).toEqual({ morning: 40, midday: 0, evening: 40 });
  });

  it('lists blocks in section order', () => {
    const order = packSpread()
      .blocks.filter((b: PackedBlock) => b.kind !== 'personal' && b.slot)
      .map((b: PackedBlock) => ['morning', 'midday', 'evening'].indexOf(b.slot as string));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('a skip push onto an event day', () => {
  it('moves on to the next assigned day that is not an event day', () => {
    const home = bucket({ id: 'h', name: 'Home', weight: 2 });
    const events = bucket({
      id: 'events',
      name: 'Events',
      weight: 0,
      kind: 'event',
      ranges: [{ id: 'r', startDate: '2026-10-15', endDate: '2026-10-15' }],
    });
    const chore = item({ id: 'c', bucketId: 'h', title: 'Chore', type: 'scheduled', cadence: { kind: 'weekly', days: ['Wed'] } });
    expect(skipPushDate(chore, home, '2026-10-14', events)).toBe('2026-10-16');
  });
});

describe('a bucket with no open days', () => {
  it('hits none of its items, so they are neither placed nor dropped', () => {
    const closed = bucket({ id: 'h', name: 'Home', weight: 2, days: [] });
    const r = packDay({
      date: monday,
      settings: settings(),
      buckets: [workBucket(), closed],
      items: [item({ id: 'h1', bucketId: 'h', title: 'H', durationMinutes: 30 })],
    });
    expect([...r.blocks, ...r.dropped].some((b) => b.itemId === 'h1')).toBe(false);
  });
});

describe('reservedLoad against what the packer charged', () => {
  // A small seeded generator, so a failure names a day that can be rerun.
  function rng(seed: number) {
    let x = seed;
    return (n: number) => {
      x = (x * 1664525 + 1013904223) % 4294967296;
      return Math.floor((x / 4294967296) * n);
    };
  }

  for (let seed = 1; seed <= 12; seed += 1) {
    it(`agrees for generated day ${seed}`, () => {
      const pick = rng(seed);
      const day = '2026-10-14';
      const transitionMinutes = [0, 5, 10, 15][pick(4)];
      const home = bucket({ id: 'h', name: 'Home', weight: 2, slots: [...SLOTS], weeklyMinutes: 20 * 60 });
      const garden = bucket({ id: 'g', name: 'Garden', weight: 3, slots: [...SLOTS], weeklyMinutes: 20 * 60 });
      const apptSlots = (): Slot[] => SLOTS.slice(pick(3), 3).slice(0, 1 + pick(3));
      const items = [
        ...Array.from({ length: 1 + pick(3) }, (_, i) => {
          const slots = apptSlots();
          return item({ id: `a${i}`, bucketId: 'appointments', title: `A${i}`, type: 'scheduled', dueAt: day, slots, slot: slots[0], durationMinutes: 15 * (1 + pick(4)) });
        }),
        ...Array.from({ length: pick(3) }, (_, i) =>
          item({ id: `w${i}`, bucketId: 'work', title: `W${i}`, slot: SLOTS[pick(3)], durationMinutes: 30 * (1 + pick(3)) })
        ),
        ...Array.from({ length: pick(4) }, (_, i) =>
          item({ id: `h${i}`, bucketId: i % 2 ? 'g' : 'h', title: `H${i}`, slot: SLOTS[pick(3)], durationMinutes: 15 * (1 + pick(3)) })
        ),
      ];
      const result = packDay({
        date: day,
        settings: settings({ dayMinutes: 15 * 60, transitionMinutes }),
        buckets: [workBucket({ slots: [...SLOTS], weeklyMinutes: 20 * 60 }), APPOINTMENTS_BUCKET, home, garden],
        items,
      });
      // Nothing may fall off, or a bucket's switch is bought and never marked.
      expect(result.dropped).toEqual([]);

      const apptLoad: Record<Slot, number> = { morning: 0, midday: 0, evening: 0 };
      const bucketsIn: Record<Slot, Set<string>> = { morning: new Set(), midday: new Set(), evening: new Set() };
      for (const it of items) {
        const slot = (it.bucketId === 'appointments' ? it.slots?.[0] : it.slot) as Slot;
        if (it.bucketId === 'appointments') apptLoad[slot] += it.durationMinutes;
        bucketsIn[slot].add(it.bucketId);
      }
      const switching = transitionLoad(
        { morning: bucketsIn.morning.size, midday: bucketsIn.midday.size, evening: bucketsIn.evening.size },
        transitionMinutes
      );
      const charged = Object.fromEntries(SLOTS.map((s) => [s, apptLoad[s] + switching[s]]));
      const timer = reservedLoad(result.blocks.filter((b: PackedBlock) => b.kind !== 'personal'));
      expect(timer).toEqual(charged);
    });
  }
});

describe('event blocks in the running order', () => {
  it('keeps event blocks ahead of the day\'s other blocks on an event day', () => {
    const day = '2026-10-14';
    const events = bucket({
      id: 'events',
      name: 'Events',
      weight: 0,
      kind: 'event',
      ranges: [{ id: 'r', startDate: '2026-10-20', endDate: '2026-10-20' }],
    });
    const r = packDay({
      date: day,
      settings: settings(),
      buckets: [workBucket(), events, bucket({ id: 'h', name: 'Home', weight: 2 })],
      items: [
        item({ id: 'e1', bucketId: 'events', title: 'Show', type: 'scheduled', dueAt: day }),
        item({ id: 'h1', bucketId: 'h', title: 'H', durationMinutes: 30 }),
      ],
    });
    const kinds = r.blocks.map((b: PackedBlock) => b.kind);
    expect(kinds).toContain('event');
    expect(kinds[0]).toBe('event');
  });
});

describe('repack and skip pushes, further cases', () => {
  const wednesday = '2026-10-14';
  const deep = item({ id: 'w', bucketId: 'work', title: 'Deep', durationMinutes: 240 });

  it('still matches by itemId when previous entries carry no id', () => {
    const args = { date: wednesday, settings: settings(), buckets: [workBucket({ weeklyMinutes: 40 * 60 })], items: [deep] };
    const done = packDay(args).blocks.filter((b: PackedBlock) => b.itemId === 'w');
    const previous = [{ itemId: 'w', status: 'complete' as const }];
    const again = packDay({ ...args, previous }).blocks.filter((b: PackedBlock) => b.itemId === 'w');
    expect(done).toHaveLength(2);
    expect(again.map((b: PackedBlock) => b.status)).toEqual(['complete', 'complete']);
  });

  it('pushes a split scheduled item once, past an event day', () => {
    const scheduled = { ...deep, type: 'scheduled' as const };
    const home = workBucket({ weeklyMinutes: 40 * 60, days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] });
    const events = bucket({
      id: 'events',
      name: 'Events',
      weight: 0,
      kind: 'event',
      ranges: [{ id: 'r', startDate: '2026-10-15', endDate: '2026-10-15' }],
    });
    const r = packDay({ date: wednesday, settings: settings(), buckets: [home, events], items: [scheduled] });
    const pushes = collectEndDaySkipPushes(wednesday, r.blocks, r.dropped, [scheduled], [home, events]);
    expect(pushes).toEqual([{ itemId: 'w', toDate: '2026-10-16' }]);
  });
});
