import { describe, expect, it } from 'vitest';

import { assignWeeklyBudgets, assignableWeekMinutes, dailyBudgetFor, weeklyCapacity } from '../domain/budget';
import { bucket, settings, workBucket } from './fixtures';

describe('weekly budget', () => {
  it('sets weekly capacity to day hours times 7', () => {
    expect(weeklyCapacity(settings({ dayMinutes: 14 * 60 }))).toBe(14 * 60 * 7);
  });

  it('reserves Personal 1h + 30m + 2h before weighted assignment', () => {
    const personal = (60 + 30 + 120) * 7;
    expect(assignableWeekMinutes(settings())).toBe(14 * 60 * 7 - personal);
  });

  it('sends leftover weekly minutes to Work', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4, weeklyMinutes: 8 * 60 });
    const work = workBucket({ weeklyMinutes: 10 * 60 });
    const assigned = assignWeeklyBudgets(settings(), [work, house]);
    const workOut = assigned.find((b) => b.id === 'work');
    const leftover = assignableWeekMinutes(settings()) - 10 * 60 - 8 * 60;
    expect(workOut?.weeklyMinutes).toBe(10 * 60 + leftover);
  });

  it('throws when assignments exceed assignable hours', () => {
    const work = workBucket({ weeklyMinutes: 80 * 60 });
    expect(() => assignWeeklyBudgets(settings(), [work])).toThrow(/exceed/);
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
});
