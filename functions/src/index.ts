import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { beforeUserCreated } from 'firebase-functions/v2/identity';


import { eventRangeName, eventRanges, expiredEventRanges, parseEventRanges } from '../../src/domain/events';
import { canDeleteBucket } from '../../src/domain/seed';
import { assignWeeklyBudgets, derivedWeeklyMinutes, itemExceedsBucketMessage, itemFitsBucket } from '../../src/domain/budget';
import { formatDuration } from '../../src/domain/duration';
import {
  asPackInput,
  DayFlowError,
  planComplete,
  planFinishDay,
  planRepack,
  planRespawn,
  planSkip,
  planStartDay,
  planStartNext,
  stampLogTimes,
  type DayPlan,
  type DayState,
  type Now,
  type TenantData,
} from '../../src/domain/dayFlow';
import { applyDelta } from '../../src/domain/score';
import { PACK_RANGE_DAYS } from '../../src/domain/packWeek';
import { bucketSlots, eatFromSections, itemWorkSlot, parseBucketSlots, sectionSplitFits, usedFromEat, workShowsItemSlot } from '../../src/domain/sections';
import { sectionRemainingNow } from '../../src/domain/timer';
import { nextItemWeight } from '../../src/domain/order';
import type { Bucket, DaySettings, HoursMode, ListItem, PackedBlock, SkipPush, Slot, Weekday } from '../../src/domain/types';
import { APPOINTMENTS_ID, EVENTS_ID, SLOTS, WORK_ID } from '../../src/domain/types';
import { addDaysKey, weekStart } from '../../src/shared/dates';
import { stampCreated, stampLastUpdated } from './actorAudit';
import { asNumber, asString, authEmail, newId, requireSignedIn, requireUid } from './http';
import { ensureAllowlistDoc, isInvited } from './allowlist';
import { ensureTenant, loadTenant, tenantRef } from './tenant';

initializeApp();

// A spammed endpoint should cost a capped amount, not an open-ended one. Well
// above what a handful of invited users need, well below a runaway bill.
setGlobalOptions({ maxInstances: 10 });

function domainCall<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    if (err instanceof DayFlowError) throw new HttpsError(err.code, err.message);
    const msg = err instanceof Error ? err.message : 'Could not pack this week.';
    throw new HttpsError('failed-precondition', msg);
  }
}

/**
 * The three stretches, or nothing at all. Absent means an even split, which is
 * what every account had before the fields existed — so leaving it off has to
 * stay meaningful rather than collapsing to three zeroes.
 */
