import { describe, expect, it } from 'vitest';

import { leftoverSectionBlocks, markLeftoversSkipped, skipLogBlocks } from '../domain/skip';
import type { PackedBlock } from '../domain/types';

function block(partial: Partial<PackedBlock> & Pick<PackedBlock, 'id' | 'kind'>): PackedBlock {
  return {
    date: '2026-08-30',
    bucketId: 'house',
    title: partial.title || partial.id,
    startMinutes: 0,
    endMinutes: 30,
    durationMinutes: 30,
    status: 'pending',
    color: 'fff',
    flexible: true,
    itemId: partial.itemId ?? partial.id,
    ...partial,
  };
}

describe('startNext auto-skip', () => {
  it('treats leftover placed and falling-off items as skipped, once per item', () => {
    const leftovers = leftoverSectionBlocks(
      [
        block({ id: 'floors-a', itemId: 'floors', kind: 'weighted', title: 'Floors', slot: 'morning' }),
        block({ id: 'floors-b', itemId: 'floors', kind: 'weighted', title: 'Floors', slot: 'morning' }),
        block({ id: 'done', itemId: 'done', kind: 'weighted', title: 'Done', slot: 'morning', status: 'complete' }),
        block({ id: 'later', itemId: 'later', kind: 'work', title: 'Standup', slot: 'midday' }),
        block({ id: 'break', kind: 'personal', title: 'Break', slot: 'morning', itemId: undefined }),
        block({ id: 'appt', kind: 'appointment', title: 'Dentist', appointmentId: 'a1', itemId: undefined }),
      ],
      [
        block({ id: 'drop-m', itemId: 'windows', kind: 'weighted', title: 'Windows', slot: 'morning', status: 'dropped' }),
        block({ id: 'drop-open', itemId: 'errand', kind: 'weighted', title: 'Errand', status: 'dropped' }),
        block({ id: 'drop-eve', itemId: 'dinner', kind: 'weighted', title: 'Dinner', slot: 'evening', status: 'dropped' }),
      ],
      'morning'
    );
    expect(leftovers.map((b) => b.id)).toEqual(['floors-a', 'floors-b', 'drop-m', 'drop-open']);
    expect(skipLogBlocks(leftovers).map((b) => b.title)).toEqual(['Floors', 'Windows', 'Errand']);
    expect(markLeftoversSkipped(leftovers, leftovers).every((b) => b.status === 'skipped')).toBe(true);
  });
});
