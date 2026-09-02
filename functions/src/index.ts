import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { canAdmitAccount, isAllowedEmail } from '../../src/domain/allowlist';

import { eventRanges, parseEventRanges } from '../../src/domain/events';
import { canDeleteBucket } from '../../src/domain/seed';
import { assignWeeklyBudgets, derivedWeeklyMinutes, itemExceedsBucketMessage, itemFitsBucket } from '../../src/domain/budget';
import { collectEndDaySkipPushes, packDay } from '../../src/domain/packDay';
import { PACK_RANGE_DAYS } from '../../src/domain/packWeek';
import { appointmentLoad, bucketSlots, capsAfterLoad, eatFromSections, isEventDay, itemWorkSlot, liveSectionState, nextSlot, parseBucketSlots, sectionCapacity, usedFromEat, workShowsItemSlot } from '../../src/domain/sections';
import { leftoverSectionBlocks, markLeftoversSkipped, skipLogBlocks, skipPushDate } from '../../src/domain/skip';
import { elapsedSince, sectionRemainingNow } from '../../src/domain/timer';
import { nextItemWeight } from '../../src/domain/order';
import type { Bucket, DaySettings, HoursMode, ListItem, PackedBlock, SkipPush, Slot, Weekday } from '../../src/domain/types';
import { APPOINTMENTS_ID, EVENTS_ID, WORK_ID } from '../../src/domain/types';
import { addDaysKey, weekStart } from '../../src/shared/dates';
import { stampCreated, stampLastUpdated } from './actorAudit';
import { asNumber, asString, authEmail, newId, requireSignedIn, requireUid } from './http';
import { ensureTenant, loadTenant, tenantRef } from './tenant';

initializeApp();

function domainCall<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    const msg = err instanceof Error ? err.message : 'Could not pack this week.';
    throw new HttpsError('failed-precondition', msg);
  }
}

function assertWeeklyFits(settings: DaySettings, buckets: Bucket[]): void {
  domainCall(() => assignWeeklyBudgets(settings, buckets));
}

