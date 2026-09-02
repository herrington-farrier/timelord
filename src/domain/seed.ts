import { addDaysKey } from '../shared/dates';
import {
  APPOINTMENTS_ID,
  DEFAULT_SETTINGS,
  EVENTS_ID,
  PERSONAL_ID,
  WEEKDAYS,
  WORK_ID,
  type Bucket,
  type DaySettings,
  type EventRange,
  type ListItem,
  type Weekday,
} from './types';

export const PERSONAL_BUCKET: Bucket = {
  id: PERSONAL_ID,
  kind: 'personal',
  name: 'Personal',
  weight: 0,
  weeklyMinutes: 0,
  hoursMode: 'week',
  hoursMinutes: 0,
  days: [...WEEKDAYS],
  slot: 'morning',
  color: '5b9bd5',
};

export const WORK_BUCKET: Bucket = {
  id: WORK_ID,
  kind: 'work',
  name: 'Work',
  weight: 1,
  weeklyMinutes: 20 * 60,
  hoursMode: 'week',
  hoursMinutes: 20 * 60,
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  slot: 'midday',
  slots: ['midday'],
  color: 'f0c14a',
};

export const EVENTS_BUCKET: Bucket = {
  id: EVENTS_ID,
  kind: 'event',
  name: 'Events',
  weight: 0,
  weeklyMinutes: 0,
  hoursMode: 'week',
  hoursMinutes: 0,
  days: [...WEEKDAYS],
  slot: 'morning',
  color: 'c4923a',
  startDate: '',
  endDate: '',
  ranges: [],
};

/**
 * A container, not a scheduled bucket: no hours, no days, no slot settings of
 * its own. Its items are scheduled to a date and packed ahead of every other
 * bucket in their section.
 */
export const APPOINTMENTS_BUCKET: Bucket = {
  id: APPOINTMENTS_ID,
  kind: 'appointment',
  name: 'Appointments',
  weight: 0,
  weeklyMinutes: 0,
  hoursMode: 'week',
  hoursMinutes: 0,
  days: [...WEEKDAYS],
  slot: 'morning',
  // spans every section; each appointment picks one via its own `slot`
  slots: ['morning', 'midday', 'evening'],
  color: 'e85d4c',
};

export const SEED_BUCKETS: Bucket[] = [
  APPOINTMENTS_BUCKET,
  WORK_BUCKET,
  EVENTS_BUCKET,
  {
    id: 'home',
    kind: 'weighted',
    name: 'Home',
    weight: 2,
    weeklyMinutes: 5 * 60,
    hoursMode: 'week',
    hoursMinutes: 5 * 60,
    days: [...WEEKDAYS],
    slot: 'morning',
    color: '94a3b8',
  },
  {
    id: 'errands',
    kind: 'weighted',
    name: 'Errands',
    weight: 3,
    weeklyMinutes: 3 * 60,
    hoursMode: 'week',
    hoursMinutes: 3 * 60,
    days: [...WEEKDAYS],
    slot: 'evening',
    color: '67a1c4',
  },
];

/**
 * A new account should demonstrate every mechanic on day one: a timed item, a
 * 0-duration reminder, a weekly cadence, a dated appointment and an event with
 * something in it. Dates are relative to the day the account is created, so the
 * examples are live rather than stale.
 */
