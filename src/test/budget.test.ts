import { describe, expect, it } from 'vitest';

import { assignWeeklyBudgets, assignableWeekMinutes, assignedWeekMinutes, collapsedSlotHours, dailyBudgetFor, eventsRangeLabel, formatBucketHours, weekBudgetSummary, weeklyCapacity } from '../domain/budget';
import { PERSONAL_BUCKET, SEED_BUCKETS } from '../domain/seed';
import { bucket, settings, workBucket } from './fixtures';

describe('weekly budget', () => {
  it('sets weekly capacity to day hours times 7', () => {
    expect(weeklyCapacity(settings({ dayMinutes: 14 * 60 }))).toBe(14 * 60 * 7);
  });

  it('uses the full week as assignable time without subtracting Personal', () => {
    expect(assignableWeekMinutes(settings())).toBe(14 * 60 * 7);
  });

  it('does not dump leftover weekly minutes into Work', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 8 * 60 });
    const work = workBucket({ weeklyMinutes: 10 * 60 });
    const assigned = assignWeeklyBudgets(settings(), [work, house]);
    const workOut = assigned.find((b) => b.id === 'work');
    expect(workOut?.weeklyMinutes).toBe(10 * 60);
  });

  it('throws when assignments exceed assignable hours', () => {
    const work = workBucket({ weeklyMinutes: 100 * 60 });
    expect(() => assignWeeklyBudgets(settings(), [work])).toThrow(/exceed/);
  });

  it('does not treat numeric strings as concatenated weekly hours', () => {
    const work = workBucket({ weeklyMinutes: '600' as unknown as number });
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: '480' as unknown as number });
    expect(() => assignWeeklyBudgets(settings(), [work, house])).not.toThrow();
  });

  it('packs seed weekly hours under a 14h week', () => {
    expect(() => assignWeeklyBudgets(settings(), [PERSONAL_BUCKET, ...SEED_BUCKETS])).not.toThrow();
  });

  it('leaves leftover hours for Work when assigned is under the cap', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 8 * 60 });
    const work = workBucket({ weeklyMinutes: 10 * 60 });
    const summary = weekBudgetSummary(settings(), assignedWeekMinutes([work, house]));
    expect(summary.assignableMinutes).toBe(assignableWeekMinutes(settings()));
    expect(summary.assignedMinutes).toBe(18 * 60);
    expect(summary.leftoverMinutes).toBe(summary.assignableMinutes - 18 * 60);
  });

  it('reports a negative leftover when assigned hours exceed the cap', () => {
    const summary = weekBudgetSummary(settings(), 110 * 60);
    expect(summary.assignableMinutes).toBe(98 * 60);
    expect(summary.leftoverMinutes).toBe(-12 * 60);
  });

  it('gives a Mon/Wed/Fri bucket zero budget on Tuesday', () => {
    const house = bucket({
      id: 'house',
      name: 'House',
      weight: 4,
      days: ['Mon', 'Wed', 'Fri'],
      weeklyMinutes: 180,
    });
    expect(dailyBudgetFor(house, '2026-09-01')).toBe(0);
  });

  it('splits weekly minutes across assigned days', () => {
    const house = bucket({
      id: 'house',
      name: 'House',
      weight: 4,
      days: ['Mon', 'Wed', 'Fri'],
      weeklyMinutes: 180,
    });
    expect(dailyBudgetFor(house, '2026-08-31')).toBe(60);
  });

  it('uses hoursMinutes each assigned day in day mode', () => {
    const house = bucket({
      id: 'house',
      name: 'House',
      weight: 4,
      days: ['Mon', 'Wed', 'Fri'],
      hoursMode: 'day',
      hoursMinutes: 90,
      weeklyMinutes: 270,
    });
    expect(dailyBudgetFor(house, '2026-08-31')).toBe(90);
    expect(dailyBudgetFor(house, '2026-09-01')).toBe(0);
  });

  it('counts day-mode assigned week as hours times checked days', () => {
    const house = bucket({
      id: 'house',
      name: 'House',
      weight: 4,
      days: ['Mon', 'Wed', 'Fri'],
      hoursMode: 'day',
      hoursMinutes: 90,
    });
    expect(assignedWeekMinutes([workBucket({ weeklyMinutes: 0, hoursMinutes: 0 }), house])).toBe(270);
  });

  it('treats a missing hoursMode as weekly hours', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 120 });
    expect(assignedWeekMinutes([workBucket({ weeklyMinutes: 0, hoursMinutes: 0 }), house])).toBe(120);
    expect(dailyBudgetFor(house, '2026-08-31')).toBe(Math.floor(120 / 7));
  });

  it('labels collapsed hours from the field you set', () => {
    expect(formatBucketHours(bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 8 * 60 }))).toBe('8h/wk');
    expect(
      formatBucketHours(
        bucket({
          id: 'house',
          name: 'House',
          weight: 4,
          hoursMode: 'day',
          hoursMinutes: 2 * 60,
        })
      )
    ).toBe('2h/day');
  });

  it('puts slot next to hours on collapsed Work and weighted rows', () => {
    expect(collapsedSlotHours('morning', '8h/wk')).toBe('morning · 8h/wk');
  });

  it('labels an Events range or off', () => {
    expect(eventsRangeLabel('2026-08-29', '2026-09-02')).toBe('2026-08-29–2026-09-02');
    expect(eventsRangeLabel('', '')).toBe('off');
  });
});
