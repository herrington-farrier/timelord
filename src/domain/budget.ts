import { daysBetween, weekdayFromKey } from './cadence';
import { formatDuration } from './duration';
import { APPOINTMENTS_ID, EVENTS_ID, PERSONAL_ID, WORK_ID, type Bucket, type DaySettings, type HoursMode, type Slot, type Weekday } from './types';

export type DailyBudgetMap = Record<string, number>;

function minutes(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function weeklyCapacity(settings: DaySettings): number {
  return minutes(settings.dayMinutes) * 7;
}

export function personalDayMinutes(settings: DaySettings): number {
  return minutes(settings.morningMinutes) + minutes(settings.breakMinutes) + minutes(settings.eveningMinutes);
}

export function personalWeekMinutes(settings: DaySettings): number {
  return personalDayMinutes(settings) * 7;
}

/** True when Personal time is counted inside the day rather than beside it. */
export function personalCountsAsDay(settings: DaySettings): boolean {
  return settings.personalCountsAsDay === true;
}

/**
 * Time the buckets may be given. Personal is normally beside the day and costs
 * nothing; when it counts as day time, it comes off the top first.
 */
export function assignableWeekMinutes(settings: DaySettings): number {
  const capacity = weeklyCapacity(settings);
  return personalCountsAsDay(settings) ? Math.max(0, capacity - personalWeekMinutes(settings)) : capacity;
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
    personalMinutes: personalCountsAsDay(settings) ? personalWeekMinutes(settings) : 0,
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

export function assignedDayBudget(bucket: Bucket): number {
  if (bucket.archived || bucket.kind === 'personal' || bucket.kind === 'event') return 0;
  const days = activeDays(bucket);
  if (!days.length) return 0;
  if (hoursModeOf(bucket) === 'day') {
    const assigned = bucketAssignedMinutes(bucket);
    const extra = Math.max(0, minutes(bucket.weeklyMinutes) - assigned);
    return hoursMinutesOf(bucket) + Math.floor(extra / days.length);
  }
  return Math.floor(minutes(bucket.weeklyMinutes) / days.length);
}

export function dailyBudgetFor(bucket: Bucket, dateKey: string): number {
  if (!activeDays(bucket).includes(weekdayFromKey(dateKey))) return 0;
  return assignedDayBudget(bucket);
}

export function itemFitsBucket(durationMinutes: number, bucket: Bucket | undefined): boolean {
  if (durationMinutes === 0) return true;
  if (!bucket || bucket.kind === 'event' || bucket.id === EVENTS_ID) return true;
  // Appointments are fixed commitments in a bucket with no hours, so there is
  // no daily budget to measure them against.
  if (bucket.kind === 'appointment' || bucket.id === APPOINTMENTS_ID) return true;
  return durationMinutes <= assignedDayBudget(bucket);
}

export function itemExceedsBucketMessage(bucket: Bucket): string {
  return `Duration cannot exceed the ${bucket.name} daily hours (${formatDuration(assignedDayBudget(bucket))}).`;
}

export function formatHoursField(mode: HoursMode, hoursMinutes: number): string {
  const hours = formatDuration(hoursMinutes);
  return mode === 'day' ? `${hours}/day` : `${hours}/wk`;
}

export function formatBucketHours(bucket: Bucket): string {
  return formatHoursField(hoursModeOf(bucket), hoursMinutesOf(bucket));
}

export function collapsedSlotHours(slot: Slot | Slot[], hours: string): string {
  // A dot, not a plus: these are the sections a bucket runs in, not a sum of
  // them, and the arithmetic sign read as though it meant something.
  const label = Array.isArray(slot) ? slot.join(' · ') : slot;
  return `${label} · ${hours}`;
}

/**
 * The collapsed Events row. Spelling out every range ran off the side of the
 * card, and the dates are already in the form below, so summarise instead.
 */
export function eventsSummaryLabel(ranges: { startDate?: string; endDate?: string }[]): string {
  const live = ranges.filter(
    (r): r is { startDate: string; endDate: string } =>
      Boolean(r.startDate && r.endDate && r.endDate >= r.startDate)
  );
  if (!live.length) return 'off';
  const days = live.reduce((sum, r) => sum + daysBetween(r.startDate, r.endDate) + 1, 0);
  return `${live.length} ${live.length === 1 ? 'range' : 'ranges'} · ${days}d`;
}

export function dailyBudgets(buckets: Bucket[], dateKey: string): DailyBudgetMap {
  const out: DailyBudgetMap = {};
  for (const b of buckets) {
    out[b.id] = dailyBudgetFor(b, dateKey);
  }
  return out;
}

/** Colour band for packed-vs-capacity: green under half, gold to 85%, red over. */
export function loadTone(scheduled: number, dayMinutes: number): 'ok' | 'mid' | 'hot' {
  if (dayMinutes <= 0) return 'mid';
  const part = scheduled / dayMinutes;
  if (part < 0.5) return 'ok';
  if (part <= 0.85) return 'mid';
  return 'hot';
}

/** Same bands, read from time still free rather than time used. */
export function freeTone(free: number, cap: number): 'ok' | 'mid' | 'hot' {
  return loadTone(Math.max(0, cap - Math.max(0, free)), cap);
}
