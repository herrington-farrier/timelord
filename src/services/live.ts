import { collection, doc, onSnapshot, query, where, type DocumentData } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import type { Appointment, Bucket, DaySettings, ListItem } from '../domain/types';
import type { DroppedBucket } from '../domain/packDay';
import type { PackedBlock } from '../domain/types';
import { db } from './firebase';

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
};

function tenantCol(uid: string, name: string) {
  if (!db) throw new Error('Firebase is not configured.');
  return collection(db, 'tenants', uid, name);
}

export function useSettings(uid: string | undefined): DaySettings | null {
  const [value, setValue] = useState<DaySettings | null>(null);
  useEffect(() => {
    if (!uid || !db) return;
    return onSnapshot(doc(db, 'tenants', uid, 'settings', 'current'), (snap) => {
      setValue(snap.exists() ? (snap.data() as DaySettings) : null);
    });
  }, [uid]);
  return value;
}

export function useBuckets(uid: string | undefined): Bucket[] {
  const [value, setValue] = useState<Bucket[]>([]);
  useEffect(() => {
    if (!uid || !db) return;
    return onSnapshot(tenantCol(uid, 'buckets'), (snap) => {
      setValue(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as Bucket)
          .filter((b) => !b.archived)
          .sort((a, b) => a.weight - b.weight)
      );
    });
  }, [uid]);
  return value;
}

export function useItems(uid: string | undefined): ListItem[] {
  const [value, setValue] = useState<ListItem[]>([]);
  useEffect(() => {
    if (!uid || !db) return;
    return onSnapshot(tenantCol(uid, 'items'), (snap) => {
      setValue(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as ListItem)
          .filter((i) => !i.archived)
          .sort((a, b) => a.weight - b.weight)
      );
    });
  }, [uid]);
  return value;
}

export function useAppointments(uid: string | undefined): Appointment[] {
  const [value, setValue] = useState<Appointment[]>([]);
  useEffect(() => {
    if (!uid || !db) return;
    return onSnapshot(tenantCol(uid, 'appointments'), (snap) => {
      setValue(snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as Appointment));
    });
  }, [uid]);
  return value;
}

export function useDay(uid: string | undefined, date: string): DayDoc | null {
  const [value, setValue] = useState<DayDoc | null>(null);
  useEffect(() => {
    if (!uid || !db) return;
    return onSnapshot(doc(db, 'tenants', uid, 'days', date), (snap) => {
      setValue(snap.exists() ? (snap.data() as DayDoc) : null);
    });
  }, [uid, date]);
  return value;
}

export function useDays(uid: string | undefined, start: string, end: string): Record<string, DayDoc> {
  const [value, setValue] = useState<Record<string, DayDoc>>({});
  useEffect(() => {
    if (!uid || !db) return;
    return onSnapshot(tenantCol(uid, 'days'), (snap) => {
      const next: Record<string, DayDoc> = {};
      snap.docs.forEach((d) => {
        if (d.id >= start && d.id <= end) next[d.id] = d.data() as DayDoc;
      });
      setValue(next);
    });
  }, [uid, start, end]);
  return value;
}

export function useLogs(uid: string | undefined, date: string) {
  const [value, setValue] = useState<DocumentData[]>([]);
  useEffect(() => {
    if (!uid || !db) return;
    const q = query(tenantCol(uid, 'logs'), where('date', '==', date));
    return onSnapshot(q, (snap) => {
      setValue(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [uid, date]);
  return value;
}
