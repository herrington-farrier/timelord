import { describe, expect, it } from 'vitest';

import { eventsRangeLabel, eventsRangesLabel } from '../domain/budget';
import { eventRanges, parseEventRanges } from '../domain/events';
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

describe('eventsRangesLabel', () => {
  it('joins range labels and shows off when empty', () => {
    expect(
      eventsRangesLabel([
        { id: 'a', startDate: '2026-08-29', endDate: '2026-09-02' },
        { id: 'b', startDate: '2026-09-10', endDate: '2026-09-10' },
      ])
    ).toBe(`${eventsRangeLabel('2026-08-29', '2026-09-02')} · ${eventsRangeLabel('2026-09-10', '2026-09-10')}`);
    expect(eventsRangesLabel([])).toBe('off');
  });
});
