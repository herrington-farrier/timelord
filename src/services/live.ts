import { collection, doc, documentId, onSnapshot, query, where, type DocumentData } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import type { Bucket, DaySettings, ListItem, Slot } from '../domain/types';
import type { DroppedBucket } from '../domain/packDay';
import type { PackedBlock } from '../domain/types';
import { toastFailure } from '../shared/toastBus';
import { db } from './firebase';
import { LOAD_FAILED, type LoadFailed } from './loadState';

export type DayDoc = {
  blocks: PackedBlock[];
  dropped: PackedBlock[];
  droppedBuckets: DroppedBucket[];
  packedMinutes: number;
  droppedMinutes: number;
  remainingMinutes: number;
  startedAt?: string | null;
  endedAt?: string | null;
  packedAt?: string | null;
  section?: Slot | 'event' | null;
  sectionStartedAt?: string | null;
  sectionRemainingMinutes?: number | null;
  pausedAt?: string | null;
  sectionExtra?: Partial<Record<Slot, number>>;
  sectionUsed?: Partial<Record<Slot, number>>;
  eventStartedAt?: string | null;
  /** What this day added to the running score, once it ended. */
  scoreDelta?: number;
};

/** A listener the server refuses would otherwise fail silently and look like empty data. */
function onListenError(label: string) {
  return (err: unknown) => {
    console.error(err);
    toastFailure(err, label);
  };
}

function tenantCol(uid: string, name: string) {
  if (!db) throw new Error('Firebase is not configured.');
  return collection(db, 'tenants', uid, name);
}

export function useSettings(uid: string | undefined): DaySettings | null {
  const [value, setValue] = useState<DaySettings | null>(null);
  useEffect(() => {
    if (!uid || !db) return;
    return onSnapshot(
      doc(db, 'tenants', uid, 'settings', 'current'),
      (snap) => setValue(snap.exists() ? (snap.data() as DaySettings) : null),
      onListenError('Load Settings')
    );
  }, [uid]);
  return value;
}

/** A value tagged with the listener key that produced it, so a key change cannot show the old key's data. */
type Keyed<T> = { key: string; value: T } | null;

/** `undefined` until the first snapshot, so a page can tell "loading" from "none". */
export function useBuckets(uid: string | undefined): Bucket[] | undefined | LoadFailed {
  const key = `${uid}`;
  const [state, setState] = useState<Keyed<Bucket[] | LoadFailed>>(null);
  useEffect(() => {
    if (!uid || !db) return;
    const fail = onListenError('Load Buckets');
    return onSnapshot(
      tenantCol(uid, 'buckets'),
      (snap) => {
        setState({
          key,
          value: snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as Bucket)
            .filter((b) => !b.archived)
            .sort((a, b) => a.weight - b.weight),
        });
      },
      (err) => {
        fail(err);
        setState({ key, value: LOAD_FAILED });
      }
    );
  }, [uid, key]);
  return state?.key === key ? state.value : undefined;
}

export function useItems(uid: string | undefined): ListItem[] {
  const [value, setValue] = useState<ListItem[]>([]);
  useEffect(() => {
    if (!uid || !db) return;
    return onSnapshot(
      tenantCol(uid, 'items'),
      (snap) => {
        setValue(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as ListItem)
            .filter((i) => !i.archived)
            .sort((a, b) => a.weight - b.weight)
        );
      },
      onListenError('Load Items')
    );
  }, [uid]);
  return value;
}

/**
 * `undefined` while loading, `null` once the snapshot says there is no packed
 * day, `LOAD_FAILED` if the listener was refused. A new date never shows the
 * previous date's document.
 */
export function useDay(uid: string | undefined, date: string): DayDoc | null | undefined | LoadFailed {
  const key = `${uid}/${date}`;
  const [state, setState] = useState<Keyed<DayDoc | null | LoadFailed>>(null);
  useEffect(() => {
    if (!uid || !db) return;
    const fail = onListenError('Load Day');
    return onSnapshot(
      doc(db, 'tenants', uid, 'days', date),
      (snap) => setState({ key, value: snap.exists() ? (snap.data() as DayDoc) : null }),
      (err) => {
        fail(err);
        setState({ key, value: LOAD_FAILED });
      }
    );
  }, [uid, date, key]);
  return state?.key === key ? state.value : undefined;
}

const NO_DAYS: Record<string, DayDoc> = {};

/** Only the window the Calendar shows: day ids are dates, so the id range is the date range. */
export function useDays(uid: string | undefined, start: string, end: string): Record<string, DayDoc> {
  const key = `${uid}/${start}/${end}`;
  const [state, setState] = useState<Keyed<Record<string, DayDoc>>>(null);
  useEffect(() => {
    if (!uid || !db) return;
    const q = query(
      tenantCol(uid, 'days'),
      where(documentId(), '>=', start),
      where(documentId(), '<=', end)
    );
    return onSnapshot(
      q,
      (snap) => {
        const next: Record<string, DayDoc> = {};
        snap.docs.forEach((d) => {
          next[d.id] = d.data() as DayDoc;
        });
        setState({ key, value: next });
      },
      onListenError('Load Days')
    );
  }, [uid, start, end, key]);
  return state?.key === key ? state.value : NO_DAYS;
}

export function useLogs(uid: string | undefined, start: string, end: string) {
  const [value, setValue] = useState<DocumentData[]>([]);
  useEffect(() => {
    if (!uid || !db) return;
    const q = query(tenantCol(uid, 'logs'), where('date', '>=', start), where('date', '<=', end));
    return onSnapshot(
      q,
      (snap) => setValue(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onListenError('Load Logs')
    );
  }, [uid, start, end]);
  return value;
}

export function useScore(uid: string | undefined): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!uid || !db) return;
    return onSnapshot(
      doc(tenantCol(uid, 'score'), 'current'),
      (snap) => setValue(Number((snap.data() as DocumentData | undefined)?.total) || 0),
      onListenError('Load Score')
    );
  }, [uid]);
  return value;
}
