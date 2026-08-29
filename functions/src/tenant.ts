import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { bucketsToBackfill, PERSONAL_BUCKET, SEED_BUCKETS, SEED_ITEMS } from '../../src/domain/seed';
import type { Bucket } from '../../src/domain/types';
import { DEFAULT_SETTINGS } from '../../src/domain/types';
import { stampCreated } from './actorAudit';

export function tenantRef(uid: string) {
  return getFirestore().collection('tenants').doc(uid);
}

export async function ensureTenant(uid: string, nowIso: string): Promise<void> {
  const ref = tenantRef(uid);
  const snap = await ref.get();
  const stamp = await stampCreated(uid, nowIso);

  if (!snap.exists) {
    const batch = getFirestore().batch();
    batch.set(ref, { ...stamp });
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
  let needsCommit = false;

  if (!settingsSnap.exists) {
    batch.set(ref.collection('settings').doc('current'), { ...DEFAULT_SETTINGS, ...stamp });
    needsCommit = true;
  }

  const existing = bucketsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Bucket[];
  const missing = bucketsToBackfill(existing);

  for (const bucket of missing) {
    batch.set(ref.collection('buckets').doc(bucket.id), { ...bucket, archived: false, ...stamp }, { merge: true });
    needsCommit = true;
  }

  if (existing.filter((b) => !b.archived).length === 0) {
    const itemsSnap = await ref.collection('items').get();
    if (itemsSnap.empty) {
      for (const item of SEED_ITEMS) {
        batch.set(ref.collection('items').doc(item.id), { ...item, ...stamp });
        needsCommit = true;
      }
    }
  }

  if (needsCommit) await batch.commit();
}

export async function loadTenant(uid: string) {
  const ref = tenantRef(uid);
  const [settingsSnap, bucketsSnap, itemsSnap, apptsSnap, pushesSnap] = await Promise.all([
    ref.collection('settings').doc('current').get(),
    ref.collection('buckets').get(),
    ref.collection('items').get(),
    ref.collection('appointments').get(),
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
    appointments: apptsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })),
    skipPushes: pushesSnap.docs.map((d) => d.data()),
  };
}
