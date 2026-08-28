import { describe, expect, it } from 'vitest';

import { formatDuration } from '../domain/duration';
import { canDeleteBucket } from '../domain/seed';
import { workBucket, bucket } from './fixtures';

describe('today duration labels', () => {
  it('shows 20m instead of 0.3hrs', () => {
    expect(formatDuration(20)).toBe('20m');
  });
});

describe('custom buckets', () => {
  it('allows removing a weighted bucket', () => {
    expect(canDeleteBucket(bucket({ id: 'house', name: 'House', weight: 4 }))).toBe(true);
  });

  it('does not allow removing Work', () => {
    expect(canDeleteBucket(workBucket())).toBe(false);
  });
});
