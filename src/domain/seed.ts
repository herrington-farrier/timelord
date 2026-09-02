import {
  DEFAULT_SETTINGS,
  EVENTS_ID,
  PERSONAL_ID,
  WEEKDAYS,
  WORK_ID,
  type Bucket,
  type DaySettings,
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

export const SEED_BUCKETS: Bucket[] = [
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

export const SEED_ITEMS: ListItem[] = [
  {
    id: 'priority-work',
    bucketId: WORK_ID,
    title: 'Priority work',
    type: 'recurring',
    weight: 1,
    durationMinutes: 60,
    cadence: { kind: 'weekdays' },
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
];

export function defaultSettings(): DaySettings {
  return { ...DEFAULT_SETTINGS };
}

export function canDeleteBucket(bucket: Bucket): boolean {
  return bucket.kind === 'weighted' && bucket.id !== WORK_ID && bucket.id !== PERSONAL_ID && bucket.id !== EVENTS_ID;
}

export function canRenameBucket(bucket: Bucket): boolean {
  return bucket.kind !== 'personal';
}

export function splitEditBuckets(buckets: Bucket[]): {
  personal: Bucket;
  work: Bucket;
  events: Bucket;
  weighted: Bucket[];
} {
  const live = buckets.filter((b) => !b.archived);
  const personal = live.find((b) => b.kind === 'personal' || b.id === PERSONAL_ID) ?? PERSONAL_BUCKET;
  const work = live.find((b) => b.kind === 'work' || b.id === WORK_ID) ?? WORK_BUCKET;
  const events = live.find((b) => b.kind === 'event' || b.id === EVENTS_ID) ?? EVENTS_BUCKET;
  const weighted = live
    .filter((b) => b.kind === 'weighted' && b.id !== WORK_ID && b.id !== PERSONAL_ID && b.id !== EVENTS_ID)
    .sort((a, b) => a.weight - b.weight);
  return { personal, work, events, weighted };
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
  return [PERSONAL_BUCKET, WORK_BUCKET, EVENTS_BUCKET].filter((b) => !have.has(b.id));
}
