import { act, renderHook } from '@testing-library/react';
import { FirebaseError } from 'firebase/app';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LOAD_FAILED } from '../services/loadState';
import { useBuckets, useDay, useDays, useSettings } from '../services/live';
import { clearToasts, getToasts } from '../shared/toastBus';

type Next = (snap: unknown) => void;
type Fail = (err: unknown) => void;

const fs = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  query: vi.fn((...args: unknown[]) => ({ query: args })),
  where: vi.fn((...args: unknown[]) => ({ where: args })),
  documentId: vi.fn(() => 'DOC_ID'),
  collection: vi.fn((...args: unknown[]) => ({ collection: args })),
  doc: vi.fn((...args: unknown[]) => ({ doc: args })),
}));

vi.mock('firebase/firestore', () => fs);
vi.mock('../services/firebase', () => ({ db: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  clearToasts();
  fs.onSnapshot.mockReturnValue(() => {});
});

function lastListener(): { next: Next; fail: Fail } {
  const call = fs.onSnapshot.mock.calls.at(-1) as [unknown, Next, Fail];
  return { next: call[1], fail: call[2] };
}

describe('live listeners', () => {
  it('useDay is undefined while loading and null when the day is missing', async () => {
    const { result } = renderHook(() => useDay('u1', '2026-09-01'));
    expect(result.current).toBeUndefined();
    const { act } = await import('@testing-library/react');
    act(() => lastListener().next({ exists: () => false }));
    expect(result.current).toBeNull();
  });

  it('useBuckets is undefined until the first snapshot', async () => {
    const { result } = renderHook(() => useBuckets('u1'));
    expect(result.current).toBeUndefined();
    const { act } = await import('@testing-library/react');
    act(() => lastListener().next({ docs: [] }));
    expect(result.current).toEqual([]);
  });

  it('surfaces a refused listener as a toast instead of failing silently', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderHook(() => useSettings('u1'));
    lastListener().fail(new FirebaseError('permission-denied', 'no'));
    expect(getToasts()[0]?.message).toBe('Load Settings: invite-only.');
  });

  it('gives every listener an error callback', () => {
    renderHook(() => {
      useSettings('u1');
      useBuckets('u1');
      useDay('u1', '2026-09-01');
      useDays('u1', '2026-09-01', '2026-09-30');
    });
    expect(fs.onSnapshot).toHaveBeenCalledTimes(4);
    for (const call of fs.onSnapshot.mock.calls) expect(typeof call[2]).toBe('function');
  });

  it('useDays asks only for the window it shows', () => {
    renderHook(() => useDays('u1', '2026-09-01', '2026-10-12'));
    expect(fs.where).toHaveBeenCalledWith('DOC_ID', '>=', '2026-09-01');
    expect(fs.where).toHaveBeenCalledWith('DOC_ID', '<=', '2026-10-12');
    const [ref, ...clauses] = fs.query.mock.calls[0] as unknown[];
    expect(ref).toEqual({ collection: [{}, 'tenants', 'u1', 'days'] });
    expect(clauses).toHaveLength(2);
    // the listener is on the query, not on the whole collection
    expect((fs.onSnapshot.mock.calls[0] as unknown[])[0]).toEqual(fs.query.mock.results[0].value);
  });

  it('useDay drops the old date\'s document when the date changes', () => {
    const { result, rerender } = renderHook(({ d }) => useDay('u1', d), { initialProps: { d: '2026-09-01' } });
    act(() => lastListener().next({ exists: () => true, data: () => ({ blocks: [] }) }));
    expect(result.current).toEqual({ blocks: [] });
    rerender({ d: '2026-09-02' });
    expect(result.current).toBeUndefined();
  });

  it('useDays unsubscribes the old window and shows nothing from it', () => {
    const unsubscribe = vi.fn();
    fs.onSnapshot.mockReturnValue(unsubscribe);
    const { result, rerender } = renderHook(({ s }) => useDays('u1', s, '2026-12-31'), {
      initialProps: { s: '2026-09-01' },
    });
    act(() => lastListener().next({ docs: [{ id: '2026-09-02', data: () => ({ blocks: [] }) }] }));
    expect(Object.keys(result.current)).toEqual(['2026-09-02']);
    rerender({ s: '2026-10-01' });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({});
  });

  it('useDay and useBuckets return a distinct failed state when refused', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const day = renderHook(() => useDay('u1', '2026-09-01'));
    act(() => lastListener().fail(new FirebaseError('permission-denied', 'no')));
    expect(day.result.current).toBe(LOAD_FAILED);
    const buckets = renderHook(() => useBuckets('u1'));
    act(() => lastListener().fail(new FirebaseError('permission-denied', 'no')));
    expect(buckets.result.current).toBe(LOAD_FAILED);
  });
});
