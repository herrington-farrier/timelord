import { describe, expect, it } from 'vitest';

import { appointmentElapsed, formatCountdown, isEventPacked, todayEventItems, todaySectionDropped, todaySectionItems } from '../domain/today';
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
      block({ id: 'trip', kind: 'event', title: 'Travel' }),
    ];
    expect(isEventPacked(blocks)).toBe(true);
    expect(todayEventItems(blocks).map((b) => b.id)).toEqual(['trip']);
  });
});

describe('formatCountdown', () => {
  it('renders remaining minutes as m:ss', () => {
    expect(formatCountdown(12.5)).toBe('12:30');
    expect(formatCountdown(0)).toBe('0:00');
  });
});

describe('appointmentElapsed', () => {
  it('adds live time to stored minutes', () => {
    const started = '2026-08-29T12:00:00.000Z';
    expect(appointmentElapsed({ startedAt: started, elapsedMinutes: 5 }, Date.parse(started) + 2 * 60000)).toBe(7);
    expect(appointmentElapsed({ elapsedMinutes: 5 }, Date.parse(started))).toBe(5);
  });
});
