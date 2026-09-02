import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { bucketsToBackfill, PERSONAL_BUCKET, SEED_BUCKETS, SEED_ITEMS } from '../../src/domain/seed';
import type { Bucket } from '../../src/domain/types';
import { APPOINTMENTS_ID, DEFAULT_SETTINGS } from '../../src/domain/types';
import { stampCreated } from './actorAudit';

export function tenantRef(uid: string) {
  return getFirestore().collection('tenants').doc(uid);
}

/**
 * Bump when a new locked bucket or a data migration lands: tenants whose stamp
 * is older re-run the backfill once, then stop paying for it.
 */
const TENANT_SCHEMA = 2;

export async function ensureTenant(uid: string, nowIso: string): Promise<void> {
  const ref = tenantRef(uid);
  const snap = await ref.get();

  // Steady state, and by far the common case: one read and out. This used to
  // read settings and every bucket on all eight of its callers, just to find
  // nothing to backfill.
  if (snap.exists && (snap.data() as { schema?: number })?.schema === TENANT_SCHEMA) return;

  const stamp = await stampCreated(uid, nowIso);

  if (!snap.exists) {
    const batch = getFirestore().batch();
    batch.set(ref, { ...stamp, schema: TENANT_SCHEMA });
    batch.set(ref.collection('settings').doc('current'), { ...DEFAULT_SETTINGS, ...stamp });
    for (const bucket of [PERSONAL_BUCKET, ...SEED_BUCKETS]) {
      batch.set(ref.collection('buckets').doc(bucket.id), { ...bucket, ...stamp });
    }
    for (const item of SEED_ITEMS) {
      batch.set(ref.collection('items').doc(item.id), { ...item, ...stamp });
    }
    await batch.commit();
    return;
  }

  const [settingsSnap, bucketsSnap] = await Promise.all([
    ref.collection('settings').doc('current').get(),
    ref.collection('buckets').get(),
  ]);

  const batch = getFirestore().batch();

  if (!settingsSnap.exists) {
    batch.set(ref.collection('settings').doc('current'), { ...DEFAULT_SETTINGS, ...stamp });
  }

  const existing = bucketsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Bucket[];
  const missing = bucketsToBackfill(existing);

  for (const bucket of missing) {
    batch.set(ref.collection('buckets').doc(bucket.id), { ...bucket, archived: false, ...stamp }, { merge: true });
  }

  // Appointments used to be their own collection. Fold them into the new
  // bucket as scheduled items. The bucket being absent is what marks a tenant
  // as unmigrated, so this runs exactly once and costs nothing afterwards.
  if (missing.some((b) => b.id === APPOINTMENTS_ID)) {
    const legacy = await ref.collection('appointments').get();
    legacy.docs.forEach((doc, i) => {
      const row = doc.data() as { title?: string; date?: string; durationMinutes?: number };
      batch.set(ref.collection('items').doc(doc.id), {
        bucketId: APPOINTMENTS_ID,
        title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : 'Appointment',
        type: 'scheduled',
        weight: i + 1,
        durationMinutes: Number(row.durationMinutes) || 0,
        cadence: { kind: 'daily' },
        dueAt: typeof row.date === 'string' ? row.date : '',
        slot: 'morning',
        // per-appointment colour is dropped: the bucket colour applies now
        apptTime: '',
        archived: false,
        ...stamp,
      });
      batch.delete(doc.ref);
      });
  }

  if (existing.filter((b) => !b.archived).length === 0) {
    const itemsSnap = await ref.collection('items').get();
    if (itemsSnap.empty) {
      for (const item of SEED_ITEMS) {
        batch.set(ref.collection('items').doc(item.id), { ...item, ...stamp });
          }
    }
  }

  // Stamp the tenant even when nothing needed backfilling, so the next call
  // takes the single-read path above.
  batch.set(ref, { schema: TENANT_SCHEMA }, { merge: true });
  await batch.commit();
}

export async function loadTenant(uid: string) {
  const ref = tenantRef(uid);
  const [settingsSnap, bucketsSnap, itemsSnap, pushesSnap] = await Promise.all([
    ref.collection('settings').doc('current').get(),
    ref.collection('buckets').get(),
    ref.collection('items').get(),
    ref.collection('skipPushes').get(),
  ]);
  if (!settingsSnap.exists) {
    throw new HttpsError('failed-precondition', 'This account is not set up yet.');
  }
  const buckets = bucketsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((b) => !('archived' in b && b.archived));
  const items = itemsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((i) => !('archived' in i && i.archived));
  return {
    settings: settingsSnap.data(),
    buckets,
    items,
    skipPushes: pushesSnap.docs.map((d) => d.data()),
  };
}
