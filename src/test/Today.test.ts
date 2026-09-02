import { describe, expect, it } from 'vitest';

import { bookedMinutes, formatCountdown, isEventPacked, nextSectionAction, nextSectionMinutes, openBlocks, slotLabel, todayEventItems, todaySectionDropped, todaySectionItems } from '../domain/today';
import type { PackedBlock } from '../domain/types';

function block(partial: Partial<PackedBlock> & Pick<PackedBlock, 'id' | 'kind'>): PackedBlock {
  return {
    date: '2026-08-29',
    bucketId: 'x',
    title: partial.title || partial.id,
    startMinutes: 0,
    endMinutes: 30,
    durationMinutes: 30,
    status: 'pending',
    color: 'fff',
    flexible: true,
    ...partial,
  };
}

describe('today section list', () => {
  it('keeps this section’s items, including Break and its appointments', () => {
    const shown = todaySectionItems(
      [
        block({ id: 'appt', kind: 'appointment', title: 'Dentist', slot: 'morning' }),
        block({ id: 'later', kind: 'appointment', title: 'Optician', slot: 'evening' }),
        block({ id: 'house', kind: 'weighted', title: 'Floors', slot: 'morning' }),
        block({ id: 'work', kind: 'work', title: 'Standup', slot: 'midday' }),
        block({ id: 'break', kind: 'personal', title: 'Break', slot: 'morning' }),
        // 0 minutes: Personal is a pause beside the day, so the routine is a
        // marker rather than something to complete.
        block({ id: 'morning', kind: 'personal', title: 'Morning Routine', slot: 'morning', durationMinutes: 0 }),
      ],
      'morning'
    );
    // An appointment sits in one section now, not all of them.
    expect(shown.map((b) => b.id)).toEqual(['appt', 'house', 'break']);
    expect(shown.find((b) => b.title === 'Break')?.slot).toBe('morning');
  });

  it('shows falling-off for that section only', () => {
    const shown = todaySectionDropped(
      [
        block({ id: 'a', kind: 'weighted', slot: 'morning', status: 'dropped' }),
        block({ id: 'b', kind: 'weighted', slot: 'evening', status: 'dropped' }),
      ],
      'morning'
    );
    expect(shown.map((b) => b.id)).toEqual(['a']);
  });
});

describe('event day list', () => {
  it('hides Personal on an event day', () => {
    const blocks = [
      block({ id: 'morning', kind: 'personal', title: 'Morning Routine', slot: 'morning' }),
      block({ id: 'trip', kind: 'event', title: 'Travel', status: 'pending' }),
    ];
    expect(isEventPacked(blocks)).toBe(true);
    expect(todayEventItems(blocks).map((b) => b.id)).toEqual(['trip']);
    expect(todayEventItems(blocks)[0].status).toBe('pending');
  });
});

describe('nextSectionAction', () => {
  it('names the next stretch and the day-ending action', () => {
    expect(nextSectionAction('morning')).toEqual({ label: 'Start Next Chapter', kind: 'next' });
    expect(nextSectionAction('midday')).toEqual({ label: 'Start Next Chapter', kind: 'next' });
    expect(nextSectionAction('evening')).toEqual({ label: 'Hearth', kind: 'end' });
    expect(slotLabel('morning')).toBe('Morning');
  });
});

describe('formatCountdown', () => {
  it('renders remaining time as hours and minutes', () => {
    expect(formatCountdown(5 * 60)).toBe('5h');
    expect(formatCountdown(5 * 60 + 12)).toBe('5h 12m');
    expect(formatCountdown(12.5)).toBe('12m');
    expect(formatCountdown(0)).toBe('0m');
  });
});

