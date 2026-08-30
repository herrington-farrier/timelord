import { describe, expect, it } from 'vitest';

import { formatLogEvent, logEventTone } from '../domain/log';

describe('formatLogEvent', () => {
  it('labels pack, complete, skip, and section moves', () => {
    expect(formatLogEvent({ type: 'rebuild' })).toBe('Schedule packed');
    expect(formatLogEvent({ type: 'complete', title: 'Dishes' })).toBe('Completed Dishes');
    expect(formatLogEvent({ type: 'skip', title: 'Floors' })).toBe('Skipped Floors');
    expect(formatLogEvent({ type: 'start_next', section: 'midday' })).toBe('Started next buckets');
    expect(formatLogEvent({ type: 'end_day' })).toBe('Ended the day');
    expect(formatLogEvent({ type: 'reset_today' })).toBe('Reset today');
  });
});

describe('logEventTone', () => {
  it('colors complete, skip, and packed', () => {
    expect(logEventTone('complete')).toBe('ok');
    expect(logEventTone('skip')).toBe('skip');
    expect(logEventTone('rebuild')).toBe('pack');
    expect(logEventTone('start_next')).toBe('');
  });
});
