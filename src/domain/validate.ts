import { WEEKDAYS, type BucketKind, type Cadence, type Weekday } from './types';
import { APPOINTMENTS_ID, EVENTS_ID, PERSONAL_ID, WORK_ID } from './types';

/**
 * Input validators shared by the callables. Pure: they throw
 * `ValidationError`, which `functions/src/http.ts` turns into an
 * `invalid-argument` HttpsError. Keeping them here lets src/test exercise the
 * refusals without Firebase.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const BUCKET_KINDS: BucketKind[] = ['personal', 'work', 'weighted', 'event', 'appointment'];
export const ITEM_TYPES = ['recurring', 'scheduled'] as const;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}

export function parseDateKey(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!isDateKey(text)) throw new ValidationError(`${label} must be a real date as YYYY-MM-DD.`);
  return text;
}

/** A document id. It becomes a path segment, so a slash would change the path. */
export function parseId(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new ValidationError(`${label} is required.`);
  if (text.includes('/')) throw new ValidationError(`${label} cannot contain a slash.`);
  if (text === '.' || text === '..' || /^__.*__$/.test(text)) throw new ValidationError(`${label} is not a valid id.`);
  if (text.length > 200) throw new ValidationError(`${label} is too long.`);
  return text;
}

export function parseEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`${label} must be one of ${allowed.join(', ')}.`);
  }
  return value as T;
}

export function parseWeekdays(value: unknown, label: string): Weekday[] {
  if (!Array.isArray(value)) throw new ValidationError(`${label} must be a list of days.`);
  for (const d of value) parseEnum(d, WEEKDAYS, label);
  return WEEKDAYS.filter((d) => value.includes(d));
}

/** Rebuilds the cadence from known fields only, so nothing else reaches storage. */
export function parseCadence(value: unknown): Cadence {
  if (value === undefined || value === null) return { kind: 'daily' };
  if (typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Repeat is not valid.');
  const c = value as Record<string, unknown>;
  const kind = parseEnum(c.kind, ['daily', 'weekdays', 'weekends', 'weekly', 'everyNDays', 'monthly'] as const, 'Repeat');
  switch (kind) {
    case 'daily':
    case 'weekdays':
    case 'weekends':
      return { kind };
    case 'weekly': {
      const days = parseWeekdays(c.days, 'Repeat days');
      if (!days.length) throw new ValidationError('Pick at least one day to repeat on.');
      return { kind, days };
    }
    case 'everyNDays': {
      const n = Number(c.n);
      if (!Number.isInteger(n) || n < 1 || n > 365) throw new ValidationError('Repeat every must be a whole number from 1 to 365.');
      const out: Cadence = { kind, n };
      if (c.startDate !== undefined && c.startDate !== '') out.startDate = parseDateKey(c.startDate, 'Repeat start date');
      if (c.startWeekday !== undefined && c.startWeekday !== '') out.startWeekday = parseEnum(c.startWeekday, WEEKDAYS, 'Repeat start day');
      return out;
    }
    case 'monthly': {
      const dayOfMonth = Number(c.dayOfMonth);
      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
        throw new ValidationError('Day of the month must be a whole number from 1 to 31.');
      }
      return { kind, dayOfMonth };
    }
  }
}

/** Days a request may rebuild: a whole number from 1 to `max`; missing means `max`. */
export function clampRangeDays(value: unknown, max: number): number {
  if (value === undefined || value === null || value === '') return max;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError('Days must be a number.');
  return Math.min(max, Math.max(1, Math.floor(n)));
}

const KIND_BY_ID: Record<string, BucketKind> = {
  [WORK_ID]: 'work',
  [EVENTS_ID]: 'event',
  [APPOINTMENTS_ID]: 'appointment',
  [PERSONAL_ID]: 'personal',
};

/**
 * Work, Events, Appointments and Personal each exist once, under a fixed id.
 * Those ids carry those kinds, and no other id may claim one of them.
 */
export function resolveBucketKind(id: string, kind: unknown): BucketKind {
  const parsed = parseEnum(kind ?? 'weighted', BUCKET_KINDS, 'Kind');
  const pinned = KIND_BY_ID[id];
  if (pinned) return pinned;
  if (parsed !== 'weighted') throw new ValidationError(`The ${parsed} bucket already exists and cannot be added again.`);
  return parsed;
}

/** Every bucket except Events needs at least one open day; none would close it for budget. */
export function parseBucketDays(value: unknown, kind: BucketKind, name: string): Weekday[] {
  const days = parseWeekdays(value ?? [], `${name} days`);
  if (!days.length && kind !== 'event') throw new ValidationError(`${name}: pick at least one day.`);
  return days;
}