describe('nextSectionMinutes', () => {
  it('adds up the buckets waiting in the next stretch', () => {
    const blocks = [
      block({ id: 'a', kind: 'weighted', slot: 'morning', durationMinutes: 45 }),
      block({ id: 'b', kind: 'weighted', slot: 'midday', durationMinutes: 60 }),
      block({ id: 'c', kind: 'weighted', slot: 'midday', durationMinutes: 30 }),
      block({ id: 'd', kind: 'weighted', slot: 'evening', durationMinutes: 90 }),
    ];
    expect(nextSectionMinutes(blocks, 'morning')).toBe(90);
    expect(nextSectionMinutes(blocks, 'midday')).toBe(90);
  });

  it('is 0 in the evening, since nothing follows it', () => {
    expect(nextSectionMinutes([block({ id: 'e', kind: 'weighted', slot: 'evening' })], 'evening')).toBe(0);
  });

  it('counts the next section’s appointments but never Break', () => {
    const blocks = [
      block({ id: 'work', kind: 'work', slot: 'midday', durationMinutes: 60 }),
      block({ id: 'break', kind: 'personal', title: 'Break', slot: 'midday', durationMinutes: 0 }),
      block({ id: 'appt', kind: 'appointment', title: 'Dentist', slot: 'midday', durationMinutes: 45 }),
      block({ id: 'other', kind: 'appointment', title: 'Optician', slot: 'evening', durationMinutes: 30 }),
    ];
    expect(nextSectionMinutes(blocks, 'morning')).toBe(105);
  });
});

describe('openBlocks', () => {
  it('drops finished items so the list stays what is left to do', () => {
    const shown = openBlocks([
      block({ id: 'a', kind: 'weighted', title: 'Floors', slot: 'morning' }),
      block({ id: 'b', kind: 'weighted', title: 'Dishes', slot: 'morning', status: 'complete' }),
      block({ id: 'c', kind: 'weighted', title: 'Bins', slot: 'morning', status: 'skipped' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['a']);
  });

  it('keeps Break, which is a control rather than an item', () => {
    const shown = openBlocks([
      block({ id: 'break', kind: 'personal', title: 'Break', slot: 'morning', status: 'complete' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['break']);
  });
});

describe('booked time', () => {
  it('totals appointments and ignores cancelled ones', () => {
    const blocks = [
      block({ id: 'a', kind: 'appointment', title: 'Dentist', slot: 'morning', durationMinutes: 90 }),
      block({ id: 'b', kind: 'appointment', title: 'Call', slot: 'evening', durationMinutes: 30 }),
      block({ id: 'c', kind: 'appointment', title: 'Cancelled', slot: 'morning', durationMinutes: 240, status: 'skipped' }),
      block({ id: 'd', kind: 'weighted', title: 'Floors', slot: 'morning', durationMinutes: 60 }),
    ];
    expect(bookedMinutes(blocks)).toBe(120);
  });
});

describe('Personal counting as day time', () => {
  it('puts the routine on the list once it carries minutes', () => {
    const routine = (durationMinutes: number) =>
      todaySectionItems(
        [block({ id: 'morning', kind: 'personal', title: 'Morning Routine', slot: 'morning', durationMinutes })],
        'morning'
      );
    // beside the day: a marker, not an item
    expect(routine(0)).toEqual([]);
    // inside the day: yours to complete or skip
    expect(routine(30).map((b) => b.id)).toEqual(['morning']);
  });
});

describe('transitions on the Quest list', () => {
  const morning = block({ id: 'a', kind: 'weighted', slot: 'morning' });
  const gap = block({ id: 'g', kind: 'transition', slot: 'morning', durationMinutes: 10, title: '10m' });
  const midday = block({ id: 'b', kind: 'weighted', slot: 'midday' });

  it('shows a switch in the section it separates', () => {
    expect(todaySectionItems([morning, gap, midday], 'morning').map((b) => b.id)).toEqual(['a', 'g']);
  });

  it('keeps it out of every other section', () => {
    expect(todaySectionItems([morning, gap, midday], 'midday').map((b) => b.id)).toEqual(['b']);
  });

  it('survives openBlocks, since there is nothing to complete', () => {
    expect(openBlocks([gap]).map((b) => b.id)).toEqual(['g']);
  });

  it('is not counted as work waiting in the next stretch', () => {
    const nextGap = block({ id: 'g2', kind: 'transition', slot: 'midday', durationMinutes: 10 });
    expect(nextSectionMinutes([midday, nextGap], 'morning')).toBe(30);
  });
});
