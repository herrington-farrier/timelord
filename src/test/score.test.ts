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

describe('the level', () => {
  it('is never below one, whatever the total says', () => {
    // applyDelta already floors the total at zero, but the band is what the
    // screen reads from, so it holds the floor itself rather than trusting it.
    expect(scoreBand(0).level).toBe(1);
    expect(scoreBand(-50).level).toBe(1);
    expect(scoreBand(Number.NaN).level).toBe(1);
  });

  it('never shows negative progress into a level', () => {
    expect(scoreBand(-50).into).toBe(0);
    expect(scoreBand(-50).pct).toBe(0);
  });

  it('counts up from there in bands of a hundred', () => {
    expect(scoreBand(99).level).toBe(1);
    expect(scoreBand(100).level).toBe(2);
  });
});

describe('a Work item split around Break', () => {
  const half = (suffix: 'a' | 'b', status: PackedBlock['status']) =>
    block({ id: `2026-09-02:item-deep-${suffix}`, itemId: 'deep', bucketId: 'work', kind: 'work', status });

  it('scores both halves complete as one completion, not two', () => {
    const score = scoreDay([half('a', 'complete'), half('b', 'complete')], [], normal);
    expect(score).toMatchObject({ completed: 1, delta: 1 });
  });

  it('does not count the item complete while one half is still pending', () => {
    const score = scoreDay([half('a', 'complete'), half('b', 'pending')], [], normal);
    expect(score).toMatchObject({ completed: 0, skipped: 0, delta: 0 });
  });

  it('counts one skip when either half is skipped', () => {
    const score = scoreDay([half('a', 'complete'), half('b', 'skipped')], [], normal);
    expect(score).toMatchObject({ completed: 0, skipped: 1, delta: -1 });
  });
});

describe('dayHasAppointments with a cancelled appointment', () => {
  it('is false when the only appointment block is skipped', () => {
    expect(dayHasAppointments([block({ id: 'a', kind: 'appointment', status: 'skipped' })])).toBe(false);
  });
});

describe('split items and cancelled appointments, further cases', () => {
  const half = (suffix: 'a' | 'b', status: PackedBlock['status']) =>
    block({ id: `2026-09-02:drop-deep-${suffix}`, itemId: 'deep', bucketId: 'work', kind: 'work', status });

  it('counts a split item once when both halves are in dropped', () => {
    const score = scoreDay([], [half('a', 'complete'), half('b', 'complete')], normal);
    expect(score).toMatchObject({ completed: 1, delta: 2 });
  });

  it('does not penalise a skipped split half on an event day', () => {
    const score = scoreDay([], [half('a', 'skipped'), half('b', 'dropped')], { ...normal, isEventDay: true });
    expect(score).toMatchObject({ skipped: 0, delta: 0 });
  });

  it('does not penalise a skipped split half on a day with a live appointment', () => {
    const score = scoreDay([], [half('a', 'skipped'), half('b', 'dropped')], { ...normal, hasAppointments: true });
    expect(score).toMatchObject({ skipped: 0, delta: 0 });
  });

  it('does not forgive fallen work when the only appointment was skipped', () => {
    const blocks = [block({ id: 'appt', kind: 'appointment', status: 'skipped' })];
    const dropped = [block({ id: 'fell', status: 'skipped' })];
    const score = scoreDay(blocks, dropped, { ...normal, hasAppointments: dayHasAppointments(blocks) });
    expect(score.skipped).toBe(2);
  });
});
