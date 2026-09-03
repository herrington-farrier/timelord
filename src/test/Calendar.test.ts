import { describe, expect, it } from 'vitest';

import { freeTone, loadTone } from '../domain/budget';
import { boardShowsDay, boardStartFor, fallingChips, isAccentChip, listChips, listKeysFrom, listShowsDay, orderChips, placedChips, scheduledMinutes, sectionFreeMinutes, visibleChips } from '../pages/Calendar';
import { weekStart } from '../shared/dates';
import type { PackedBlock } from '../domain/types';

function block(partial: Partial<PackedBlock> & Pick<PackedBlock, 'id' | 'kind'>): PackedBlock {
  return {
    date: '2026-08-29',
    bucketId: 'x',
    title: partial.id,
    startMinutes: 0,
    endMinutes: 30,
    durationMinutes: 30,
    status: 'pending',
    color: 'fff',
    flexible: true,
    ...partial,
  };
}

describe('scheduledMinutes', () => {
  it('tallies productive blocks only', () => {
    const minutes = scheduledMinutes([
      block({ id: 'morning', kind: 'personal', durationMinutes: 60 }),
      block({ id: 'trans', kind: 'transition', durationMinutes: 10 }),
      block({ id: 'work', kind: 'work', durationMinutes: 120 }),
      block({ id: 'drop', kind: 'weighted', durationMinutes: 45, status: 'dropped' }),
    ]);
    expect(minutes).toBe(120);
  });
});

describe('sectionFreeMinutes', () => {
  const settings = { dayMinutes: 15 * 60 };

  it('subtracts packed productive minutes from each section', () => {
    expect(
      sectionFreeMinutes(settings, [
        block({ id: 'a', kind: 'weighted', slot: 'morning', durationMinutes: 3 * 60 }),
        block({ id: 'b', kind: 'weighted', slot: 'evening', durationMinutes: 45 }),
      ])
    ).toEqual({ morning: 2 * 60, midday: 5 * 60, evening: 5 * 60 - 45 });
  });

  it('ignores personal, appointments, events, and dropped items', () => {
    expect(
      sectionFreeMinutes(settings, [
        block({ id: 'morning', kind: 'personal', slot: 'morning', title: 'Morning Routine', durationMinutes: 60 }),
        block({ id: 'meet', kind: 'appointment', durationMinutes: 90 }),
        block({ id: 'trip', kind: 'event', bucketId: 'events', durationMinutes: 120 }),
        block({ id: 'drop', kind: 'weighted', slot: 'midday', durationMinutes: 60, status: 'dropped' }),
      ])
    ).toEqual({ morning: 5 * 60, midday: 5 * 60, evening: 5 * 60 });
  });

  it('uses the bucket slot when the packed slot is missing', () => {
    const food = { id: 'food', slot: 'evening' as const };
    expect(
      sectionFreeMinutes(
        settings,
        [block({ id: 'cook', kind: 'weighted', bucketId: 'food', durationMinutes: 60 })],
        [food]
      )
    ).toEqual({ morning: 5 * 60, midday: 5 * 60, evening: 4 * 60 });
  });

  it('applies leftover eat to section capacity', () => {
    expect(sectionFreeMinutes(settings, [], [], { evening: 30 }, { morning: 60 })).toEqual({
      morning: 4 * 60,
      midday: 5 * 60,
      evening: 5 * 60 + 30,
    });
  });
});

describe('loadTone', () => {
  it('is green under 50%, yellow through 85%, red above', () => {
    expect(loadTone(4 * 60, 14 * 60)).toBe('ok');
    expect(loadTone(7 * 60, 14 * 60)).toBe('mid');
    expect(loadTone(12 * 60, 14 * 60)).toBe('hot');
  });
});

describe('freeTone', () => {
  it('is red when none is left and green when the section is unused', () => {
    expect(freeTone(0, 5 * 60)).toBe('hot');
    expect(freeTone(5 * 60, 5 * 60)).toBe('ok');
    expect(freeTone(2 * 60, 5 * 60)).toBe('mid');
  });
});

describe('weekStart', () => {
  it('aligns Saturday to the Sunday of that week', () => {
    expect(weekStart('2026-08-29')).toBe('2026-08-23');
    expect(weekStart('2026-08-23')).toBe('2026-08-23');
  });
});

