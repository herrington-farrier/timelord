import { describe, expect, it } from 'vitest';

import { applyBucketOrder, applyItemOrder } from '../domain/order';
import { bucket, item, workBucket } from './fixtures';

describe('applyBucketOrder', () => {
  it('keeps Work at weight 1 after a drag', () => {
    const house = bucket({ id: 'house', name: 'House', weight: 4 });
    const garden = bucket({ id: 'garden', name: 'Garden', weight: 5 });
    const next = applyBucketOrder([workBucket(), house, garden], ['garden', 'house']);
    expect(next.find((b) => b.id === 'work')?.weight).toBe(1);
    expect(next.find((b) => b.id === 'garden')?.weight).toBe(2);
    expect(next.find((b) => b.id === 'house')?.weight).toBe(3);
  });
});

describe('applyItemOrder', () => {
  it('writes weights from drop order', () => {
    const a = item({ id: 'a', bucketId: 'house', title: 'A', weight: 1 });
    const b = item({ id: 'b', bucketId: 'house', title: 'B', weight: 2 });
    const next = applyItemOrder([a, b], ['b', 'a']);
    expect(next.find((i) => i.id === 'b')?.weight).toBe(1);
    expect(next.find((i) => i.id === 'a')?.weight).toBe(2);
  });
});
