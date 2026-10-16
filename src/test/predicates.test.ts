import { describe, expect, it } from 'vitest';

import { findEventsBucket, isEveningRoutine, isEventsBucket, isMorningRoutine } from '../domain/predicates';
import { pushesNeededFrom, pushPruneCutoff, repackableDates } from '../domain/skip';
import { EVENTS_ID } from '../domain/types';
import { bucket } from './fixtures';

describe('isEventsBucket', () => {
  it('matches the fixed id or the event kind', () => {
    expect(isEventsBucket(bucket({ id: EVENTS_ID, name: 'Events', weight: 0 }))).toBe(true);
    expect(isEventsBucket({ ...bucket({ id: 'trips', name: 'Trips', weight: 0 }), kind: 'event' })).toBe(true);
  });

  it('rejects other buckets and a missing one', () => {
    expect(isEventsBucket(bucket({ id: 'home', name: 'Home', weight: 2 }))).toBe(false);
    expect(isEventsBucket(undefined)).toBe(false);
  });

  it('does not look at archived: callers pass live buckets', () => {
    expect(isEventsBucket({ ...bucket({ id: EVENTS_ID, name: 'Events', weight: 0 }), archived: true })).toBe(true);
  });
});

describe('findEventsBucket', () => {
  it('returns the Events bucket or undefined', () => {
    const events = bucket({ id: EVENTS_ID, name: 'Events', weight: 0 });
    expect(findEventsBucket([bucket({ id: 'home', name: 'Home', weight: 2 }), events])).toBe(events);
    expect(findEventsBucket([bucket({ id: 'home', name: 'Home', weight: 2 })])).toBeUndefined();
  });
});

describe('routine predicates', () => {
  it('match on title or on the id suffix packDay emits', () => {
    expect(isMorningRoutine({ id: 'x', title: 'Morning Routine' })).toBe(true);
    expect(isMorningRoutine({ id: '2026-09-01:morning', title: 'Renamed' })).toBe(true);
    expect(isEveningRoutine({ id: 'x', title: 'Evening Routine' })).toBe(true);
    expect(isEveningRoutine({ id: '2026-09-01:evening', title: 'Renamed' })).toBe(true);
  });

  it('keep the two apart', () => {
    expect(isMorningRoutine({ id: '2026-09-01:evening', title: 'Evening Routine' })).toBe(false);
    expect(isEveningRoutine({ id: '2026-09-01:morning', title: 'Morning Routine' })).toBe(false);
    expect(isMorningRoutine({ id: 'item-1', title: 'Write' })).toBe(false);
  });
});

describe('skip push window', () => {
  it('loads from the earlier of the first packed day and today', () => {
    expect(pushesNeededFrom('2026-08-30', '2026-09-02')).toBe('2026-08-30');
    expect(pushesNeededFrom('2026-09-10', '2026-09-02')).toBe('2026-09-02');
  });

  it('prunes pushes from before the current week', () => {
    // 2026-09-02 is a Wednesday; the week starts Sunday 08-30
    expect(pushPruneCutoff('2026-09-02')).toBe('2026-08-30');
  });

  it('does not repack a past week, whose pushes may already be pruned', () => {
    expect(repackableDates(['2026-08-29', '2026-08-30', '2026-09-05'], '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-09-05',
    ]);
  });
});
