import { DEFAULT_SETTINGS, WORK_ID, type Bucket, type DaySettings, type ListItem } from '../domain/types';

export function settings(overrides: Partial<DaySettings> = {}): DaySettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

export function workBucket(overrides: Partial<Bucket> = {}): Bucket {
  const weeklyMinutes = overrides.weeklyMinutes ?? 15 * 60;
  const hoursMinutes = overrides.hoursMinutes ?? overrides.weeklyMinutes ?? weeklyMinutes;
  return {
    id: WORK_ID,
    kind: 'work',
    name: 'Work',
    weight: 1,
    weeklyMinutes,
    hoursMode: 'week',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    slot: 'midday',
    color: 'f0c14a',
    ...overrides,
    hoursMinutes,
  };
}

export function bucket(overrides: Partial<Bucket> & Pick<Bucket, 'id' | 'name' | 'weight'>): Bucket {
  const weeklyMinutes = overrides.weeklyMinutes ?? 8 * 60;
  const hoursMinutes = overrides.hoursMinutes ?? overrides.weeklyMinutes ?? weeklyMinutes;
  return {
    kind: 'weighted',
    weeklyMinutes,
    hoursMode: 'week',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    slot: 'morning',
    color: '94a3b8',
    ...overrides,
    hoursMinutes,
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
