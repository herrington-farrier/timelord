import { DEFAULT_SETTINGS, WORK_ID, type Bucket, type DaySettings, type ListItem } from '../domain/types';

export function settings(overrides: Partial<DaySettings> = {}): DaySettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

export function workBucket(overrides: Partial<Bucket> = {}): Bucket {
  return {
    id: WORK_ID,
    kind: 'work',
    name: 'Work',
    weight: 1,
    weeklyMinutes: 15 * 60,
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    slot: 'midday',
    color: 'f0c14a',
    ...overrides,
  };
}

export function bucket(overrides: Partial<Bucket> & Pick<Bucket, 'id' | 'name' | 'weight'>): Bucket {
  return {
    kind: 'weighted',
    weeklyMinutes: 8 * 60,
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    slot: 'morning',
    color: '94a3b8',
    ...overrides,
  };
}

export function item(overrides: Partial<ListItem> & Pick<ListItem, 'id' | 'bucketId' | 'title'>): ListItem {
  return {
    type: 'recurring',
    weight: 1,
    durationMinutes: 30,
    cadence: { kind: 'daily' },
    ...overrides,
  };
}
