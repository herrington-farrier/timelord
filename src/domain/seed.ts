import {
  DEFAULT_SETTINGS,
  PERSONAL_ID,
  WEEKDAYS,
  WORK_ID,
  type Bucket,
  type DaySettings,
  type ListItem,
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
  weeklyMinutes: 18 * 60,
  hoursMode: 'week',
  hoursMinutes: 18 * 60,
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  slot: 'midday',
  color: 'f0c14a',
};

export const SEED_BUCKETS: Bucket[] = [
  WORK_BUCKET,
  {
    id: 'fitness',
    kind: 'weighted',
    name: 'Fitness',
    weight: 2,
    weeklyMinutes: 6 * 60,
    hoursMode: 'week',
    hoursMinutes: 6 * 60,
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    slot: 'midday',
    color: 'fb923c',
  },
  {
    id: 'food',
    kind: 'weighted',
    name: 'Food',
    weight: 3,
    weeklyMinutes: 12 * 60,
    hoursMode: 'week',
    hoursMinutes: 12 * 60,
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    slot: 'evening',
    color: 'e85d4c',
  },
  {
    id: 'house',
    kind: 'weighted',
    name: 'House',
    weight: 4,
    weeklyMinutes: 8 * 60,
    hoursMode: 'week',
    hoursMinutes: 8 * 60,
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    slot: 'morning',
    color: '94a3b8',
  },
  {
    id: 'garden',
    kind: 'weighted',
    name: 'Garden',
    weight: 5,
    weeklyMinutes: 6 * 60,
    hoursMode: 'week',
    hoursMinutes: 6 * 60,
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    slot: 'morning',
    color: '4ade80',
  },
  {
    id: 'projects',
    kind: 'weighted',
    name: 'Projects',
    weight: 6,
    weeklyMinutes: 12 * 60,
    hoursMode: 'week',
    hoursMinutes: 12 * 60,
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    slot: 'midday',
    color: 'a78bfa',
  },
];

export const SEED_ITEMS: ListItem[] = [
  {
    id: 'dishes',
    bucketId: 'house',
    title: 'Dishes',
    type: 'recurring',
    weight: 1,
    durationMinutes: 20,
    cadence: { kind: 'daily' },
  },
  {
    id: 'counters',
    bucketId: 'house',
    title: 'Kitchen counters',
    type: 'recurring',
    weight: 2,
    durationMinutes: 15,
    cadence: { kind: 'daily' },
  },
  {
    id: 'cooking',
    bucketId: 'food',
    title: 'Cooking',
    type: 'recurring',
    weight: 1,
    durationMinutes: 30,
    cadence: { kind: 'daily' },
  },
  {
    id: 'work-highlight',
    bucketId: WORK_ID,
    title: 'Most important deliverable',
    type: 'scheduled',
    weight: 1,
    durationMinutes: 180,
    cadence: { kind: 'weekdays' },
  },
];

export function defaultSettings(): DaySettings {
  return { ...DEFAULT_SETTINGS };
}

export function canDeleteBucket(bucket: Bucket): boolean {
  return bucket.kind === 'weighted' && bucket.id !== WORK_ID && bucket.id !== PERSONAL_ID;
}

export function canRenameBucket(bucket: Bucket): boolean {
  return bucket.kind !== 'personal';
}

export function splitEditBuckets(buckets: Bucket[]): { personal: Bucket; work: Bucket; weighted: Bucket[] } {
  const live = buckets.filter((b) => !b.archived);
  const personal = live.find((b) => b.kind === 'personal' || b.id === PERSONAL_ID) ?? PERSONAL_BUCKET;
  const work = live.find((b) => b.kind === 'work' || b.id === WORK_ID) ?? WORK_BUCKET;
  const weighted = live
    .filter((b) => b.kind === 'weighted' && b.id !== WORK_ID && b.id !== PERSONAL_ID)
    .sort((a, b) => a.weight - b.weight);
  return { personal, work, weighted };
}

export function listableBuckets(buckets: Bucket[]): Bucket[] {
  return buckets.filter((b) => !b.archived && b.kind !== 'personal' && b.id !== PERSONAL_ID);
}

export function bucketsToBackfill(existing: Bucket[]): Bucket[] {
  const active = existing.filter((b) => !b.archived);
  const have = new Set(active.map((b) => b.id));
  if (active.length === 0) {
    return [PERSONAL_BUCKET, ...SEED_BUCKETS];
  }
  return [PERSONAL_BUCKET, WORK_BUCKET].filter((b) => !have.has(b.id));
}
