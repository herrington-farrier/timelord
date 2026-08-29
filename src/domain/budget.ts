import { weekdayFromKey } from './cadence';
import { formatDuration } from './duration';
import { EVENTS_ID, PERSONAL_ID, WORK_ID, type Bucket, type DaySettings, type HoursMode, type Slot, type Weekday } from './types';

export type DailyBudgetMap = Record<string, number>;

function minutes(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function weeklyCapacity(settings: DaySettings): number {
  return minutes(settings.dayMinutes) * 7;
}

export function personalWeekMinutes(settings: DaySettings): number {
  return (minutes(settings.morningMinutes) + minutes(settings.breakMinutes) + minutes(settings.eveningMinutes)) * 7;
}

export function assignableWeekMinutes(settings: DaySettings): number {
  return weeklyCapacity(settings);
}

export function assignedWeekMinutes(buckets: Bucket[]): number {
  return buckets
    .filter((b) => !b.archived && b.kind !== 'personal' && b.kind !== 'event' && b.id !== PERSONAL_ID && b.id !== EVENTS_ID)
    .reduce((sum, b) => sum + bucketAssignedMinutes(b), 0);
}

export function hoursModeOf(bucket: Bucket): HoursMode {
  return bucket.hoursMode === 'day' ? 'day' : 'week';
}

export function hoursMinutesOf(bucket: Bucket): number {
  if (bucket.hoursMinutes != null && Number.isFinite(Number(bucket.hoursMinutes))) {
    return minutes(bucket.hoursMinutes);
  }
  return minutes(bucket.weeklyMinutes);
}

export function derivedWeeklyMinutes(mode: HoursMode, hoursMinutes: number, days: Weekday[]): number {
  const hours = minutes(hoursMinutes);
  if (mode === 'day') return hours * days.filter(Boolean).length;
  return hours;
}

export function bucketAssignedMinutes(bucket: Bucket): number {
  return derivedWeeklyMinutes(hoursModeOf(bucket), hoursMinutesOf(bucket), activeDays(bucket));
}

export type WeekBudgetSummary = {
  capacityMinutes: number;
  personalMinutes: number;
  assignableMinutes: number;
  assignedMinutes: number;
  leftoverMinutes: number;
};

export function weekBudgetSummary(settings: DaySettings, assignedMinutes: number): WeekBudgetSummary {
  const capacityMinutes = weeklyCapacity(settings);
  const assignableMinutes = assignableWeekMinutes(settings);
  const assigned = minutes(assignedMinutes);
  return {
    capacityMinutes,
    personalMinutes: 0,
    assignableMinutes,
    assignedMinutes: assigned,
    leftoverMinutes: assignableMinutes - assigned,
  };
}

export function activeDays(bucket: Bucket): Weekday[] {
  return bucket.days.filter(Boolean);
}

/**
 * Stamp derived weeklyMinutes. Throws if user assignments exceed assignable time.
 * Leftover week minutes stay unassigned. The packer does not spend them on falling-off items.
 */
export function assignWeeklyBudgets(settings: DaySettings, buckets: Bucket[]): Bucket[] {
  const work = buckets.find((b) => !b.archived && (b.kind === 'work' || b.id === WORK_ID));
  if (!work) {
    throw new Error('Work bucket is required.');
  }
  const assignable = assignableWeekMinutes(settings);
  const userSum = assignedWeekMinutes(buckets);
  if (userSum > assignable) {
    throw new Error(
      `Bucket weekly hours (${formatDuration(userSum)}) exceed the ${formatDuration(assignable)} week.`
    );
  }
  return buckets.map((b) => ({ ...b, weeklyMinutes: bucketAssignedMinutes(b) }));
}

export function dailyBudgetFor(bucket: Bucket, dateKey: string): number {
  if (bucket.archived || bucket.kind === 'personal' || bucket.kind === 'event') return 0;
  const days = activeDays(bucket);
  if (!days.length) return 0;
  if (!days.includes(weekdayFromKey(dateKey))) return 0;
  if (hoursModeOf(bucket) === 'day') {
    const assigned = bucketAssignedMinutes(bucket);
    const extra = Math.max(0, minutes(bucket.weeklyMinutes) - assigned);
    return hoursMinutesOf(bucket) + Math.floor(extra / days.length);
  }
  return Math.floor(minutes(bucket.weeklyMinutes) / days.length);
}

export function formatHoursField(mode: HoursMode, hoursMinutes: number): string {
  const hours = formatDuration(hoursMinutes);
  return mode === 'day' ? `${hours}/day` : `${hours}/wk`;
}

export function formatBucketHours(bucket: Bucket): string {
  return formatHoursField(hoursModeOf(bucket), hoursMinutesOf(bucket));
}

export function collapsedSlotHours(slot: Slot, hours: string): string {
  return `${slot} · ${hours}`;
}

export function eventsRangeLabel(startDate?: string, endDate?: string): string {
  if (startDate && endDate) return `${startDate}–${endDate}`;
  return 'off';
}

export function dailyBudgets(buckets: Bucket[], dateKey: string): DailyBudgetMap {
  const out: DailyBudgetMap = {};
  for (const b of buckets) {
    out[b.id] = dailyBudgetFor(b, dateKey);
  }
  return out;
}
