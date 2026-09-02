import { describe, expect, it } from 'vitest';

import { formatLogEvent, logEventTone } from '../domain/log';

describe('formatLogEvent', () => {
  it('labels pack, complete, skip, and section moves', () => {
    expect(formatLogEvent({ type: 'rebuild' })).toBe('Quest Log Packed');
    expect(formatLogEvent({ type: 'complete', title: 'Dishes' })).toBe('Quest Completed: Dishes');
    expect(formatLogEvent({ type: 'skip', title: 'Floors' })).toBe('Quest Failed: Floors');
    expect(formatLogEvent({ type: 'start_next', section: 'midday' })).toBe('Started next chapter');
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
