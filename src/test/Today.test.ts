import { describe, expect, it } from 'vitest';

import { appointmentElapsed, formatCountdown, isEventPacked, nextSectionAction, nextSectionMinutes, slotLabel, todayEventItems, todaySectionDropped, todaySectionItems } from '../domain/today';
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
  it('keeps appointments and this section’s items, including Break', () => {
    const shown = todaySectionItems(
      [
        block({ id: 'appt', kind: 'appointment', title: 'Dentist' }),
        block({ id: 'house', kind: 'weighted', title: 'Floors', slot: 'morning' }),
        block({ id: 'work', kind: 'work', title: 'Standup', slot: 'midday' }),
        block({ id: 'break', kind: 'personal', title: 'Break', slot: 'morning' }),
        block({ id: 'morning', kind: 'personal', title: 'Morning Routine', slot: 'morning' }),
      ],
      'morning'
    );
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

describe('appointmentElapsed', () => {
  it('adds live time to stored minutes', () => {
    const started = '2026-08-29T12:00:00.000Z';
    expect(appointmentElapsed({ startedAt: started, elapsedMinutes: 5 }, Date.parse(started) + 2 * 60000)).toBe(7);
    expect(appointmentElapsed({ elapsedMinutes: 5 }, Date.parse(started))).toBe(5);
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

  it('ignores Break and unslotted appointments', () => {
    const blocks = [
      block({ id: 'work', kind: 'work', slot: 'midday', durationMinutes: 60 }),
      block({ id: 'break', kind: 'personal', title: 'Break', slot: 'midday', durationMinutes: 0 }),
      block({ id: 'appt', kind: 'appointment', title: 'Dentist', durationMinutes: 45 }),
    ];
    expect(nextSectionMinutes(blocks, 'morning')).toBe(60);
  });
});