function parseSectionSplit(value: unknown): Record<Slot, number> | null {
  if (value == null || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const out = {} as Record<Slot, number>;
  for (const slot of SLOTS) {
    const n = Number(raw[slot]);
    if (!Number.isFinite(n) || n < 0) {
      throw new HttpsError('invalid-argument', `${slot} must be a number of minutes.`);
    }
    out[slot] = Math.round(n);
  }
  return out;
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
  const slots = domainCall(() => parseBucketSlots(data, resolvedName));
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
 * Delete events whose last day has passed, and everything scheduled inside
 * them. Decided as delete rather than archive: no history is kept for events,
 * so archiving would only accumulate rows nothing ever reads.
 *
 * Runs off the tenant data a repack has already loaded, and writes only when
 * there is something to remove, so the common case costs nothing.
 */
async function pruneExpiredEvents(
  uid: string,
  loaded: Awaited<ReturnType<typeof loadTenant>>
): Promise<Awaited<ReturnType<typeof loadTenant>>> {
  const buckets = loaded.buckets as Bucket[];
  const events = buckets.find((b) => !b.archived && (b.kind === 'event' || b.id === EVENTS_ID));
  if (!events) return loaded;
  const ranges = eventRanges(events);
  const expired = expiredEventRanges(ranges, todayKey());
  if (!expired.length) return loaded;

  const gone = new Set(expired.map((r) => r.id));
  const kept = ranges.filter((r) => !gone.has(r.id));
  const items = loaded.items as ListItem[];
  const doomed = items.filter(
    (it) => it.bucketId === events.id && it.eventId && gone.has(it.eventId)
  );

  const batch = getFirestore().batch();
  const stamp = await stampLastUpdated(uid, nowIso());
  batch.set(tenantRef(uid).collection('buckets').doc(events.id), { ranges: kept, ...stamp }, { merge: true });
  for (const it of doomed) batch.delete(tenantRef(uid).collection('items').doc(it.id));
  await batch.commit();

  return {
    ...loaded,
    buckets: buckets.map((b) => (b.id === events.id ? { ...b, ranges: kept } : b)),
    items: items.filter((it) => !doomed.some((d) => d.id === it.id)),
  };
}

/** One actor lookup per request: the created stamp, and its last_updated half. */
async function actorStamps(uid: string, iso: string) {
  const created = await stampCreated(uid, iso);
  const updated = Object.fromEntries(Object.entries(created).filter(([k]) => k.startsWith('last_updated')));
  return { created, updated };
}

function nowOf(): Now {
  const ms = Date.now();
  return { iso: new Date(ms).toISOString(), ms };
}

/** Replace exactly the planned fields; nested maps (sectionExtra) are replaced, not merged. */
function setDay(
  tx: FirebaseFirestore.Transaction,
  ref: FirebaseFirestore.DocumentReference,
  patch: object,
  stamp: Record<string, string>
): void {
  const data = firestoreDoc({ ...patch, ...stamp });
  tx.set(ref, data, { mergeFields: Object.keys(data) });
}

/**
 * Repack exactly these dates. Editing a date-keyed item — an appointment or an
 * event entry — changes one or two days, not the whole range, so it says so
 * rather than rebuilding six weeks.
 */
async function writePackedDates(uid: string, dates: string[]): Promise<void> {
  if (!dates.length) return;
  let loaded = await loadTenant(uid);
  loaded = await pruneExpiredEvents(uid, loaded);
  const tenant = loaded as unknown as TenantData;
  const now = nowOf();
  const { created, updated } = await actorStamps(uid, now.iso);
  const daysCol = tenantRef(uid).collection('days');
  // Read and write in one transaction, so a repack cannot write stale blocks
  // over a Complete that landed in between.
  await getFirestore().runTransaction(async (tx) => {
    const snaps = await tx.getAll(...dates.map((d) => daysCol.doc(d)));
    dates.forEach((date, i) => {
      const prev = snaps[i].exists ? (snaps[i].data() as DayState) : null;
      const plan = domainCall(() => planRepack(prev, tenant, date, now));
      if (plan.day) setDay(tx, daysCol.doc(date), plan.day, prev ? updated : created);
    });
  });
}

/**
 * Run one day transition. The planner is pure; this reads the day, applies the
 * plan and commits the day, its log rows, skip pushes and score together, so a
 * double tap or a racing repack sees either all of it or none of it.
 */
async function mutateDay(
  uid: string,
  date: string,
  planner: (prev: DayState | null, tenant: TenantData, now: Now) => DayPlan
): Promise<DayPlan> {
  const tenant = (await loadTenant(uid)) as unknown as TenantData;
  const now = nowOf();
  const { created, updated } = await actorStamps(uid, now.iso);
  const root = tenantRef(uid);
  const dayRef = root.collection('days').doc(date);
  const scoreRef = root.collection('score').doc('current');
  return getFirestore().runTransaction(async (tx) => {
    const daySnap = await tx.get(dayRef);
    const prev = daySnap.exists ? (daySnap.data() as DayState) : null;
    const plan = domainCall(() => planner(prev, tenant, now));
    if (!plan.day) return plan;

    const scoreSnap = plan.scoreDelta ? await tx.get(scoreRef) : null;
    const staleLogs = plan.deletePushesFrom ? await tx.get(root.collection('logs').where('date', '==', date)) : null;
    const stalePushes = plan.deletePushesFrom
      ? await tx.get(root.collection('skipPushes').where('fromDate', '==', plan.deletePushesFrom))
      : null;

    setDay(tx, dayRef, plan.day, prev ? updated : created);
    for (const row of stampLogTimes(plan.logs, now)) {
      tx.set(root.collection('logs').doc(newId()), firestoreDoc({ ...row, ...created }));
    }
    for (const push of plan.pushes) {
      tx.set(root.collection('skipPushes').doc(newId()), firestoreDoc({ ...push, ...created }));
    }
    if (scoreSnap) {
      const total = scoreSnap.exists ? Number((scoreSnap.data() as { total?: unknown }).total) : 0;
      tx.set(
        scoreRef,
        { total: applyDelta(total, plan.scoreDelta), updatedAt: now.iso, ...(scoreSnap.exists ? updated : created) },
        { merge: true }
      );
    }
    // Today's own complete / skip rows go with a Respawn, so Stats agrees with the day.
    staleLogs?.docs.forEach((doc) => {
      const type = (doc.data() as { type?: string }).type;
      if (type === 'complete' || type === 'skip') tx.delete(doc.ref);
    });
    stalePushes?.docs.forEach((doc) => tx.delete(doc.ref));
    return plan;
  });
}

async function writeAccessLog(row: { type: 'signup' | 'denied'; email: string; uid: string }): Promise<void> {
  await getFirestore().collection('accessLogs').doc(newId()).set({
    ...row,
    at: nowIso(),
  });
}

/** The one refusal a stranger ever sees. Deliberately says nothing useful. */
function refuseUninvited(): never {
  throw new HttpsError('permission-denied', 'This app is invite-only.');
}

/**
 * Denials are worth seeing, but writing one per attempt turns a spammed sign-in
 * into a billing problem. Each instance remembers who it has already turned
 * away, so a hammered endpoint writes once rather than thousands of times.
 */
const deniedSeen = new Set<string>();

async function logDenialOnce(email: string, uid: string): Promise<void> {
  const key = `${uid}:${email}`;
  if (deniedSeen.has(key)) return;
  // Bounded: an instance that has seen a lot of strangers forgets the oldest.
  if (deniedSeen.size > 500) deniedSeen.clear();
  deniedSeen.add(key);
  await writeAccessLog({ type: 'denied', email, uid });
}

/**
 * The door. A non-invited Google account is refused here, before Firebase
 * creates the user, so strangers never reach bootstrap and never appear in the
 * account list at all. Everything after this is a second line rather than the
 * only one — bootstrap still checks, in case this trigger is ever disabled.
 *
 * Fails open to the seed list rather than closed: an unreadable allowlist must
 * not lock the owner out of their own app.
 */
export const gateSignUp = beforeUserCreated(async (event) => {
  const email = event.data?.email;
  if (await isInvited(email)) return;
  throw new HttpsError('permission-denied', 'This app is invite-only.');
});

/**
 * `invoker: 'public'` is not optional, and not a loosening of anything.
 *
 * Cloud Run's IAM cannot validate a Firebase ID token, so every callable
 * authenticates in its own body instead — which is why all 20 of these carry
 * the allUsers invoker binding. bootstrap was somehow deployed without it, and
 * so was rejected by the front end with an HTML 403 before a single line here
 * ran. Nothing authenticated it; nothing could reach it.
 *
 * That is worth stating because it was invisible: no error ever appeared in
 * this function's logs, precisely because the function never ran. What it broke
 * was everything downstream — setCustomUserClaims never fired, so no account
 * ever carried the allowlisted claim, so the client re-bootstrapped on every
 * load, and a new tenant was never created at sign-in. Invited accounts got
 * their buckets only when some later callable happened to run ensureTenant.
 *
 * Redeploying does not restore the binding. Removing this option silently
 * reintroduces all of the above.
 */
export const bootstrap = onCall({ invoker: 'public' }, async (request) => {
  const uid = requireSignedIn(request);
  const tenant = tenantRef(uid);

  // Cheapest path first. A spammed sign-in should cost nothing, so the token's
  // own email is checked against the cached invite list before any Auth or
  // Firestore read happens. Only a plausible caller gets the expensive lookups.
  const tokenEmail = authEmail(request, '');
  if (tokenEmail && !(await isInvited(tokenEmail))) {
    await logDenialOnce(tokenEmail, uid);
    refuseUninvited();
  }

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
  const existed = (await tenant.get()).exists;
  if (!existed && !(await isInvited(email))) {
    await logDenialOnce(email, uid);
    refuseUninvited();
  }
  await ensureTenant(uid, nowIso());
  await ensureAllowlistDoc();
  await getAuth().setCustomUserClaims(uid, { allowlisted: true });
  if (!existed) await writeAccessLog({ type: 'signup', email, uid });
  const daysSnap = await tenant.collection('days').limit(1).get();
  if (daysSnap.empty) await writePackedRange(uid, todayKey(), PACK_RANGE_DAYS);
  return { ok: true };
});

export const wipeAccount = onCall(async (request) => {
  const uid = await requireUid(request);
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
  const uid = await requireUid(request);
  await ensureTenant(uid, nowIso());
  // Rerolling mid-day would erase the day's own completes and skips while it is
  // still running, leaving the day and its record disagreeing. Enforced here
  // rather than only in the UI, where it would be a suggestion.
  const today = await tenantRef(uid).collection('days').doc(todayKey()).get();
  const day = today.exists ? (today.data() as DayState) : null;
  if (day?.startedAt && !day.endedAt) {
    throw new HttpsError('failed-precondition', 'Finish the day before rerolling Stats.');
  }
  const removed = await deleteAllDocs(tenantRef(uid).collection('logs'));
  // Rerolling starts the score over too — it is the same history.
  await tenantRef(uid).collection('score').doc('current').set({ total: 0, updatedAt: nowIso() }, { merge: true });
  return { ok: true, removed };
});

export const saveSettings = onCall(async (request) => {
  const uid = await requireUid(request);
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
    personalCountsAsDay: data.personalCountsAsDay === true,
    sectionSplit: parseSectionSplit(data.sectionSplit),
  };
  if (patch.dayMinutes < 60) {
    throw new HttpsError('invalid-argument', 'Day length must be at least 1 hour.');
  }
  // Day Length is the truth, so the three stretches have to add back to it.
  // Refused here rather than quietly re-split, because silently moving time a
  // person just typed is worse than telling them the sum is wrong.
  if (patch.sectionSplit && !sectionSplitFits(patch.sectionSplit, patch.dayMinutes)) {
    const total = SLOTS.reduce((sum, slot) => sum + (patch.sectionSplit?.[slot] || 0), 0);
    throw new HttpsError(
      'invalid-argument',
      `Morning, midday and evening add up to ${formatDuration(total)}, not the ${formatDuration(patch.dayMinutes)} day.`
    );
  }
  const loaded = await loadTenant(uid);
  assertWeeklyFits(patch, loaded.buckets as Bucket[]);
  const stamp = await stampLastUpdated(uid, nowIso());
  await tenantRef(uid).collection('settings').doc('current').set({ ...patch, ...stamp }, { merge: true });
  return { ok: true };
});

export const upsertBucket = onCall(async (request) => {
  const uid = await requireUid(request);
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
  const uid = await requireUid(request);
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
  const uid = await requireUid(request);
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
  const uid = await requireUid(request);
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
  type: string | undefined,
  previousDueAt: string | undefined,
  nextDueAt: string | undefined
): string[] | null {
  const datedBucket =
    bucket &&
    (bucket.kind === 'event' ||
      bucket.id === EVENTS_ID ||
      bucket.kind === 'appointment' ||
      bucket.id === APPOINTMENTS_ID);
  // A repeating appointment runs on a cadence, so it can land anywhere in the
  // range and cannot be scoped to a pair of dates.
  if (!datedBucket || type !== 'scheduled') return null;
  const out = [previousDueAt, nextDueAt].filter((d): d is string => Boolean(d));
  return out.length ? [...new Set(out)] : [];
}

/**
 * Build one item's stored shape, validating it the same way whichever path
 * arrived here. Both the single-row Save and the page Save call this, so the
 * rules cannot drift between them.
 *
 * `label` names the row in any error, because "Pick an event" is unhelpful when
 * a page Save covers twenty of them.
 */
function buildItemPayload(
  data: Record<string, unknown>,
  buckets: Bucket[],
  items: ListItem[],
  storedWeight: number,
  isNew: boolean
): Record<string, unknown> {
  const durationMinutes = asNumber(data.durationMinutes ?? 0, 'Duration');
  if (durationMinutes < 0) throw new HttpsError('invalid-argument', 'Duration cannot be negative.');
  const bucketId = asString(data.bucketId, 'Bucket');
  const eventItem = bucketId === EVENTS_ID;
  const apptItem = bucketId === APPOINTMENTS_ID;
  const bucket = buckets.find((b) => b.id === bucketId);
  const title = asString(data.title, 'Title');
  const rowId = typeof data.id === 'string' ? data.id : '';
  /**
   * Errors carry the row and the field so the page can put the message beside
   * the thing that is wrong, rather than in a toast over the top of it.
   */
  const label = (msg: string, field?: string) =>
    new HttpsError('invalid-argument', `${title}: ${msg}`, { itemId: rowId, field });

  if (!eventItem) {
    if (!bucket) throw new HttpsError('not-found', `${title}: that bucket was not found.`, { itemId: rowId, field: 'bucketId' });
    if (!itemFitsBucket(durationMinutes, bucket)) throw label(itemExceedsBucketMessage(bucket), 'iH');
  }
  // Events and appointments are both date-keyed: they pack on their due date
  // and never run on a cadence.
  // Events are pinned to a date. Appointments choose, like any other item.
  const type = eventItem ? 'scheduled' : asString(data.type, 'Type');
  const dueAt = type === 'scheduled' ? asString(data.dueAt, 'Date') : '';
  const expiresAt = typeof data.expiresAt === 'string' ? data.expiresAt.trim() : '';
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    throw label('the expiry date is not a date.', 'expiresAt');
  }
  let eventId = '';
  if (eventItem) {
    const ranges = eventRanges(bucket);
    eventId = typeof data.eventId === 'string' ? data.eventId.trim() : '';
    const range = ranges.find((r) => r.id === eventId);
    if (!range) throw label('pick an event for this item.', 'eventId');
    if (dueAt < range.startDate || dueAt > range.endDate) {
      throw label(`${eventRangeName(range)} runs ${range.startDate} to ${range.endDate}.`, 'dueAt');
    }
  }
  const payload: Record<string, unknown> = {
    bucketId,
    title,
    type,
    weight: isNew ? nextItemWeight(items, bucketId) : Number.isFinite(storedWeight) ? storedWeight : 1,
    durationMinutes,
    cadence: eventItem ? { kind: 'daily' } : data.cadence || { kind: 'daily' },
    dueAt,
    archived: false,
    // Display only. Never read by the packer.
    apptTime: apptItem && typeof data.apptTime === 'string' ? data.apptTime.trim().slice(0, 40) : '',
    eventId,
    // Only a cadence can expire. A scheduled item already names its one date,
    // and storing an expiry beside it would be a second answer to the same
    // question — one the packer would have to pick between.
    expiresAt: type === 'recurring' ? expiresAt : '',
  };
  if (apptItem && bucket) {
    // An appointment declares the sections it spans. At least one, always —
    // nothing lands in a section the user did not pick.
    const allowed = bucketSlots(bucket);
    const raw = Array.isArray(data.slots) ? data.slots : [];
    const picked = allowed.filter((slot) => raw.includes(slot));
    if (!picked.length) throw label('pick at least one section.', 'slots');
    payload.slots = picked;
    payload.slot = picked[0];
  }
  if (bucket && !apptItem) {
    // Any bucket spanning more than one section makes its items choose. Only
    // appointments span several at once; everything else lands in exactly one.
    if (workShowsItemSlot(bucket)) {
      const allowed = bucketSlots(bucket);
      const slot = data.slot;
      const bad = `pick a section for ${bucket.name}.`;
      if (slot !== 'morning' && slot !== 'midday' && slot !== 'evening') throw label(bad, 'slot');
      if (!allowed.includes(slot)) throw label(bad, 'slot');
      payload.slot = slot;
    } else {
      payload.slot = itemWorkSlot({}, bucket);
    }
  } else if (!apptItem) {
    payload.slot = null;
  }
  return payload;
}

/**
 * One Save for the whole Lists tab. Deliberately not a loop over upsertItem:
 * that runs a full repack per row, so twenty rows would mean twenty rebuilds.
 * Validate everything first, write once, repack once.
 */
export const saveItems = onCall(async (request) => {
  const uid = await requireUid(request);
  await ensureTenant(uid, nowIso());
  const rows = Array.isArray(request.data?.rows) ? (request.data.rows as Record<string, unknown>[]) : [];
  if (!rows.length) return { ok: true, saved: 0 };
  const loaded = await loadTenant(uid);
  const buckets = loaded.buckets as Bucket[];
  const items = loaded.items as ListItem[];

  // Validate every row before writing any, so a bad row cannot leave the page
  // half saved.
  const prepared = rows.map((row) => {
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : newId();
    const before = items.find((i) => i.id === id);
    return {
      id,
      isNew: !before,
      previousDueAt: before?.dueAt,
      payload: buildItemPayload(row, buckets, items, Number(before?.weight), !before),
    };
  });

  const now = nowIso();
  const created = await stampCreated(uid, now);
  const updated = await stampLastUpdated(uid, now);
  const batch = getFirestore().batch();
  for (const row of prepared) {
    batch.set(
      tenantRef(uid).collection('items').doc(row.id),
      { ...row.payload, ...(row.isNew ? created : updated) },
      { merge: true }
    );
  }
  await batch.commit();

  // Scope the repack when every row is date-keyed; otherwise a cadence item
  // could land anywhere in the range.
  const scopes = prepared.map((row) =>
    datesForItemEdit(
      buckets.find((b) => b.id === row.payload.bucketId),
      row.payload.type as string,
      row.previousDueAt,
      (row.payload.dueAt as string) || undefined
    )
  );
  if (scopes.every((s) => s !== null)) {
    await writePackedDates(uid, [...new Set(scopes.flat() as string[])]);
  } else {
    await writePackedRange(uid, todayKey(), PACK_RANGE_DAYS);
  }
  return { ok: true, saved: prepared.length };
});

export const reorderItems = onCall(async (request) => {
  const uid = await requireUid(request);
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
  const uid = await requireUid(request);
  const id = asString(request.data?.id, 'Item');
  const stamp = await stampLastUpdated(uid, nowIso());
  const itemRef = tenantRef(uid).collection('items').doc(id);
  const before = await itemRef.get();
  const row = before.exists ? (before.data() as { bucketId?: string; dueAt?: string }) : undefined;
  await itemRef.set({ archived: true, ...stamp }, { merge: true });
  const loaded = await loadTenant(uid);
  const bucket = (loaded.buckets as Bucket[]).find((b) => b.id === row?.bucketId);
  const scoped = datesForItemEdit(bucket, before.exists ? (row as { type?: string })?.type : undefined, row?.dueAt, undefined);
  if (scoped) await writePackedDates(uid, scoped);
  else await writePackedRange(uid, todayKey(), PACK_RANGE_DAYS);
  return { ok: true };
});

export const rebuildRange = onCall(async (request) => {
  const uid = await requireUid(request);
  await ensureTenant(uid, nowIso());
  const start = asString(request.data?.start || todayKey(), 'Start date');
  const days = Number(request.data?.days) || PACK_RANGE_DAYS;
  await writePackedRange(uid, start, days);
  return { ok: true };
});

export const resetToday = onCall(async (request) => {
  const uid = await requireUid(request);
  await ensureTenant(uid, nowIso());
  const date = asString(request.data?.date || todayKey(), 'Date');
  await mutateDay(uid, date, (prev, tenant, now) => planRespawn(prev, tenant, date, now));
  return { ok: true };
});

export const completeBlock = onCall(async (request) => {
  const uid = await requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const id = asString(request.data?.id, 'Block');
  await mutateDay(uid, date, (prev, tenant, now) => planComplete(prev, tenant, date, id, now));
  return { ok: true };
});

export const skipBlock = onCall(async (request) => {
  const uid = await requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const id = asString(request.data?.id, 'Block');
  await mutateDay(uid, date, (prev, tenant, now) => planSkip(prev, tenant, date, id, now));
  return { ok: true };
});

export const startDay = onCall(async (request) => {
  const uid = await requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  await mutateDay(uid, date, (prev, tenant, now) => planStartDay(prev, tenant, date, now));
  return { ok: true };
});

export const startNext = onCall(async (request) => {
  const uid = await requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const from = asString(request.data?.from, 'Section');
  if (from !== 'event' && !(SLOTS as string[]).includes(from)) {
    throw new HttpsError('invalid-argument', 'Section must be morning, midday, evening or event.');
  }
  await mutateDay(uid, date, (prev, tenant, now) => planStartNext(prev, tenant, date, from as Slot | 'event', now));
  return { ok: true };
});

export const startBreak = onCall(async (request) => {
  const uid = await requireUid(request);
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
  const uid = await requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const stamp = await stampLastUpdated(uid, nowIso());
  await tenantRef(uid).collection('days').doc(date).set({ pausedAt: null, sectionStartedAt: nowIso(), ...stamp }, { merge: true });
  await writeLog(uid, { type: 'end_break', date });
  return { ok: true };
});

export const endDay = onCall(async (request) => {
  const uid = await requireUid(request);
  const date = asString(request.data?.date || todayKey(), 'Date');
  const plan = await mutateDay(uid, date, (prev, tenant, now) => planFinishDay(prev, tenant, date, now));
  return { ok: true, delta: plan.day?.scoreDelta ?? 0 };
});
