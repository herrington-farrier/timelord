import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { canDeleteBucket } from '../../src/domain/seed';
import { collectEndDaySkipPushes, packDay } from '../../src/domain/packDay';
import { packRange } from '../../src/domain/packWeek';
import { skipPushDate } from '../../src/domain/skip';
import type { Appointment, Bucket, DaySettings, ListItem, PackedBlock, SkipPush } from '../../src/domain/types';
import { stampCreated, stampLastUpdated } from './actorAudit';
import { asNumber, asString, newId, requireUid } from './http';
import { ensureTenant, loadTenant, tenantRef } from './tenant';

initializeApp();

function nowIso(): string {
  return new Date().toISOString();
}

function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

async function writeLog(
  uid: string,
  row: { type: string; date: string; itemId?: string; bucketId?: string; minutes?: number }
): Promise<void> {
  const stamp = await stampCreated(uid, nowIso());
  await tenantRef(uid)
    .collection('logs')
    .doc(newId())
    .set({
      ...row,
      at: stamp.created_at,
      ...stamp,
    });
}

export const bootstrap = onCall(async (request) => {
  const uid = requireUid(request);
  await ensureTenant(uid, nowIso());
  return { ok: true };
});

export const saveSettings = onCall(async (request) => {
  const uid = requireUid(request);
  await ensureTenant(uid, nowIso());
  const data = request.data as Record<string, unknown>;
  const patch = {
    dayMinutes: asNumber(data.dayMinutes, 'Day length'),
    dayStartMinutes: asNumber(data.dayStartMinutes, 'Day start'),
    transitionMinutes: asNumber(data.transitionMinutes, 'Transition'),
    timezone: asString(data.timezone || 'America/Chicago', 'Timezone'),
    morningMinutes: asNumber(data.morningMinutes, 'Morning Routine'),
    breakMinutes: asNumber(data.breakMinutes, 'Break'),
    eveningMinutes: asNumber(data.eveningMinutes, 'Evening Routine'),
  };
  if (patch.dayMinutes < 60) {
    throw new HttpsError('invalid-argument', 'Day length must be at least 1 hour.');
  }
  const stamp = await stampLastUpdated(uid, nowIso());
  await tenantRef(uid).collection('settings').doc('current').set({ ...patch, ...stamp }, { merge: true });
  return { ok: true };
});

