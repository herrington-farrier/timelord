import { describe, expect, it } from 'vitest';

import { applyDelta, dayHasAppointments, scoreBand, scoreDay } from '../domain/score';
import type { PackedBlock } from '../domain/types';

const block = (over: Partial<PackedBlock> & { id: string }): PackedBlock =>
  ({
    itemId: over.id,
    date: '2026-09-02',
    bucketId: 'house',
    title: over.id,
    kind: 'weighted',
    startMinutes: 0,
    endMinutes: 30,
    durationMinutes: 30,
    status: 'pending',
    color: 'fff',
    flexible: true,
    ...over,
  }) as PackedBlock;

const normal = { started: true, isEventDay: false, hasAppointments: false };

describe('scoreDay', () => {
  it('counts items, not minutes', () => {
    const score = scoreDay(
      [
        block({ id: 'quick', status: 'complete', durationMinutes: 15 }),
        block({ id: 'long', status: 'complete', durationMinutes: 180 }),
      ],
      [],
      normal
    );
    expect(score).toEqual({ completed: 2, skipped: 0, delta: 2 });
  });

  it('takes a point off for each skip', () => {
    const score = scoreDay(
      [block({ id: 'a', status: 'complete' }), block({ id: 'b', status: 'skipped' })],
      [block({ id: 'c', status: 'skipped' })],
      normal
    );
    expect(score).toEqual({ completed: 1, skipped: 2, delta: -1 });
  });

  it('scores nothing for a day never started', () => {
    const score = scoreDay([block({ id: 'a', status: 'complete' })], [], { ...normal, started: false });
    expect(score).toEqual({ completed: 0, skipped: 0, delta: 0 });
  });

  it('forgives what fell off a day with appointments', () => {
    const blocks = [block({ id: 'a', status: 'complete' })];
    const fell = [block({ id: 'b', status: 'skipped' })];
    expect(scoreDay(blocks, fell, normal).delta).toBe(0);
    expect(scoreDay(blocks, fell, { ...normal, hasAppointments: true }).delta).toBe(1);
    expect(scoreDay(blocks, fell, { ...normal, isEventDay: true }).delta).toBe(1);
  });

  it('still counts a skip you chose, even on a constrained day', () => {
    const score = scoreDay(
      [block({ id: 'a', status: 'skipped' })],
      [],
      { ...normal, hasAppointments: true }
    );
    expect(score.delta).toBe(-1);
  });

  it('pays a bonus for finishing what had already fallen off', () => {
    // the day had no room for it and you did it anyway
    const score = scoreDay([], [block({ id: 'extra', status: 'complete' })], normal);
    expect(score).toEqual({ completed: 1, skipped: 0, delta: 2 });
  });

  it('gives an overbooked day a way back up, not only down', () => {
    const score = scoreDay(
      [block({ id: 'a', status: 'complete' })],
      [block({ id: 'b', status: 'complete' }), block({ id: 'c', status: 'skipped' })],
      normal
    );
    // 1 in plan, 2 for the fallen one it finished, 1 off for the skip
    expect(score.delta).toBe(2);
  });

  it('ignores blocks that are not items', () => {
    const score = scoreDay(
      [
        { ...block({ id: 'routine', status: 'complete' }), itemId: undefined, kind: 'personal' } as PackedBlock,
        block({ id: 'real', status: 'complete' }),
      ],
      [],
      normal
    );
    expect(score.completed).toBe(1);
  });
});

describe('the running total', () => {
  it('goes up and down but never below zero', () => {
    expect(applyDelta(10, 5)).toBe(15);
    expect(applyDelta(10, -4)).toBe(6);
    expect(applyDelta(2, -9)).toBe(0);
  });

  it('fills a band of a hundred and starts again', () => {
    expect(scoreBand(0)).toEqual({ level: 1, into: 0, pct: 0 });
    expect(scoreBand(45)).toEqual({ level: 1, into: 45, pct: 45 });
    expect(scoreBand(100)).toEqual({ level: 2, into: 0, pct: 0 });
    expect(scoreBand(247)).toEqual({ level: 3, into: 47, pct: 47 });
  });
});

describe('dayHasAppointments', () => {
  it('is true when anything on the day was an appointment', () => {
    expect(dayHasAppointments([block({ id: 'a' })])).toBe(false);
    expect(dayHasAppointments([block({ id: 'a', kind: 'appointment' })])).toBe(true);
  });
});
