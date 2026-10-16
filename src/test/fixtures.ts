import type { DayState, TenantData } from '../domain/dayFlow';
import {
  DEFAULT_SETTINGS,
  WORK_ID,
  type Bucket,
  type DaySettings,
  type ListItem,
  type PackedBlock,
} from '../domain/types';

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

export function packedBlock(
  overrides: Partial<PackedBlock> & Pick<PackedBlock, 'id' | 'kind'>
): PackedBlock {
  return {
    date: '2026-08-31',
    bucketId: 'house',
    title: overrides.title ?? overrides.id,
    startMinutes: 0,
    endMinutes: 30,
    durationMinutes: 30,
    status: 'pending',
    color: '94a3b8',
    flexible: true,
    ...overrides,
  };
}

/** A stored day doc. Defaults to an unstarted, packed, empty day. */
export function dayState(overrides: Partial<DayState> = {}): DayState {
  return {
    blocks: [],
    dropped: [],
    droppedBuckets: [],
    packedMinutes: 0,
    droppedMinutes: 0,
    remainingMinutes: 0,
    packedAt: '2026-08-31T06:00:00.000Z',
    startedAt: null,
    endedAt: null,
    section: null,
    scoreDelta: 0,
    ...overrides,
  };
}

/** What a handler loads from the tenant: a Work bucket and nothing else by default. */
export function tenantData(overrides: Partial<TenantData> = {}): TenantData {
  return {
    items: [],
    buckets: [workBucket()],
    settings: settings(),
    skipPushes: [],
    ...overrides,
  };
}
