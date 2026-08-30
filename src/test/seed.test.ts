import { describe, expect, it } from 'vitest';

import {
  EVENTS_BUCKET,
  PERSONAL_BUCKET,
  bucketsToBackfill,
  canDeleteBucket,
  canRenameBucket,
  listCadenceDays,
  listableBuckets,
  splitEditBuckets,
} from '../domain/seed';
import { PERSONAL_ID, WORK_ID } from '../domain/types';
import { bucket, workBucket } from './fixtures';

describe('locked buckets on Edit', () => {
  it('always surfaces Personal and Work even when live buckets omit them', () => {
    const { personal, work, events, weighted } = splitEditBuckets([
      bucket({ id: 'house', name: 'House', weight: 4 }),
    ]);
    expect(personal.id).toBe(PERSONAL_ID);
    expect(personal.name).toBe('Personal');
    expect(work.id).toBe(WORK_ID);
    expect(work.name).toBe('Work');
    expect(events.id).toBe('events');
    expect(weighted.map((b) => b.id)).toEqual(['house']);
  });
});

describe('list cadence days', () => {
  it('closes weekdays the bucket does not run', () => {
    expect(listCadenceDays(bucket({ id: 'house', name: 'House', weight: 4, days: ['Mon', 'Tue', 'Thu', 'Fri'] }))).toEqual([
      'Mon',
      'Tue',
      'Thu',
      'Fri',
    ]);
    expect(listCadenceDays(bucket({ id: 'house', name: 'House', weight: 4, days: ['Mon', 'Tue', 'Thu', 'Fri'] }))).not.toContain(
      'Wed'
    );
  });
});

describe('listable buckets', () => {
  it('keeps Personal out of list pickers', () => {
    const ids = listableBuckets([PERSONAL_BUCKET, workBucket(), bucket({ id: 'house', name: 'House', weight: 4 })]).map(
      (b) => b.id
    );
    expect(ids).not.toContain(PERSONAL_ID);
    expect(ids).toContain(WORK_ID);
    expect(ids).toContain('house');
  });
});

describe('tenant backfill', () => {
  it('restores Personal and Work when a tenant has other buckets but not the locked ones', () => {
    const missing = bucketsToBackfill([bucket({ id: 'house', name: 'House', weight: 4 })]);
    expect(missing.map((b) => b.id).sort()).toEqual(['events', PERSONAL_ID, WORK_ID]);
  });
});

describe('locked bucket rules', () => {
  it('does not allow removing Personal', () => {
    expect(canDeleteBucket(PERSONAL_BUCKET)).toBe(false);
  });

  it('does not allow renaming Personal', () => {
    expect(canRenameBucket(PERSONAL_BUCKET)).toBe(false);
  });

  it('does not allow removing Events', () => {
    expect(canDeleteBucket(EVENTS_BUCKET)).toBe(false);
  });
});