export const upsertBucket = onCall(async (request) => {
  const uid = requireUid(request);
  await ensureTenant(uid, nowIso());
  const data = request.data as Record<string, unknown>;
  const id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : newId();
  const kind = asString(data.kind || 'weighted', 'Kind');
  if (kind === 'work' && id !== 'work') {
    throw new HttpsError('invalid-argument', 'Work must keep the work id.');
  }
  const payload = {
    kind,
    name: asString(data.name, 'Name'),
    weight: asNumber(data.weight, 'Priority'),
    weeklyMinutes: asNumber(data.weeklyMinutes, 'Weekly hours'),
    days: Array.isArray(data.days) ? data.days : [],
    slot: asString(data.slot || 'morning', 'Time of day'),
    color: asString(data.color, 'Color').replace(/^#/, ''),
    archived: false,
  };
  const ref = tenantRef(uid).collection('buckets').doc(id);
  const existing = await ref.get();
  const stamp = existing.exists ? await stampLastUpdated(uid, nowIso()) : await stampCreated(uid, nowIso());
  await ref.set({ ...payload, ...stamp }, { merge: true });
  return { ok: true, id };
});

export const archiveBucket = onCall(async (request) => {
  const uid = requireUid(request);
  const id = asString(request.data?.id, 'Bucket');
  const snap = await tenantRef(uid).collection('buckets').doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Bucket not found.');
  const bucket = { id, ...(snap.data() as object) } as Bucket;
  if (!canDeleteBucket(bucket)) {
    throw new HttpsError('failed-precondition', 'Work cannot be removed.');
  }
  const stamp = await stampLastUpdated(uid, nowIso());
  await snap.ref.set({ archived: true, ...stamp }, { merge: true });
  return { ok: true };
});

export const reorderBuckets = onCall(async (request) => {
  const uid = requireUid(request);
  const ids = request.data?.weightedOrderIds;
  if (!Array.isArray(ids)) {
    throw new HttpsError('invalid-argument', 'Drag order is required.');
  }
  const stamp = await stampLastUpdated(uid, nowIso());
  const col = tenantRef(uid).collection('buckets');
  const batch = getFirestore().batch();
  batch.set(col.doc('work'), { weight: 1, ...stamp }, { merge: true });
  ids.forEach((id: unknown, i: number) => {
    if (typeof id !== 'string') return;
    batch.set(col.doc(id), { weight: i + 2, ...stamp }, { merge: true });
  });
  await batch.commit();
  return { ok: true };
});

export const upsertItem = onCall(async (request) => {
  const uid = requireUid(request);
  await ensureTenant(uid, nowIso());
  const data = request.data as Record<string, unknown>;
  const id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : newId();
  const durationMinutes = asNumber(data.durationMinutes, 'Duration');
  if (durationMinutes <= 0) {
    throw new HttpsError('invalid-argument', 'Duration must be greater than 0.');
  }
  const payload = {
    bucketId: asString(data.bucketId, 'Bucket'),
    title: asString(data.title, 'Title'),
    type: asString(data.type, 'Type'),
    weight: asNumber(data.weight ?? 1, 'Priority'),
    durationMinutes,
    cadence: data.cadence || { kind: 'daily' },
    dueAt: typeof data.dueAt === 'string' ? data.dueAt : '',
    archived: false,
  };
  const ref = tenantRef(uid).collection('items').doc(id);
  const existing = await ref.get();
  const stamp = existing.exists ? await stampLastUpdated(uid, nowIso()) : await stampCreated(uid, nowIso());
  await ref.set({ ...payload, ...stamp }, { merge: true });
  return { ok: true, id };
});

export const reorderItems = onCall(async (request) => {
  const uid = requireUid(request);
  const ids = request.data?.orderedIds;
  if (!Array.isArray(ids)) {
    throw new HttpsError('invalid-argument', 'Drag order is required.');
  }
  const stamp = await stampLastUpdated(uid, nowIso());
  const col = tenantRef(uid).collection('items');
  const batch = getFirestore().batch();
  ids.forEach((id: unknown, i: number) => {
    if (typeof id !== 'string') return;
    batch.set(col.doc(id), { weight: i + 1, ...stamp }, { merge: true });
  });
  await batch.commit();
  return { ok: true };
});

export const archiveItem = onCall(async (request) => {
  const uid = requireUid(request);
  const id = asString(request.data?.id, 'Item');
  const stamp = await stampLastUpdated(uid, nowIso());
  await tenantRef(uid).collection('items').doc(id).set({ archived: true, ...stamp }, { merge: true });
  return { ok: true };
});

export const upsertAppointment = onCall(async (request) => {
  const uid = requireUid(request);
  await ensureTenant(uid, nowIso());
  const data = request.data as Record<string, unknown>;
  const id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : newId();
  const payload = {
    title: asString(data.title, 'Title'),
    date: asString(data.date, 'Date'),
    startMinutes: asNumber(data.startMinutes, 'Start'),
    durationMinutes: asNumber(data.durationMinutes, 'Duration'),
  };
  if (payload.durationMinutes <= 0) {
    throw new HttpsError('invalid-argument', 'Duration must be greater than 0.');
  }
  const ref = tenantRef(uid).collection('appointments').doc(id);
  const existing = await ref.get();
  const stamp = existing.exists ? await stampLastUpdated(uid, nowIso()) : await stampCreated(uid, nowIso());
  await ref.set({ ...payload, ...stamp }, { merge: true });
  return { ok: true, id };
});

export const archiveAppointment = onCall(async (request) => {
  const uid = requireUid(request);
  const id = asString(request.data?.id, 'Appointment');
  await tenantRef(uid).collection('appointments').doc(id).delete();
  return { ok: true };
});

function asPackInput(loaded: Awaited<ReturnType<typeof loadTenant>>, date: string, previous?: PackedBlock[]) {
  return {
    date,
    settings: loaded.settings as DaySettings,
    buckets: loaded.buckets as Bucket[],
    items: loaded.items as ListItem[],
    appointments: loaded.appointments as Appointment[],
    skipPushes: loaded.skipPushes as SkipPush[],
    previous: previous?.map((b) => ({
      itemId: b.itemId,
      appointmentId: b.appointmentId,
      status: b.status,
      startMinutes: b.startMinutes,
      endMinutes: b.endMinutes,
    })),
  };
}

export const rebuildRange = onCall(async (request) => {
  const uid = requireUid(request);
  await ensureTenant(uid, nowIso());
  const start = asString(request.data?.start || todayKey(), 'Start date');
  const days = Number(request.data?.days) || 21;
  const loaded = await loadTenant(uid);
  const packed = packRange(start, days, asPackInput(loaded, start));
  const batch = getFirestore().batch();
  const daysCol = tenantRef(uid).collection('days');
  for (const row of packed) {
    const prevSnap = await daysCol.doc(row.date).get();
    const prev = prevSnap.exists ? (prevSnap.data() as { blocks?: PackedBlock[]; startedAt?: string; endedAt?: string }) : null;
    const result = prev?.blocks
      ? packDay(asPackInput(loaded, row.date, prev.blocks))
      : row.result;
    batch.set(daysCol.doc(row.date), {
      ...result,
      startedAt: prev?.startedAt || null,
      endedAt: prev?.endedAt || null,
      packedAt: nowIso(),
    });
  }
  await batch.commit();
  await writeLog(uid, { type: 'rebuild', date: start });
  return { ok: true };
});

async function patchBlock(
  uid: string,
  date: string,
  blockId: string,
  status: 'complete' | 'skipped'
): Promise<{ item?: ListItem; block?: PackedBlock }> {
  const dayRef = tenantRef(uid).collection('days').doc(date);
  const snap = await dayRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That day is not packed yet.');
  const data = snap.data() as { blocks: PackedBlock[]; dropped: PackedBlock[] };
  const stamp = await stampLastUpdated(uid, nowIso());
  let found: PackedBlock | undefined;
  const mapStatus = (rows: PackedBlock[]) =>
    rows.map((b) => {
      if (b.id !== blockId) return b;
      found = { ...b, status };
      return found;
    });
  const blocks = mapStatus(data.blocks || []);
  const dropped = mapStatus(data.dropped || []);
  if (!found) throw new HttpsError('not-found', 'That block was not found.');
  await dayRef.set({ blocks, dropped, ...stamp }, { merge: true });
  const loaded = await loadTenant(uid);
  const item = (loaded.items as ListItem[]).find((i) => i.id === found?.itemId);
  return { item, block: found };
}

export const completeBlock = onCall(async (request) => {
  const uid = requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const id = asString(request.data?.id, 'Block');
  const { block } = await patchBlock(uid, date, id, 'complete');
  await writeLog(uid, {
    type: 'complete',
    date,
    itemId: block?.itemId,
    bucketId: block?.bucketId,
    minutes: block?.durationMinutes,
  });
  return { ok: true };
});

export const skipBlock = onCall(async (request) => {
  const uid = requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const id = asString(request.data?.id, 'Block');
  const { item, block } = await patchBlock(uid, date, id, 'skipped');
  if (item?.type === 'scheduled') {
    const loaded = await loadTenant(uid);
    const bucket = (loaded.buckets as Bucket[]).find((b) => b.id === item.bucketId);
    const toDate = skipPushDate(item, bucket, date);
    if (toDate) {
      const stamp = await stampCreated(uid, nowIso());
      await tenantRef(uid).collection('skipPushes').doc(newId()).set({
        itemId: item.id,
        fromDate: date,
        toDate,
        ...stamp,
      });
    }
  }
  await writeLog(uid, {
    type: 'skip',
    date,
    itemId: block?.itemId,
    bucketId: block?.bucketId,
    minutes: block?.durationMinutes,
  });
  return { ok: true };
});

export const startDay = onCall(async (request) => {
  const uid = requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const stamp = await stampLastUpdated(uid, nowIso());
  await tenantRef(uid)
    .collection('days')
    .doc(date)
    .set({ startedAt: nowIso(), ...stamp }, { merge: true });
  await writeLog(uid, { type: 'start_day', date });
  return { ok: true };
});

export const endDay = onCall(async (request) => {
  const uid = requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const dayRef = tenantRef(uid).collection('days').doc(date);
  const snap = await dayRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That day is not packed yet.');
  const data = snap.data() as { blocks: PackedBlock[]; dropped: PackedBlock[] };
  const loaded = await loadTenant(uid);
  const pushes = collectEndDaySkipPushes(
    date,
    data.blocks || [],
    data.dropped || [],
    loaded.items as ListItem[],
    loaded.buckets as Bucket[]
  );
  const stamp = await stampLastUpdated(uid, nowIso());
  const mark = (rows: PackedBlock[]) =>
    rows.map((b) => {
      if (b.itemId && b.status === 'pending') {
        return { ...b, status: 'skipped' as const };
      }
      if (b.itemId && b.status === 'dropped') {
        return { ...b, status: 'skipped' as const };
      }
      return b;
    });
  await dayRef.set(
    {
      blocks: mark(data.blocks || []),
      dropped: mark(data.dropped || []),
      endedAt: nowIso(),
      ...stamp,
    },
    { merge: true }
  );
  const batch = getFirestore().batch();
  for (const push of pushes) {
    const ref = tenantRef(uid).collection('skipPushes').doc(newId());
    batch.set(ref, { ...push, fromDate: date, ...(await stampCreated(uid, nowIso())) });
  }
  if (pushes.length) await batch.commit();
  await writeLog(uid, { type: 'end_day', date });
  return { ok: true };
});

