import { describe, expect, it } from 'vitest';

import { loadTone, scheduledMinutes, visibleChips } from '../pages/Calendar';
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
  it('tallies personal blocks and transitions', () => {
    const minutes = scheduledMinutes([
      block({ id: 'morning', kind: 'personal', durationMinutes: 60 }),
      block({ id: 'trans', kind: 'transition', durationMinutes: 10 }),
      block({ id: 'work', kind: 'work', durationMinutes: 120 }),
      block({ id: 'drop', kind: 'weighted', durationMinutes: 45, status: 'dropped' }),
    ]);
    expect(minutes).toBe(190);
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

describe('visibleChips', () => {
  it('keeps appointments when the cell is full', () => {
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
    expect(shown.some((b) => b.id === 'meet')).toBe(true);
    expect(shown).toHaveLength(6);
  });
});