export function seedItems(today: string): ListItem[] {
  const eventStart = addDaysKey(today, 14);
  return [
    {
      id: 'example-appointment',
      bucketId: APPOINTMENTS_ID,
      title: 'Example appointment',
      type: 'scheduled',
      weight: 1,
      durationMinutes: 60,
      cadence: { kind: 'daily' },
      dueAt: today,
      slot: 'midday',
      apptTime: '14:30',
    },
    {
      id: 'priority-work',
      bucketId: WORK_ID,
      title: 'Priority work',
      type: 'recurring',
      weight: 1,
      durationMinutes: 60,
      cadence: { kind: 'weekdays' },
      slot: 'midday',
    },
    {
      id: 'weekly-review',
      bucketId: WORK_ID,
      title: 'Weekly review',
      type: 'recurring',
      weight: 2,
      durationMinutes: 30,
      cadence: { kind: 'weekly', days: ['Fri'] },
      slot: 'midday',
    },
    {
      id: 'tidy',
      bucketId: 'home',
      title: 'Tidy up',
      type: 'recurring',
      weight: 1,
      durationMinutes: 15,
      cadence: { kind: 'daily' },
    },
    {
      id: 'reminder-example',
      bucketId: 'home',
      title: 'Reminder with no duration',
      type: 'recurring',
      weight: 2,
      durationMinutes: 0,
      cadence: { kind: 'daily' },
    },
    {
      id: 'groceries',
      bucketId: 'errands',
      title: 'Groceries',
      type: 'recurring',
      weight: 1,
      durationMinutes: 45,
      cadence: { kind: 'weekly', days: ['Sat'] },
    },
    {
      id: 'example-event-item',
      bucketId: EVENTS_ID,
      title: 'Something during the event',
      type: 'scheduled',
      weight: 1,
      durationMinutes: 90,
      cadence: { kind: 'daily' },
      dueAt: eventStart,
    },
  ];
}

/** A short event a fortnight out, so an event day is visible on the board. */
export function seedEventRanges(today: string): EventRange[] {
  return [{ id: 'example-event', startDate: addDaysKey(today, 14), endDate: addDaysKey(today, 15) }];
}

export function defaultSettings(): DaySettings {
  return { ...DEFAULT_SETTINGS };
}

export function isAppointmentBucket(bucket: { kind?: string; id?: string } | undefined): boolean {
  return Boolean(bucket && (bucket.kind === 'appointment' || bucket.id === APPOINTMENTS_ID));
}

export function canDeleteBucket(bucket: Bucket): boolean {
  return (
    bucket.kind === 'weighted' &&
    bucket.id !== WORK_ID &&
    bucket.id !== PERSONAL_ID &&
    bucket.id !== EVENTS_ID &&
    bucket.id !== APPOINTMENTS_ID
  );
}

export function canRenameBucket(bucket: Bucket): boolean {
  return bucket.kind !== 'personal' && !isAppointmentBucket(bucket);
}

export function splitEditBuckets(buckets: Bucket[]): {
  personal: Bucket;
  appointments: Bucket;
  work: Bucket;
  events: Bucket;
  weighted: Bucket[];
} {
  const live = buckets.filter((b) => !b.archived);
  const personal = live.find((b) => b.kind === 'personal' || b.id === PERSONAL_ID) ?? PERSONAL_BUCKET;
  const work = live.find((b) => b.kind === 'work' || b.id === WORK_ID) ?? WORK_BUCKET;
  const events = live.find((b) => b.kind === 'event' || b.id === EVENTS_ID) ?? EVENTS_BUCKET;
  const appointments = live.find((b) => isAppointmentBucket(b)) ?? APPOINTMENTS_BUCKET;
  const weighted = live
    .filter(
      (b) =>
        b.kind === 'weighted' &&
        b.id !== WORK_ID &&
        b.id !== PERSONAL_ID &&
        b.id !== EVENTS_ID &&
        b.id !== APPOINTMENTS_ID
    )
    .sort((a, b) => a.weight - b.weight);
  return { personal, appointments, work, events, weighted };
}

export function listableBuckets(buckets: Bucket[]): Bucket[] {
  return buckets.filter((b) => !b.archived && b.kind !== 'personal' && b.id !== PERSONAL_ID);
}

export function listCadenceDays(bucket: Bucket | undefined): Weekday[] {
  if (!bucket?.days.length) return [];
  return WEEKDAYS.filter((d) => bucket.days.includes(d));
}

export function bucketsToBackfill(existing: Bucket[]): Bucket[] {
  const active = existing.filter((b) => !b.archived);
  const have = new Set(active.map((b) => b.id));
  if (active.length === 0) {
    return [PERSONAL_BUCKET, ...SEED_BUCKETS];
  }
  return [PERSONAL_BUCKET, WORK_BUCKET, EVENTS_BUCKET, APPOINTMENTS_BUCKET].filter((b) => !have.has(b.id));
}