describe('placedChips', () => {
  it('hides transitions and a routine that costs nothing', () => {
    const shown = placedChips([
      block({ id: 'morning', kind: 'personal', durationMinutes: 0 }),
      block({ id: 'trans', kind: 'transition' }),
      block({ id: 'house', kind: 'weighted' }),
      block({ id: 'meet', kind: 'appointment' }),
      block({ id: 'trip', kind: 'event', bucketId: 'events' }),
      block({ id: 'break', kind: 'personal', title: 'Break' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['house', 'meet', 'trip', 'break']);
  });

  it('shows a routine that takes time out of the day', () => {
    // With Personal counted as day time the routines carry real minutes, and a
    // cell that omits them reads as emptier than the day actually is.
    const shown = placedChips([
      block({ id: 'morning', kind: 'personal', durationMinutes: 60 }),
      block({ id: 'house', kind: 'weighted' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['morning', 'house']);
  });
});

describe('listChips', () => {
  it('lists event-day items without section grouping', () => {
    const shown = listChips([
      block({ id: 'morning', kind: 'personal', title: 'Morning Routine', slot: 'morning' }),
      block({ id: 'trip', kind: 'event', bucketId: 'events', title: 'Travel', durationMinutes: 0 }),
      block({ id: 'evening', kind: 'personal', title: 'Evening Routine', slot: 'evening' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['trip']);
  });

  it('still lists Break when work chips have no slot', () => {
    const shown = listChips([
      block({ id: 'w1', kind: 'work', title: 'Deep' }),
      block({ id: 'd:break', kind: 'personal', title: 'Break' }),
      block({ id: 'w2', kind: 'work', title: 'Deep' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['w1', 'd:break', 'w2']);
  });

  it('keeps Break between Work halves', () => {
    const shown = listChips([
      block({ id: 'w2', kind: 'work', slot: 'midday', title: 'Deep', startMinutes: 3 }),
      block({ id: 'break', kind: 'personal', slot: 'midday', title: 'Break', startMinutes: 2 }),
      block({ id: 'w1', kind: 'work', slot: 'midday', title: 'Deep', startMinutes: 1 }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['w1', 'break', 'w2']);
  });

  it('lists event items with other chips, not pinned', () => {
    const shown = listChips([
      block({ id: 'house', kind: 'weighted', slot: 'morning', title: 'Floors' }),
      block({ id: 'trip', kind: 'event', bucketId: 'events', title: 'Travel' }),
      block({ id: 'morning', kind: 'personal', slot: 'morning', title: 'Morning Routine' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['morning', 'house', 'trip']);
  });

  it('orders the list by section, not clock', () => {
    const shown = listChips([
      block({ id: 'evening', kind: 'personal', slot: 'evening', title: 'Evening Routine' }),
      block({ id: 'house', kind: 'weighted', slot: 'morning', title: 'Floors' }),
      block({ id: 'cook', kind: 'weighted', slot: 'evening', title: 'Cooking' }),
      block({ id: 'break', kind: 'personal', slot: 'midday', title: 'Break' }),
      block({ id: 'morning', kind: 'personal', slot: 'morning', title: 'Morning Routine' }),
      block({ id: 'trans', kind: 'transition' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['morning', 'house', 'break', 'cook', 'evening']);
  });

  it('keeps evening-bucket chips in the last third when the packed slot is missing', () => {
    const food = { id: 'food', slot: 'evening' as const };
    const shown = listChips(
      [
        block({ id: 'evening', kind: 'personal', slot: 'evening', title: 'Evening Routine' }),
        block({ id: 'cook', kind: 'weighted', bucketId: 'food', title: 'Cooking' }),
        block({ id: 'house', kind: 'weighted', slot: 'morning', title: 'Floors' }),
      ],
      [food]
    );
    expect(shown.map((b) => b.id)).toEqual(['house', 'cook', 'evening']);
  });
});

describe('orderChips', () => {
  it('pins appointments first like the calendar cells', () => {
    const shown = orderChips([
      block({ id: 'house', kind: 'weighted' }),
      block({ id: 'meet', kind: 'appointment' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['meet', 'house']);
  });

  it('does not accent event chips', () => {
    const shown = orderChips([
      block({ id: 'house', kind: 'weighted' }),
      block({ id: 'trip', kind: 'event', bucketId: 'events' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['house', 'trip']);
    expect(isAccentChip(block({ id: 'trip', kind: 'event', bucketId: 'events' }))).toBe(false);
    expect(isAccentChip(block({ id: 'meet', kind: 'appointment' }))).toBe(true);
    expect(isAccentChip(block({ id: 'house', kind: 'weighted' }))).toBe(false);
  });
});

describe('fallingChips', () => {
  it('keeps every dropped item, including a whole bucket', () => {
    const shown = fallingChips([
      block({ id: 'g1', kind: 'weighted', status: 'dropped', bucketId: 'garden' }),
      block({ id: 'g2', kind: 'weighted', status: 'dropped', bucketId: 'garden' }),
      block({ id: 'g3', kind: 'weighted', status: 'dropped', bucketId: 'garden' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['g1', 'g2', 'g3']);
  });
});

describe('listShowsDay', () => {
  it('keeps an empty event day on the list', () => {
    expect(listShowsDay([], [], true)).toBe(true);
    expect(listShowsDay([], [], false)).toBe(false);
    expect(listShowsDay([block({ id: 'house', kind: 'weighted' })], [], false)).toBe(true);
  });
});

describe('listKeysFrom', () => {
  it('starts at today and stays on the board', () => {
    expect(listKeysFrom(['2026-08-23', '2026-08-24', '2026-08-29', '2026-09-12'], '2026-08-29')).toEqual([
      '2026-08-29',
      '2026-09-12',
    ]);
  });
});

describe('boardShowsDay', () => {
  it('hides days before today', () => {
    expect(boardShowsDay('2026-08-28', '2026-08-29')).toBe(false);
    expect(boardShowsDay('2026-08-29', '2026-08-29')).toBe(true);
    expect(boardShowsDay('2026-08-30', '2026-08-29')).toBe(true);
  });
});

describe('boardStartFor', () => {
  it('starts this Sunday, then jumps 14 days for the next board', () => {
    expect(boardStartFor('2026-08-29', 0)).toBe('2026-08-23');
    expect(boardStartFor('2026-08-29', 14)).toBe('2026-09-06');
  });
});

describe('visibleChips', () => {
  it('shows every chip and pins appointments first', () => {
    const blocks = [
      block({ id: 'a', kind: 'weighted' }),
      block({ id: 'b', kind: 'weighted' }),
      block({ id: 'c', kind: 'weighted' }),
      block({ id: 'd', kind: 'weighted' }),
      block({ id: 'e', kind: 'weighted' }),
      block({ id: 'f', kind: 'weighted' }),
      block({ id: 'meet', kind: 'appointment' }),
    ];
    const shown = visibleChips(blocks);
    expect(shown[0].id).toBe('meet');
    expect(shown.map((b) => b.id)).toEqual(['meet', 'a', 'b', 'c', 'd', 'e', 'f']);
  });
});
