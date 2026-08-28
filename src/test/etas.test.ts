import { describe, expect, it } from 'vitest';

import { recomputeEtas } from '../domain/etas';
import type { PackedBlock } from '../domain/types';

function block(partial: Partial<PackedBlock> & Pick<PackedBlock, 'id' | 'title' | 'startMinutes' | 'durationMinutes'>): PackedBlock {
  const duration = partial.durationMinutes;
  return {
    date: '2026-08-31',
    bucketId: 'house',
    kind: 'weighted',
    status: 'pending',
    color: '94a3b8',
    flexible: true,
    endMinutes: partial.startMinutes + duration,
    ...partial,
    durationMinutes: duration,
  };
}

describe('recomputeEtas', () => {
  it('starts the first pending flexible block at now', () => {
    const packed = [
      block({ id: 'a', title: 'Dishes', startMinutes: 8 * 60, durationMinutes: 20 }),
    ];
    const [next] = recomputeEtas(packed, 9 * 60 + 12, 10);
    expect(next.startMinutes).toBe(9 * 60 + 12);
  });

  it('pulls later flexible ETAs forward after an early complete', () => {
    const packed = [
      block({
        id: 'a',
        title: 'Dishes',
        startMinutes: 8 * 60,
        durationMinutes: 20,
        status: 'complete',
        endMinutes: 8 * 60 + 12,
        flexible: false,
      }),
      block({ id: 'b', title: 'Counters', startMinutes: 8 * 60 + 20, durationMinutes: 15, bucketId: 'house' }),
    ];
    const updated = recomputeEtas(packed, 8 * 60 + 12, 10);
    const counters = updated.find((b) => b.id === 'b');
    expect(counters?.startMinutes).toBe(8 * 60 + 12);
  });

  it('does not move an appointment when earlier work finishes early', () => {
    const packed = [
      block({
        id: 'a',
        title: 'Dishes',
        startMinutes: 8 * 60,
        durationMinutes: 20,
        status: 'complete',
        endMinutes: 8 * 60 + 12,
        flexible: false,
      }),
      block({
        id: 'appt',
        title: 'Dentist',
        startMinutes: 10 * 60,
        durationMinutes: 60,
        kind: 'appointment',
        bucketId: 'appointment',
        appointmentId: 'dentist',
        flexible: false,
        color: 'f87171',
      }),
    ];
    const updated = recomputeEtas(packed, 8 * 60 + 12, 10);
    expect(updated.find((b) => b.id === 'appt')?.startMinutes).toBe(10 * 60);
  });
});
