import { describe, expect, it } from 'vitest';

import { boardStartFor, fallingChips, listChips, listKeysFrom, loadTone, orderChips, placedChips, scheduledMinutes, visibleChips } from '../pages/Calendar';
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

describe('loadTone', () => {
  it('is green under 50%, yellow through 85%, red above', () => {
    expect(loadTone(4 * 60, 14 * 60)).toBe('ok');
    expect(loadTone(7 * 60, 14 * 60)).toBe('mid');
    expect(loadTone(12 * 60, 14 * 60)).toBe('hot');
  });
});

describe('weekStart', () => {
  it('aligns Saturday to the Sunday of that week', () => {
    expect(weekStart('2026-08-29')).toBe('2026-08-23');
    expect(weekStart('2026-08-23')).toBe('2026-08-23');
  });
});

describe('placedChips', () => {
  it('hides personal and transitions on the board', () => {
    const shown = placedChips([
      block({ id: 'morning', kind: 'personal' }),
      block({ id: 'trans', kind: 'transition' }),
      block({ id: 'house', kind: 'weighted' }),
      block({ id: 'meet', kind: 'appointment' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['house', 'meet']);
  });
});

describe('listChips', () => {
  it('lists event-day items without section grouping', () => {
    const shown = listChips([
      block({ id: 'morning', kind: 'personal', title: 'Morning Routine', slot: 'morning' }),
      block({ id: 'trip', kind: 'weighted', title: 'Travel', durationMinutes: 0 }),
      block({ id: 'evening', kind: 'personal', title: 'Evening Routine', slot: 'evening' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['trip']);
  });

  it('orders the list by section, not clock', () => {
    const shown = listChips([
      block({ id: 'evening', kind: 'personal', slot: 'evening', title: 'Evening Routine' }),
      block({ id: 'house', kind: 'weighted', slot: 'morning', title: 'Floors' }),
      block({ id: 'break', kind: 'personal', slot: 'midday', title: 'Break' }),
      block({ id: 'morning', kind: 'personal', slot: 'morning', title: 'Morning Routine' }),
      block({ id: 'trans', kind: 'transition' }),
    ]);
    expect(shown.map((b) => b.id)).toEqual(['morning', 'house', 'break', 'evening']);
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

describe('listKeysFrom', () => {
  it('starts at today and stays on the board', () => {
    expect(listKeysFrom(['2026-08-23', '2026-08-24', '2026-08-29', '2026-09-12'], '2026-08-29')).toEqual([
      '2026-08-29',
      '2026-09-12',
    ]);
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
