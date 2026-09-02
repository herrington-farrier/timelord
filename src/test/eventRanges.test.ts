import { describe, expect, it } from 'vitest';

import { eventsSummaryLabel } from '../domain/budget';
import { eventRangeForItem, eventRangeName, eventRanges, expiredEventRanges, liveEventRanges, parseEventRanges } from '../domain/events';
import { isEventDay } from '../domain/sections';
import { EVENTS_ID } from '../domain/types';
import { bucket } from './fixtures';

const events = {
  ...bucket({ id: EVENTS_ID, name: 'Events', weight: 0 }),
  kind: 'event' as const,
};

describe('eventRanges', () => {
  it('reads multiple ranges and a one-day block', () => {
    expect(
      eventRanges({
        ...events,
        ranges: [
          { id: 'a', startDate: '2026-08-31', endDate: '2026-09-02' },
          { id: 'b', startDate: '2026-09-10', endDate: '2026-09-10' },
        ],
      })
    ).toEqual([
      { id: 'a', startDate: '2026-08-31', endDate: '2026-09-02' },
      { id: 'b', startDate: '2026-09-10', endDate: '2026-09-10' },
    ]);
  });

  it('treats the old startDate/endDate pair as one range', () => {
    expect(eventRanges({ ...events, startDate: '2026-08-31', endDate: '2026-09-02' })).toEqual([
      { id: 'legacy', startDate: '2026-08-31', endDate: '2026-09-02' },
    ]);
  });
});

describe('isEventDay', () => {
  const multi = {
    ...events,
    ranges: [
      { id: 'a', startDate: '2026-08-31', endDate: '2026-09-02' },
      { id: 'b', startDate: '2026-09-10', endDate: '2026-09-10' },
    ],
  };

  it('hits every day in any range, including a 1-day event', () => {
    expect(isEventDay(multi, '2026-08-31')).toBe(true);
    expect(isEventDay(multi, '2026-09-02')).toBe(true);
    expect(isEventDay(multi, '2026-09-10')).toBe(true);
    expect(isEventDay(multi, '2026-09-03')).toBe(false);
    expect(isEventDay(multi, '2026-09-09')).toBe(false);
  });
});

describe('parseEventRanges', () => {
  it('keeps a 1-day range and drops a blank row', () => {
    expect(
      parseEventRanges([
        { id: 'a', startDate: '2026-09-10', endDate: '2026-09-10' },
        { id: 'b', startDate: '', endDate: '' },
      ])
    ).toEqual([{ id: 'a', startDate: '2026-09-10', endDate: '2026-09-10' }]);
  });

  it('rejects a range that ends before it starts', () => {
    expect(() => parseEventRanges([{ id: 'a', startDate: '2026-09-10', endDate: '2026-09-09' }])).toThrow(
      'Event range end cannot be before start.'
    );
  });

  it('rejects a half-filled range', () => {
    expect(() => parseEventRanges([{ id: 'a', startDate: '2026-09-10', endDate: '' }])).toThrow(
      'Each event range needs a start and end date.'
    );
  });
});

describe('eventsSummaryLabel', () => {
  it('counts ranges and total days instead of listing dates', () => {
    expect(
      eventsSummaryLabel([
        { startDate: '2026-08-29', endDate: '2026-09-02' },
        { startDate: '2026-09-10', endDate: '2026-09-10' },
      ])
    ).toBe('2 ranges · 6d');
  });

  it('reads a single range in the singular', () => {
    expect(eventsSummaryLabel([{ startDate: '2026-09-10', endDate: '2026-09-10' }])).toBe('1 range · 1d');
  });

  it('shows off with no usable ranges', () => {
    expect(eventsSummaryLabel([])).toBe('off');
    expect(eventsSummaryLabel([{ startDate: '2026-09-10', endDate: '' }])).toBe('off');
    expect(eventsSummaryLabel([{ startDate: '2026-09-10', endDate: '2026-09-01' }])).toBe('off');
  });
});

describe('named events and their items', () => {
  const ranges = [
    { id: 'a', name: 'Conference', startDate: '2026-09-10', endDate: '2026-09-12' },
    { id: 'b', name: '', startDate: '2026-10-01', endDate: '2026-10-01' },
  ];

  it('finds an item’s event by id', () => {
    expect(eventRangeForItem(ranges, { eventId: 'b' })?.id).toBe('b');
  });

  it('falls back to the range the date sits in, for items saved before events had ids', () => {
    expect(eventRangeForItem(ranges, { dueAt: '2026-09-11' })?.id).toBe('a');
    expect(eventRangeForItem(ranges, { dueAt: '2026-12-25' })).toBeUndefined();
  });

  it('prefers the id when both point somewhere', () => {
    expect(eventRangeForItem(ranges, { eventId: 'b', dueAt: '2026-09-11' })?.id).toBe('b');
  });

  it('names an unnamed event rather than showing a blank', () => {
    expect(eventRangeName(ranges[0])).toBe('Conference');
    expect(eventRangeName(ranges[1])).toBe('Event');
    expect(eventRangeName(undefined)).toBe('Event');
  });

  it('keeps the name through a parse', () => {
    const parsed = parseEventRanges([{ id: 'a', name: '  Conference  ', startDate: '2026-09-10', endDate: '2026-09-12' }]);
    expect(parsed[0].name).toBe('Conference');
  });
});

describe('event expiry', () => {
  const ranges = [
    { id: 'past', startDate: '2026-08-01', endDate: '2026-08-02' },
    { id: 'today', startDate: '2026-09-01', endDate: '2026-09-02' },
    { id: 'future', startDate: '2026-10-01', endDate: '2026-10-02' },
  ];

  it('treats an event as over only after its last day', () => {
    expect(expiredEventRanges(ranges, '2026-09-02').map((r) => r.id)).toEqual(['past']);
    expect(liveEventRanges(ranges, '2026-09-02').map((r) => r.id)).toEqual(['today', 'future']);
  });

  it('keeps an event on its final day', () => {
    expect(expiredEventRanges([ranges[1]], '2026-09-02')).toEqual([]);
  });
});