function assertItemsFit(items: ListItem[], buckets: Bucket[]): void {
  const byId = new Map(buckets.map((b) => [b.id, b]));
  for (const it of items) {
    const b = byId.get(it.bucketId);
    if (!b || itemFitsBucket(it.durationMinutes, b)) continue;
    throw new HttpsError('failed-precondition', itemExceedsBucketMessage(b));
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

function firestoreDoc(row: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
}

async function writeLog(
  uid: string,
  row: { type: string; date: string; itemId?: string; bucketId?: string; minutes?: number; title?: string; section?: string }
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

function hoursModeOf(value: unknown): HoursMode {
  return value === 'day' ? 'day' : 'week';
}

function bucketFields(data: Record<string, unknown>, resolvedKind: string, resolvedName: string, resolvedWeight: number) {
  const hoursMode = hoursModeOf(data.hoursMode);
  const hoursMinutes = asNumber(data.hoursMinutes ?? data.weeklyMinutes, 'Hours');
  const days = Array.isArray(data.days) ? data.days.filter((d): d is string => typeof d === 'string') : [];
  const slots = domainCall(() => parseBucketSlots(data, resolvedKind));
  return {
    kind: resolvedKind,
    name: resolvedName,
    weight: resolvedWeight,
    hoursMode,
    hoursMinutes,
    weeklyMinutes: derivedWeeklyMinutes(hoursMode, hoursMinutes, days as Weekday[]),
    days,
    slot: slots[0],
    slots,
    color: asString(data.color, 'Color').replace(/^#/, ''),
    archived: false,
    startDate: '',
    endDate: '',
    ranges:
      resolvedKind === 'event'
        ? domainCall(() =>
            Array.isArray(data.ranges)
              ? parseEventRanges(data.ranges)
              : eventRanges({
                  startDate: typeof data.startDate === 'string' ? data.startDate : '',
                  endDate: typeof data.endDate === 'string' ? data.endDate : '',
                })
          )
        : [],
  };
}

type DayState = {
  blocks?: PackedBlock[];
  startedAt?: string;
  endedAt?: string;
  section?: Slot | 'event' | null;
  sectionStartedAt?: string | null;
  sectionRemainingMinutes?: number | null;
  pausedAt?: string | null;
  sectionExtra?: Partial<Record<Slot, number>>;
  sectionUsed?: Partial<Record<Slot, number>>;
  eventStartedAt?: string | null;
};

/**
 * Firestore caps a write batch at 500, and logs accumulate a row per
 * complete / skip / pack, so a tenant can easily hold more than that.
 * Delete in chunks rather than one batch.
 */
async function deleteAllDocs(col: FirebaseFirestore.CollectionReference): Promise<number> {
  const docs = await col.listDocuments();
  const db = getFirestore();
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + 400)) batch.delete(doc);
    await batch.commit();
  }
  return docs.length;
}

/**
 * Rebuild `days` docs for a date range.
 *
 * Three things this deliberately does NOT do, each of which it used to:
 *  - pack every day twice. It called packRange to build a result, then looped
 *    and called packDay again per date, using only the date from the first pass.
 *  - read the days one at a time. One getAll replaces N round trips.
 *  - write every day whether or not it changed. Most edits touch a handful of
 *    days; rewriting all of them bills writes and wakes every listener, which
 *    is most of why the Quest buttons felt slow.
 */
async function writePackedRange(uid: string, start: string, days: number): Promise<void> {
  const from = weekStart(start);
  await writePackedDates(
    uid,
    Array.from({ length: days }, (_, i) => addDaysKey(from, i))
  );
}

/**
 * Repack exactly these dates. Editing a date-keyed item — an appointment or an
 * event entry — changes one or two days, not the whole range, so it says so
 * rather than rebuilding six weeks.
 */
async function writePackedDates(uid: string, dates: string[]): Promise<void> {
  if (!dates.length) return;
  const loaded = await loadTenant(uid);
  const daysCol = tenantRef(uid).collection('days');
  const prevSnaps = await getFirestore().getAll(...dates.map((d) => daysCol.doc(d)));

  const batch = getFirestore().batch();
  let changed = 0;
  dates.forEach((date, i) => {
    const snap = prevSnaps[i];
    const prev = snap.exists ? (snap.data() as DayState) : null;
    const reusePrevious = Boolean(prev?.blocks && (prev.startedAt || prev.endedAt));
    const result = domainCall(() =>
      packDay(asPackInput(loaded, date, reusePrevious ? prev?.blocks : undefined))
    );
    const next = firestoreDoc({
      ...result,
      startedAt: prev?.startedAt || null,
      endedAt: prev?.endedAt || null,
      packedAt: nowIso(),
      section: prev?.section ?? null,
      sectionStartedAt: prev?.sectionStartedAt ?? null,
      sectionRemainingMinutes: prev?.sectionRemainingMinutes ?? null,
      pausedAt: prev?.pausedAt ?? null,
      sectionExtra: {},
      sectionUsed: {},
      eventStartedAt: prev?.eventStartedAt ?? null,
    });
    // packedAt changes every run, so compare everything else.
    if (prev && unchangedDay(prev as Record<string, unknown>, next)) return;
    batch.set(daysCol.doc(date), next);
    changed += 1;
  });
  if (changed) await batch.commit();
}

const VOLATILE_DAY_KEYS = new Set(['packedAt', 'created_at', 'created_by', 'last_updated_at', 'last_updated_by']);

/**
 * Key order is not stable between what Firestore returns and what we build, so
 * a plain JSON.stringify would report every day as changed and defeat the diff.
 */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const keys = Object.keys(row).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(row[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/** Same packed content, ignoring the stamps that move on every run. */
function unchangedDay(prev: Record<string, unknown>, next: Record<string, unknown>): boolean {
  const strip = (row: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(row).filter(([k]) => !VOLATILE_DAY_KEYS.has(k)));
  return stableJson(strip(prev)) === stableJson(strip(next));
}

async function writeAccessLog(row: { type: 'signup' | 'denied'; email: string; uid: string }): Promise<void> {
  await getFirestore().collection('accessLogs').doc(newId()).set({
    ...row,
    at: nowIso(),
  });
}

function assertInvitedEmail(email: string | undefined): void {
  if (isAllowedEmail(email)) return;
  throw new HttpsError('permission-denied', 'This app is invite-only.');
}

export const bootstrap = onCall(async (request) => {
  const uid = requireSignedIn(request);
  const record = await getAuth().getUser(uid);
  const providerEmail = record.providerData.map((p) => p.email).find(Boolean) || '';
  const hinted = typeof request.data?.email === 'string' ? request.data.email.trim() : '';
  let email = authEmail(request, record.email || providerEmail);
  if (!email && hinted) {
    try {
      const match = await getAuth().getUserByEmail(hinted);
      if (match.uid === uid) email = hinted;
    } catch {
      /* hinted email is not this account */
    }
  }
  const tenant = tenantRef(uid);
  const existed = (await tenant.get()).exists;
  if (!canAdmitAccount(email, existed)) {
    await writeAccessLog({ type: 'denied', email, uid });
    assertInvitedEmail(email);
  }
  await ensureTenant(uid, nowIso());
  await getAuth().setCustomUserClaims(uid, { allowlisted: true });
  if (!existed) await writeAccessLog({ type: 'signup', email, uid });
  const daysSnap = await tenant.collection('days').limit(1).get();
  if (daysSnap.empty) await writePackedRange(uid, todayKey(), PACK_RANGE_DAYS);
  return { ok: true };
});

export const wipeAccount = onCall(async (request) => {
  const uid = requireUid(request);
  const tenant = tenantRef(uid);
  const collections = ['settings', 'buckets', 'items', 'appointments', 'days', 'skipPushes', 'logs'];
  for (const col of collections) {
    await deleteAllDocs(tenant.collection(col));
  }
  await writeLog(uid, { type: 'wipe_account', date: todayKey() });
  return { ok: true };
});

/** Reroll Stats: erases the whole log. Deliberately irreversible. */
export const clearLogs = onCall(async (request) => {
  const uid = requireUid(request);
  await ensureTenant(uid, nowIso());
  const removed = await deleteAllDocs(tenantRef(uid).collection('logs'));
  return { ok: true, removed };
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
    timerSound: data.timerSound !== false,
    timerVibrate: data.timerVibrate === true,
  };
  if (patch.dayMinutes < 60) {
    throw new HttpsError('invalid-argument', 'Day length must be at least 1 hour.');
  }
  const loaded = await loadTenant(uid);
  assertWeeklyFits(patch, loaded.buckets as Bucket[]);
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
  let resolvedKind = kind;
  let resolvedName = asString(data.name, 'Name');
  let resolvedWeight = asNumber(data.weight, 'Priority');
  if (id === 'work') {
    resolvedKind = 'work';
  }
  if (id === EVENTS_ID) {
    resolvedKind = 'event';
    resolvedWeight = 0;
  }
  if (id === 'personal') {
    resolvedKind = 'personal';
    resolvedName = 'Personal';
    resolvedWeight = 0;
  }
  if (resolvedKind === 'work' && id !== 'work') {
    throw new HttpsError('invalid-argument', 'Work must keep the work id.');
  }
  const payload = bucketFields(data, resolvedKind, resolvedName, resolvedWeight);
  const loaded = await loadTenant(uid);
  const nextBuckets = [
    ...(loaded.buckets as Bucket[]).filter((b) => b.id !== id),
    { id, ...payload } as Bucket,
  ];
  assertWeeklyFits(loaded.settings as DaySettings, nextBuckets);
  assertItemsFit(loaded.items as ListItem[], nextBuckets);
  const ref = tenantRef(uid).collection('buckets').doc(id);
  const existing = await ref.get();
  const stamp = existing.exists ? await stampLastUpdated(uid, nowIso()) : await stampCreated(uid, nowIso());
  await ref.set({ ...payload, ...stamp }, { merge: true });
  return { ok: true, id };
});

export const saveBuckets = onCall(async (request) => {
  const uid = requireUid(request);
  await ensureTenant(uid, nowIso());
  const data = request.data as Record<string, unknown>;
  const loaded = await loadTenant(uid);
  const settings = loaded.settings as DaySettings;
  const personal = (data.personal || {}) as Record<string, unknown>;
  const nextSettings: DaySettings = {
    ...settings,
    morningMinutes: asNumber(personal.morningMinutes ?? settings.morningMinutes, 'Morning Routine'),
    breakMinutes: asNumber(personal.breakMinutes ?? settings.breakMinutes, 'Break'),
    eveningMinutes: asNumber(personal.eveningMinutes ?? settings.eveningMinutes, 'Evening Routine'),
  };
  const rows = Array.isArray(data.buckets) ? data.buckets : [];
  const nextBuckets: Bucket[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : newId();
    let resolvedKind = asString(row.kind || 'weighted', 'Kind');
    let resolvedName = asString(row.name, 'Name');
    let resolvedWeight = asNumber(row.weight, 'Priority');
    if (id === 'work') {
      resolvedKind = 'work';
      resolvedWeight = 1;
    }
    if (id === EVENTS_ID) {
      resolvedKind = 'event';
      resolvedWeight = 0;
    }
    if (id === 'personal') {
      resolvedKind = 'personal';
      resolvedName = 'Personal';
      resolvedWeight = 0;
    }
    const payload = bucketFields(row, resolvedKind, resolvedName, resolvedWeight);
    nextBuckets.push({ id, ...payload } as Bucket);
  }
  const kept = (loaded.buckets as Bucket[]).filter((b) => b.archived || !nextBuckets.some((n) => n.id === b.id));
  assertWeeklyFits(nextSettings, [...kept.filter((b) => !b.archived), ...nextBuckets]);
  assertItemsFit(loaded.items as ListItem[], nextBuckets);
  const now = nowIso();
  const stamp = await stampLastUpdated(uid, now);
  const existingIds = new Set((loaded.buckets as Bucket[]).map((b) => b.id));
  const batch = getFirestore().batch();
  batch.set(tenantRef(uid).collection('settings').doc('current'), { ...nextSettings, ...stamp }, { merge: true });
  if (typeof personal.color === 'string' && personal.color.trim()) {
    batch.set(
      tenantRef(uid).collection('buckets').doc('personal'),
      { color: personal.color.replace(/^#/, ''), kind: 'personal', name: 'Personal', archived: false, ...stamp },
      { merge: true }
    );
  }
  for (const bucket of nextBuckets) {
    const { id, ...payload } = bucket;
    const ref = tenantRef(uid).collection('buckets').doc(id);
    const rowStamp = existingIds.has(id) ? stamp : await stampCreated(uid, now);
    batch.set(ref, { ...payload, ...rowStamp }, { merge: true });
  }
  await batch.commit();
  await writePackedRange(uid, todayKey(), PACK_RANGE_DAYS);
  return { ok: true };
});

export const archiveBucket = onCall(async (request) => {
  const uid = requireUid(request);
  const id = asString(request.data?.id, 'Bucket');
  const snap = await tenantRef(uid).collection('buckets').doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Bucket not found.');
  const bucket = { id, ...(snap.data() as object) } as Bucket;
  if (!canDeleteBucket(bucket)) {
    throw new HttpsError('failed-precondition', 'This bucket cannot be removed.');
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
  await writePackedRange(uid, todayKey(), PACK_RANGE_DAYS);
  return { ok: true };
});

/**
 * Dates a date-keyed item affects. Appointments and events pack on their dueAt
 * and nowhere else, so moving one touches the old date and the new one. Any
 * other item runs on a cadence and can land anywhere in the range.
 */
function datesForItemEdit(
  bucket: Bucket | undefined,
  previousDueAt: string | undefined,
  nextDueAt: string | undefined
): string[] | null {
  const dated =
    bucket &&
    (bucket.kind === 'event' ||
      bucket.id === EVENTS_ID ||
      bucket.kind === 'appointment' ||
      bucket.id === APPOINTMENTS_ID);
  if (!dated) return null;
  const out = [previousDueAt, nextDueAt].filter((d): d is string => Boolean(d));
  return out.length ? [...new Set(out)] : [];
}

export const upsertItem = onCall(async (request) => {
  const uid = requireUid(request);
  await ensureTenant(uid, nowIso());
  const data = request.data as Record<string, unknown>;
  const id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : newId();
  const durationMinutes = asNumber(data.durationMinutes ?? 0, 'Duration');
  if (durationMinutes < 0) {
    throw new HttpsError('invalid-argument', 'Duration cannot be negative.');
  }
  const ref = tenantRef(uid).collection('items').doc(id);
  const existing = await ref.get();
  const storedWeight = existing.exists ? Number((existing.data() as { weight?: unknown }).weight) : NaN;
  const bucketId = asString(data.bucketId, 'Bucket');
  const eventItem = bucketId === EVENTS_ID;
  const apptItem = bucketId === APPOINTMENTS_ID;
  const loaded = await loadTenant(uid);
  const bucket = (loaded.buckets as Bucket[]).find((b) => b.id === bucketId);
  if (!eventItem) {
    if (!bucket) throw new HttpsError('not-found', 'That bucket was not found.');
    if (!itemFitsBucket(durationMinutes, bucket)) {
      throw new HttpsError('invalid-argument', itemExceedsBucketMessage(bucket));
    }
  }
  // Events and appointments are both date-keyed: they pack on their due date
  // and never run on a cadence.
  const type = eventItem || apptItem ? 'scheduled' : asString(data.type, 'Type');
  const dueAt = type === 'scheduled' ? asString(data.dueAt, 'Date') : '';
  const weight = existing.exists
    ? Number.isFinite(storedWeight)
      ? storedWeight
      : 1
    : nextItemWeight(loaded.items as ListItem[], bucketId);
  const payload: Record<string, unknown> = {
    bucketId,
    title: asString(data.title, 'Title'),
    type,
    weight,
    durationMinutes,
    cadence: eventItem || apptItem ? { kind: 'daily' } : data.cadence || { kind: 'daily' },
    dueAt,
    archived: false,
    // Display only. Never read by the packer.
    apptTime: apptItem && typeof data.apptTime === 'string' ? data.apptTime.trim().slice(0, 40) : '',
  };
  const isWork = Boolean(bucket && (bucket.kind === 'work' || bucket.id === WORK_ID));
  if (isWork && bucket) {
    if (workShowsItemSlot(bucket)) {
      const allowed = bucketSlots(bucket);
      const slot = data.slot;
      if (slot !== 'morning' && slot !== 'midday' && slot !== 'evening') {
        throw new HttpsError('invalid-argument', 'Pick a Work section.');
      }
      if (!allowed.includes(slot)) {
        throw new HttpsError('invalid-argument', 'Pick a Work section.');
      }
      payload.slot = slot;
    } else {
      payload.slot = itemWorkSlot({}, bucket);
    }
  } else {
    payload.slot = null;
  }
  const stamp = existing.exists ? await stampLastUpdated(uid, nowIso()) : await stampCreated(uid, nowIso());
  const previousDueAt = existing.exists ? (existing.data() as { dueAt?: string }).dueAt : undefined;
  await ref.set({ ...payload, ...stamp }, { merge: true });
  const scoped = datesForItemEdit(bucket, previousDueAt, dueAt || undefined);
  if (scoped) await writePackedDates(uid, scoped);
  else await writePackedRange(uid, todayKey(), PACK_RANGE_DAYS);
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
  await writePackedRange(uid, todayKey(), PACK_RANGE_DAYS);
  return { ok: true };
});

export const archiveItem = onCall(async (request) => {
  const uid = requireUid(request);
  const id = asString(request.data?.id, 'Item');
  const stamp = await stampLastUpdated(uid, nowIso());
  const itemRef = tenantRef(uid).collection('items').doc(id);
  const before = await itemRef.get();
  const row = before.exists ? (before.data() as { bucketId?: string; dueAt?: string }) : undefined;
  await itemRef.set({ archived: true, ...stamp }, { merge: true });
  const loaded = await loadTenant(uid);
  const bucket = (loaded.buckets as Bucket[]).find((b) => b.id === row?.bucketId);
  const scoped = datesForItemEdit(bucket, row?.dueAt, undefined);
  if (scoped) await writePackedDates(uid, scoped);
  else await writePackedRange(uid, todayKey(), PACK_RANGE_DAYS);
  return { ok: true };
});

export const resetBucket = onCall(async (request) => {
  const uid = requireUid(request);
  const id = asString(request.data?.id, 'Bucket');
  const snap = await tenantRef(uid).collection('buckets').doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Bucket not found.');
  const loaded = await loadTenant(uid);
  const items = (loaded.items as ListItem[]).filter((i) => i.bucketId === id && !i.archived);
  const stamp = await stampLastUpdated(uid, nowIso());
  const batch = getFirestore().batch();
  for (const item of items) {
    batch.set(tenantRef(uid).collection('items').doc(item.id), { archived: true, ...stamp }, { merge: true });
  }
  batch.set(tenantRef(uid).collection('buckets').doc(id), {
    hoursMode: 'week',
    hoursMinutes: 0,
    weeklyMinutes: 0,
    ...stamp,
  }, { merge: true });
  await batch.commit();
  await writePackedRange(uid, todayKey(), PACK_RANGE_DAYS);
  await writeLog(uid, { type: 'reset_bucket', date: todayKey(), bucketId: id });
  return { ok: true };
});

function asPackInput(
  loaded: Awaited<ReturnType<typeof loadTenant>>,
  date: string,
  previous?: PackedBlock[],
  extra?: Partial<Record<Slot, number>>,
  used?: Partial<Record<Slot, number>>
) {
  return {
    date,
    settings: loaded.settings as DaySettings,
    buckets: loaded.buckets as Bucket[],
    items: loaded.items as ListItem[],
    skipPushes: loaded.skipPushes as SkipPush[],
    sectionExtra: extra,
    sectionUsed: used,
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
  const days = Number(request.data?.days) || PACK_RANGE_DAYS;
  await writePackedRange(uid, start, days);
  return { ok: true };
});

export const resetToday = onCall(async (request) => {
  const uid = requireUid(request);
  await ensureTenant(uid, nowIso());
  const date = asString(request.data?.date || todayKey(), 'Date');
  const loaded = await loadTenant(uid);
  const result = domainCall(() => packDay(asPackInput(loaded, date)));
  const stamp = await stampLastUpdated(uid, nowIso());
  await tenantRef(uid)
    .collection('days')
    .doc(date)
    .set(
      firestoreDoc({
        ...result,
        startedAt: null,
        endedAt: null,
        packedAt: nowIso(),
        section: null,
        sectionStartedAt: null,
        sectionRemainingMinutes: null,
        pausedAt: null,
        sectionExtra: {},
        sectionUsed: {},
        eventStartedAt: null,
        ...stamp,
      })
    );
  await writeLog(uid, { type: 'reset_today', date });
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

/**
 * A cancelled appointment hands its hours back. Repack the day so other work
 * can claim the freed time, and credit the running section timer with whatever
 * that section got back — the countdown has to agree with the new capacity.
 */
async function refundSkippedAppointment(uid: string, date: string): Promise<void> {
  const dayRef = tenantRef(uid).collection('days').doc(date);
  const snap = await dayRef.get();
  if (!snap.exists) return;
  const data = snap.data() as DayState & { blocks: PackedBlock[]; dropped: PackedBlock[] };
  const loaded = await loadTenant(uid);
  const settings = loaded.settings as DaySettings;
  const base = sectionCapacity(settings, data.sectionExtra || {}, data.sectionUsed);
  const before = capsAfterLoad(base, appointmentLoad((data.blocks || []).map((b) => ({ ...b, status: 'pending' }))));
  const after = capsAfterLoad(base, appointmentLoad(data.blocks || []));
  const result = domainCall(() =>
    packDay(asPackInput(loaded, date, [...(data.blocks || []), ...(data.dropped || [])], data.sectionExtra, data.sectionUsed))
  );
  const section = data.section && data.section !== 'event' ? data.section : null;
  const freed = section ? Math.max(0, after[section] - before[section]) : 0;
  const stamp = await stampLastUpdated(uid, nowIso());
  await dayRef.set(
    firestoreDoc({
      ...result,
      ...(freed > 0
        ? { sectionRemainingMinutes: (data.sectionRemainingMinutes || 0) + freed }
        : {}),
      packedAt: nowIso(),
      ...stamp,
    }),
    { merge: true }
  );
}

export const completeBlock = onCall(async (request) => {
  const uid = requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const id = asString(request.data?.id, 'Block');
  const { block } = await patchBlock(uid, date, id, 'complete');
  const morning = block?.title === 'Morning Routine' || String(block?.id || '').endsWith(':morning');
  if (morning) {
    const loaded = await loadTenant(uid);
    const events = (loaded.buckets as Bucket[]).find((b) => b.id === EVENTS_ID || b.kind === 'event');
    await beginSection(uid, date, isEventDay(events, date) ? 'event' : 'morning');
    await writeLog(uid, { type: 'start_day', date });
  }
  await writeLog(uid, {
    type: 'complete',
    date,
    itemId: block?.itemId,
    bucketId: block?.bucketId,
    minutes: block?.durationMinutes,
    title: block?.title,
  });
  return { ok: true };
});

export const skipBlock = onCall(async (request) => {
  const uid = requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const id = asString(request.data?.id, 'Block');
  const { item, block } = await patchBlock(uid, date, id, 'skipped');
  if (block?.kind === 'appointment') await refundSkippedAppointment(uid, date);
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
    title: block?.title,
  });
  return { ok: true };
});

async function beginSection(uid: string, date: string, section: Slot | 'event'): Promise<void> {
  const dayRef = tenantRef(uid).collection('days').doc(date);
  const [settingsSnap, snap, stamp] = await Promise.all([
    tenantRef(uid).collection('settings').doc('current').get(),
    dayRef.get(),
    stampLastUpdated(uid, nowIso()),
  ]);
  if (!settingsSnap.exists) throw new HttpsError('failed-precondition', 'This account is not set up yet.');
  const settings = settingsSnap.data() as DaySettings;
  const prev = (snap.exists ? snap.data() : {}) as DayState;
  if (section === 'event') {
    await dayRef.set(
      {
        startedAt: prev.startedAt || nowIso(),
        endedAt: null,
        section: 'event',
        eventStartedAt: nowIso(),
        sectionStartedAt: nowIso(),
        sectionRemainingMinutes: 0,
        pausedAt: null,
        ...stamp,
      },
      { merge: true }
    );
    return;
  }
  const fresh = !prev.startedAt;
  const extra = fresh ? {} : prev.sectionExtra || {};
  const used = fresh ? {} : prev.sectionUsed || {};
  const blocks = (prev.blocks || []).map((b) =>
    b.title === 'Morning Routine' || String(b.id || '').endsWith(':morning') ? { ...b, status: 'complete' as const } : b
  );
  // The timer counts down the time actually available, so it has to subtract
  // appointments the same way the packer does — including what spills forward.
  const caps = capsAfterLoad(sectionCapacity(settings, extra, used), appointmentLoad(blocks));
  await dayRef.set(
    {
      startedAt: prev.startedAt || nowIso(),
      endedAt: null,
      section,
      sectionStartedAt: nowIso(),
      sectionRemainingMinutes: caps[section],
      pausedAt: null,
      sectionExtra: extra,
      sectionUsed: used,
      ...(blocks.length ? { blocks } : {}),
      ...stamp,
    },
    { merge: true }
  );
}

export const startDay = onCall(async (request) => {
  const uid = requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const eventsSnap = await tenantRef(uid).collection('buckets').doc(EVENTS_ID).get();
  const events = eventsSnap.exists ? ({ id: EVENTS_ID, ...eventsSnap.data() } as Bucket) : undefined;
  await beginSection(uid, date, isEventDay(events, date) ? 'event' : 'morning');
  await writeLog(uid, { type: 'start_day', date });
  return { ok: true };
});

export const startNext = onCall(async (request) => {
  const uid = requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const dayRef = tenantRef(uid).collection('days').doc(date);
  const snap = await dayRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That day is not packed yet.');
  const data = snap.data() as DayState & { blocks: PackedBlock[]; dropped: PackedBlock[] };
  const section = data.section;
  if (!section || section === 'event') throw new HttpsError('failed-precondition', 'No section to leave.');
  const next = nextSlot(section);
  const stamp = await stampLastUpdated(uid, nowIso());
  const leftovers = leftoverSectionBlocks(data.blocks || [], data.dropped || [], section);
  const blocks = markLeftoversSkipped(data.blocks || [], leftovers);
  const dropped = markLeftoversSkipped(data.dropped || [], leftovers);
  const loaded = await loadTenant(uid);
  const pushes = collectEndDaySkipPushes(
    date,
    leftovers,
    leftovers,
    loaded.items as ListItem[],
    loaded.buckets as Bucket[]
  );
  const extra = { ...(data.sectionExtra || {}) };
  const used = data.sectionUsed || {};
  const caps = capsAfterLoad(
    sectionCapacity(loaded.settings as DaySettings, extra, used),
    appointmentLoad(blocks)
  );
  async function writeAutoSkips(): Promise<void> {
    for (const b of skipLogBlocks(leftovers)) {
      await writeLog(uid, {
        type: 'skip',
        date,
        itemId: b.itemId,
        bucketId: b.bucketId,
        minutes: b.durationMinutes,
        title: b.title,
      });
    }
  }
  if (!next || caps[next] <= 0) {
    await dayRef.set({ blocks, dropped, endedAt: nowIso(), pausedAt: null, section: null, ...stamp }, { merge: true });
    await writeSkipPushes(uid, date, pushes);
    await writeAutoSkips();
    await writeLog(uid, { type: 'end_day', date });
    return { ok: true };
  }
  const leftoverIds = new Set(leftovers.map((b) => b.itemId).filter(Boolean));
  const result = domainCall(() => packDay(asPackInput(loaded, date, [...blocks, ...dropped], extra, used)));
  const merged = result.blocks.map((b) => {
    const prev = blocks.find((p) => p.itemId && p.itemId === b.itemId);
    return prev && (prev.status === 'complete' || prev.status === 'skipped') ? { ...b, status: prev.status } : b;
  });
  await dayRef.set(
    firestoreDoc({
      ...result,
      blocks: merged,
      dropped: result.dropped.map((b) =>
        b.itemId && leftoverIds.has(b.itemId) ? { ...b, status: 'skipped' as const } : b
      ),
      startedAt: data.startedAt,
      section: next,
      sectionExtra: extra,
      sectionUsed: used,
      sectionStartedAt: nowIso(),
      sectionRemainingMinutes: caps[next],
      pausedAt: null,
      packedAt: nowIso(),
      ...stamp,
    }),
    { merge: true }
  );
  await writeSkipPushes(uid, date, pushes);
  await writeAutoSkips();
  await writeLog(uid, { type: 'start_next', date, section: next });
  return { ok: true };
});

export const startBreak = onCall(async (request) => {
  const uid = requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const dayRef = tenantRef(uid).collection('days').doc(date);
  const snap = await dayRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That day is not packed yet.');
  const data = snap.data() as DayState;
  const remaining = sectionRemainingNow(data.sectionRemainingMinutes || 0, data.sectionStartedAt, data.pausedAt, Date.now());
  const stamp = await stampLastUpdated(uid, nowIso());
  await dayRef.set({ pausedAt: nowIso(), sectionRemainingMinutes: remaining, ...stamp }, { merge: true });
  await writeLog(uid, { type: 'start_break', date });
  return { ok: true };
});

export const endBreak = onCall(async (request) => {
  const uid = requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const stamp = await stampLastUpdated(uid, nowIso());
  await tenantRef(uid).collection('days').doc(date).set({ pausedAt: null, sectionStartedAt: nowIso(), ...stamp }, { merge: true });
  await writeLog(uid, { type: 'end_break', date });
  return { ok: true };
});

async function writeSkipPushes(uid: string, date: string, pushes: SkipPush[]): Promise<void> {
  if (!pushes.length) return;
  const stamp = await stampCreated(uid, nowIso());
  const batch = getFirestore().batch();
  for (const push of pushes) {
    batch.set(tenantRef(uid).collection('skipPushes').doc(newId()), { ...push, fromDate: date, ...stamp });
  }
  await batch.commit();
}

export const endDay = onCall(async (request) => {
  const uid = requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const dayRef = tenantRef(uid).collection('days').doc(date);
  const snap = await dayRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That day is not packed yet.');
  const data = snap.data() as DayState & { blocks: PackedBlock[]; dropped: PackedBlock[] };
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
      if (b.itemId && (b.status === 'pending' || b.status === 'dropped')) {
        return { ...b, status: 'skipped' as const };
      }
      return b;
    });
  const evening = (data.blocks || []).map((b) =>
    b.title === 'Evening Routine' || String(b.id || '').endsWith(':evening') ? { ...b, status: 'complete' as const } : b
  );
  const eventMinutes =
    data.section === 'event' && data.eventStartedAt ? Math.round(elapsedSince(data.eventStartedAt, Date.now())) : 0;
  await dayRef.set(
    {
      blocks: mark(evening),
      dropped: mark(data.dropped || []),
      endedAt: nowIso(),
      pausedAt: null,
      section: null,
      sectionStartedAt: null,
      sectionRemainingMinutes: null,
      eventStartedAt: null,
      ...stamp,
    },
    { merge: true }
  );
  await writeSkipPushes(uid, date, pushes);
  if (eventMinutes) await writeLog(uid, { type: 'event_hours', date, minutes: eventMinutes });
  await writeLog(uid, { type: 'end_day', date });
  return { ok: true };
});

