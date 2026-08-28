import { weekdayFromKey } from './cadence';
import { PERSONAL_ID, type Bucket, type DaySettings, type Weekday } from './types';

export type DailyBudgetMap = Record<string, number>;

export function weeklyCapacity(settings: DaySettings): number {
  return settings.dayMinutes * 7;
}

export function personalWeekMinutes(settings: DaySettings): number {
  return (settings.morningMinutes + settings.breakMinutes + settings.eveningMinutes) * 7;
}

export function assignableWeekMinutes(settings: DaySettings): number {
  return weeklyCapacity(settings) - personalWeekMinutes(settings);
}

export function activeDays(bucket: Bucket): Weekday[] {
  return bucket.days.filter(Boolean);
}

/**
 * Apply leftover assignable minutes to Work. Throws if user assignments
 * exceed assignable time. Work's returned weeklyMinutes includes remainder.
 */
export function assignWeeklyBudgets(settings: DaySettings, buckets: Bucket[]): Bucket[] {
  const work = buckets.find((b) => b.kind === 'work' && !b.archived);
  if (!work) {
    throw new Error('Work bucket is required.');
  }
  const assignable = assignableWeekMinutes(settings);
  const userSum = buckets
    .filter((b) => !b.archived && b.kind !== 'personal' && b.id !== PERSONAL_ID)
    .reduce((sum, b) => sum + b.weeklyMinutes, 0);
  if (userSum > assignable) {
    throw new Error('Bucket weekly hours exceed the hours left after Personal.');
  }
  const remainder = assignable - userSum;
  return buckets.map((b) => {
    if (b.id === work.id) {
      return { ...b, weeklyMinutes: b.weeklyMinutes + remainder };
    }
    return { ...b };
  });
}

export function dailyBudgetFor(bucket: Bucket, dateKey: string): number {
  if (bucket.archived || bucket.kind === 'personal') return 0;
  const days = activeDays(bucket);
  if (!days.length) return 0;
  if (!days.includes(weekdayFromKey(dateKey))) return 0;
  return Math.floor(bucket.weeklyMinutes / days.length);
}

export function dailyBudgets(buckets: Bucket[], dateKey: string): DailyBudgetMap {
  const out: DailyBudgetMap = {};
  for (const b of buckets) {
    out[b.id] = dailyBudgetFor(b, dateKey);
  }
  return out;
}
