import { describe, expect, it } from 'vitest';

import { isRoutineBlock, orderSectionItems, todaySectionItems } from '../domain/today';
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

describe('a Personal routine', () => {
  it('is not the Break control', () => {
    expect(isRoutineBlock(block({ id: 'm', kind: 'personal', title: 'Morning Routine' }))).toBe(true);
    expect(isRoutineBlock(block({ id: 'b', kind: 'personal', title: 'Break' }))).toBe(false);
  });

  it('is not an ordinary item', () => {
    expect(isRoutineBlock(block({ id: 't', kind: 'weighted', title: 'Tidy up' }))).toBe(false);
  });
});

describe('reading order in a section', () => {
  it('puts routines under appointments and above the rest', () => {
    const ordered = orderSectionItems([
      block({ id: 'tidy', kind: 'weighted' }),
      block({ id: 'morning', kind: 'personal', title: 'Morning Routine' }),
      block({ id: 'dentist', kind: 'appointment' }),
    ]);
    expect(ordered.map((b) => b.id)).toEqual(['dentist', 'morning', 'tidy']);
  });

  it('keeps the packer order inside each group', () => {
    const ordered = orderSectionItems([
      block({ id: 'first', kind: 'weighted' }),
      block({ id: 'second', kind: 'weighted' }),
      block({ id: 'appt', kind: 'appointment' }),
    ]);
    expect(ordered.map((b) => b.id)).toEqual(['appt', 'first', 'second']);
  });
});

describe('what a section shows', () => {
  it('keeps a routine that carries minutes', () => {
    const shown = todaySectionItems(
      [block({ id: 'morning', kind: 'personal', title: 'Morning Routine', slot: 'morning', durationMinutes: 45 })],
      'morning'
    );
    expect(shown.map((b) => b.id)).toEqual(['morning']);
  });

  it('drops one that carries none, since it costs the day nothing', () => {
    const shown = todaySectionItems(
      [block({ id: 'morning', kind: 'personal', title: 'Morning Routine', slot: 'morning', durationMinutes: 0 })],
      'morning'
    );
    expect(shown).toHaveLength(0);
  });
});
