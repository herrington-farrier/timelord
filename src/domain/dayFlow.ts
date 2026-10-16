import { collectEndDaySkipPushes, packDay, type DroppedBucket } from './packDay';
import { dayHasAppointments, scoreDay } from './score';
import { capsAfterLoad, isEventDay, liveSectionState, nextSlot, reservedLoad, sectionCapacity } from './sections';
import { leftoverSectionBlocks, markLeftoversSkipped, skipLogBlocks, skipPushDate } from './skip';
import { elapsedSince } from './timer';
import { EVENTS_ID, type Bucket, type DaySettings, type ListItem, type PackedBlock, type SkipPush, type Slot } from './types';

/**
 * Day transitions as pure planners. Each takes the stored day plus what it needs
 * from the tenant and returns a DayPlan; the handler (`mutateDay` in
 * functions/src/index.ts) runs the plan inside one transaction. Nothing here
 * reads the clock, Firestore or the network: `now` is always passed in.
 */

/** The day doc as stored. Packer output plus the live-day fields. */
export type DayState = {
  blocks?: PackedBlock[];
  dropped?: PackedBlock[];
  droppedBuckets?: DroppedBucket[];
  packedMinutes?: number;
  droppedMinutes?: number;
  remainingMinutes?: number;
  packedAt?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  section?: Slot | 'event' | null;
  sectionStartedAt?: string | null;
  sectionRemainingMinutes?: number | null;
  pausedAt?: string | null;
  sectionExtra?: Partial<Record<Slot, number>>;
  sectionUsed?: Partial<Record<Slot, number>>;
  eventStartedAt?: string | null;
  scoreDelta?: number;
  /** Audit stamps already on the doc; a repack carries them forward. */
  created_at?: string;
  created_by?: string;
  last_updated_at?: string;
  last_updated_by?: string;
};

/** What a handler has loaded from the tenant (the shape of `loadTenant`). */
export type TenantData = {
  items: ListItem[];
  buckets: Bucket[];
  settings: DaySettings;
  skipPushes: SkipPush[];
};

export type Now = { iso: string; ms: number };

export type LogType =
  | 'complete'
  | 'skip'
  | 'start_day'
  | 'start_next'
  | 'end_day'
  | 'event_hours'
  | 'reset_today';

/** A log row without its audit stamps and `at`; the handler adds those. */
export type LogRow = {
  type: LogType;
  date: string;
  itemId?: string;
  bucketId?: string;
  minutes?: number;
  title?: string;
  section?: string;
};

/** A skip push without its audit stamps. `fromDate` is always the planned date. */
export type PlannedSkipPush = SkipPush & { fromDate: string };

export type DayPlan = {
  /** Fields to merge into the day doc; null means nothing to change (no-op). */
  day: Partial<DayState> | null;
  logs: LogRow[];
  pushes: PlannedSkipPush[];
  /** Respawn: delete skipPushes whose fromDate equals this date, and today's complete/skip logs. */
  deletePushesFrom?: string;
  /** Added to score/current total. The day patch also stores the day's own scoreDelta where it scores. */
  scoreDelta: number;
};

/** Thrown for a request the stored state contradicts; the handler maps it to HttpsError. */
export class DayFlowError extends Error {
  readonly code: 'failed-precondition' | 'not-found';
  constructor(code: 'failed-precondition' | 'not-found', message: string) {
    super(message);
    this.name = 'DayFlowError';
    this.code = code;
  }
}

export const NO_PLAN: DayPlan = Object.freeze({
  day: null,
  logs: [],
  pushes: [],
  scoreDelta: 0,
}) as DayPlan;

/**
 * The packer input for a date, from loaded tenant data. Each previous entry
 * carries its block id so one half of a split item cannot lend its status to
 * the other.
 */
export function asPackInput(
  loaded: TenantData,
  date: string,
  previous?: PackedBlock[],
  extra?: Partial<Record<Slot, number>>,
  used?: Partial<Record<Slot, number>>
) {
  return {
    date,
    settings: loaded.settings,
    buckets: loaded.buckets,
    items: loaded.items,
    skipPushes: loaded.skipPushes,
    sectionExtra: extra,
    sectionUsed: used,
    previous: previous?.map((b) => ({
      id: b.id,
      itemId: b.itemId,
      appointmentId: b.appointmentId,
      status: b.status,
      startMinutes: b.startMinutes,
      endMinutes: b.endMinutes,
    })),
  };
}

const NOT_FOUND_DAY = 'That day is not packed yet.';

function isMorningRoutine(b: PackedBlock): boolean {
  return b.title === 'Morning Routine' || String(b.id || '').endsWith(':morning');
}

function isEveningRoutine(b: PackedBlock): boolean {
  return b.title === 'Evening Routine' || String(b.id || '').endsWith(':evening');
}

function eventsBucket(tenant: TenantData): Bucket | undefined {
  return tenant.buckets.find((b) => b.id === EVENTS_ID || b.kind === 'event');
}

function requireDay(prev: DayState | null): DayState {
  if (!prev) throw new DayFlowError('not-found', NOT_FOUND_DAY);
  return prev;
}

function logOf(type: LogType, date: string, block?: PackedBlock): LogRow {
  return {
    type,
    date,
    itemId: block?.itemId,
    bucketId: block?.bucketId,
    minutes: block?.durationMinutes,
    title: block?.title,
  };
}

type Located = { block: PackedBlock; blocks: PackedBlock[]; dropped: PackedBlock[] };

/** Find a block in the day, and return both lists with it set to `status`. */
function setStatus(day: DayState, blockId: string, status: 'complete' | 'skipped'): Located & { was: PackedBlock['status'] } {
  let found: PackedBlock | undefined;
  let was: PackedBlock['status'] = 'pending';
  const apply = (rows: PackedBlock[]) =>
    rows.map((b) => {
      if (b.id !== blockId) return b;
      was = b.status;
      found = { ...b, status };
      return found;
    });
  const blocks = apply(day.blocks || []);
  const dropped = apply(day.dropped || []);
  if (!found) throw new DayFlowError('not-found', 'That block was not found.');
  return { block: found, blocks, dropped, was };
}

/**
 * Mark a block complete.
 * - Day missing (`prev` null) or block not found: throws DayFlowError 'not-found'.
 * - Block already complete: no-op (`day: null`).
 * - Block skipped: throws DayFlowError 'failed-precondition'.
 * - Completing Morning Routine also begins the section (event day: 'event', else
 *   'morning') and logs start_day, only if `prev.startedAt` is unset.
 * - Logs one 'complete' row with itemId, bucketId, minutes, title.
 */
export function planComplete(
  prev: DayState | null,
  tenant: TenantData,
  date: string,
  blockId: string,
  now: Now
): DayPlan {
  const day = requireDay(prev);
  const { block, blocks, dropped, was } = setStatus(day, blockId, 'complete');
  if (was === 'complete') return NO_PLAN;
  if (was === 'skipped') throw new DayFlowError('failed-precondition', 'That quest was already skipped.');
  const complete = logOf('complete', date, block);
  if (isMorningRoutine(block) && !day.startedAt) {
    const start = planStartDay({ ...day, blocks, dropped }, tenant, date, now);
    return { ...start, day: { blocks, dropped, ...start.day }, logs: [...start.logs, complete] };
  }
  return { day: { blocks, dropped }, logs: [complete], pushes: [], scoreDelta: 0 };
}

/**
 * Mark a block skipped.
 * - Day missing or block not found: DayFlowError 'not-found'.
 * - Block already skipped: no-op. Block complete: DayFlowError 'failed-precondition'.
 * - Scheduled item: one skip push (skipPushDate) in `pushes`.
 * - Appointment: includes the capacity refund in the same plan (repack, and the
 *   running section's sectionRemainingMinutes credited with what it got back).
 * - Logs one 'skip' row.
 */
export function planSkip(
  prev: DayState | null,
  tenant: TenantData,
  date: string,
  blockId: string,
  now: Now
): DayPlan {
  const day = requireDay(prev);
  const { block, blocks, dropped, was } = setStatus(day, blockId, 'skipped');
  if (was === 'skipped') return NO_PLAN;
  if (was === 'complete') throw new DayFlowError('failed-precondition', 'That quest was already completed.');

  const pushes: PlannedSkipPush[] = [];
  const item = tenant.items.find((i) => i.id === block.itemId);
  if (item?.type === 'scheduled') {
    const bucket = tenant.buckets.find((b) => b.id === item.bucketId);
    const toDate = skipPushDate(item, bucket, date, eventsBucket(tenant));
    // A split item is one item: its second skipped half adds no second push.
    if (toDate && !alreadyPushed(tenant, [...blocks, ...dropped], item.id, date, blockId)) pushes.push({ itemId: item.id, toDate, fromDate: date });
  }

  let patch: Partial<DayState> = { blocks, dropped };
  if (block.kind === 'appointment') {
    // A cancelled appointment hands its hours back. Repack so other work can
    // claim the freed time, and credit the running section's countdown with
    // what that section got back so it agrees with the new capacity.
    const base = sectionCapacity(tenant.settings, day.sectionExtra || {}, day.sectionUsed);
    const before = capsAfterLoad(base, reservedLoad(blocks.map((b) => (b.id === blockId ? { ...b, status: 'pending' } : b))));
    const after = capsAfterLoad(base, reservedLoad(blocks));
    const result = packDay(asPackInput(tenant, date, [...blocks, ...dropped], day.sectionExtra, day.sectionUsed));
    const section = day.section && day.section !== 'event' ? day.section : null;
    const freed = section ? Math.max(0, after[section] - before[section]) : 0;
    patch = {
      ...result,
      blocks: result.blocks.map((b) => (b.id === blockId ? { ...b, status: 'skipped' as const } : b)),
      ...(freed > 0 ? { sectionRemainingMinutes: (day.sectionRemainingMinutes || 0) + freed } : {}),
      packedAt: now.iso,
    };
  }
  return { day: patch, logs: [logOf('skip', date, block)], pushes, scoreDelta: 0 };
}

/**
 * Begin the day (startDay): section 'event' on an event day, else 'morning'.
 * planComplete uses this when it begins the day. Keeps startedAt if already
 * set, clears endedAt, marks Morning Routine complete, sets sectionStartedAt,
 * sectionRemainingMinutes (capacity after reserved appointments), pausedAt null.
 * Logs start_day. A day that is started and not ended is left alone, so a
 * repeat does not reset the timer.
 */
export function planStartDay(
  prev: DayState | null,
  tenant: TenantData,
  date: string,
  now: Now
): DayPlan {
  const day = requireDay(prev);
  if (day.startedAt && !day.endedAt) return NO_PLAN;
  const logs = [{ type: 'start_day' as const, date }];
  if (isEventDay(eventsBucket(tenant), date)) {
    return {
      day: {
        startedAt: day.startedAt || now.iso,
        endedAt: null,
        section: 'event',
        eventStartedAt: now.iso,
        sectionStartedAt: now.iso,
        sectionRemainingMinutes: 0,
        pausedAt: null,
      },
      logs,
      pushes: [],
      scoreDelta: 0,
    };
  }
  const fresh = !day.startedAt;
  const extra = fresh ? {} : day.sectionExtra || {};
  const used = fresh ? {} : day.sectionUsed || {};
  const blocks = (day.blocks || []).map((b) => (isMorningRoutine(b) ? { ...b, status: 'complete' as const } : b));
  // The timer counts down the time actually available, so it subtracts
  // appointments the same way the packer does, including what spills forward.
  const caps = capsAfterLoad(sectionCapacity(tenant.settings, extra, used), reservedLoad(blocks));
  return {
    day: {
      startedAt: day.startedAt || now.iso,
      endedAt: null,
      section: 'morning',
      sectionStartedAt: now.iso,
      sectionRemainingMinutes: caps.morning,
      pausedAt: null,
      sectionExtra: extra,
      sectionUsed: used,
      ...(blocks.length ? { blocks } : {}),
    },
    logs,
    pushes: [],
    scoreDelta: 0,
  };
}

function skipLogs(date: string, leftovers: PackedBlock[]): LogRow[] {
  return skipLogBlocks(leftovers).map((b) => logOf('skip', date, b));
}

/**
 * A split item is one item: it is pushed once, whether the first push is
 * already stored or a sibling half was skipped by hand (and pushed then).
 * `rows` is the day as stored; `exceptId` is the block being skipped now.
 */
function alreadyPushed(
  tenant: TenantData,
  rows: PackedBlock[],
  itemId: string,
  date: string,
  exceptId?: string
): boolean {
  return (
    tenant.skipPushes.some((p) => p.itemId === itemId && (p as PlannedSkipPush).fromDate === date) ||
    rows.some((b) => b.id !== exceptId && b.itemId === itemId && b.status === 'skipped')
  );
}

function endPushes(date: string, tenant: TenantData, day: DayState, leftovers: PackedBlock[]): PlannedSkipPush[] {
  const rows = [...(day.blocks || []), ...(day.dropped || [])];
  return collectEndDaySkipPushes(date, leftovers, leftovers, tenant.items, tenant.buckets)
    .filter((p) => !alreadyPushed(tenant, rows, p.itemId, date))
    .map((p) => ({ ...p, fromDate: date }));
}

/**
 * Give each log row its own `at`, one millisecond apart in planner order, so
 * rows written in one request sort the way they happened.
 */
export function stampLogTimes(logs: LogRow[], now: Now): (LogRow & { at: string })[] {
  return logs.map((row, i) => ({ ...row, at: new Date(now.ms + i).toISOString() }));
}

/**
 * Leave the current section for the next one.
 * - `from` is the section the client believes it is leaving. If `prev.section`
 *   differs (or the day has ended), no-op.
 * - Leftovers in `from` are skipped (skip log rows, skip pushes).
 * - If there is no next section or it has no capacity, this is planFinishDay.
 * - Otherwise repacks with extra/used and begins `next` with its capacity,
 *   logging start_next with section.
 * - No section to leave (`prev.section` null or 'event' and `from` matches that
 *   state): DayFlowError 'failed-precondition'.
 */
export function planStartNext(
  prev: DayState | null,
  tenant: TenantData,
  date: string,
  from: Slot | 'event' | null,
  now: Now
): DayPlan {
  const day = requireDay(prev);
  if (day.endedAt || (day.section ?? null) !== from) return NO_PLAN;
  const section = day.section;
  if (!section || section === 'event') {
    throw new DayFlowError('failed-precondition', 'No section to leave.');
  }
  const next = nextSlot(section);
  const leftovers = leftoverSectionBlocks(day.blocks || [], day.dropped || [], section);
  const blocks = markLeftoversSkipped(day.blocks || [], leftovers);
  const dropped = markLeftoversSkipped(day.dropped || [], leftovers);
  const extra = { ...(day.sectionExtra || {}) };
  const used = day.sectionUsed || {};
  const caps = capsAfterLoad(sectionCapacity(tenant.settings, extra, used), reservedLoad(blocks));
  if (!next || caps[next] <= 0) return planFinishDay(day, tenant, date, now);

  const leftoverIds = new Set(leftovers.map((b) => b.itemId).filter(Boolean));
  const result = packDay(asPackInput(tenant, date, [...blocks, ...dropped], extra, used));
  const merged = result.blocks.map((b) => {
    const was = blocks.find((p) => p.id === b.id) || blocks.find((p) => p.itemId && p.itemId === b.itemId);
    return was && (was.status === 'complete' || was.status === 'skipped') ? { ...b, status: was.status } : b;
  });
  return {
    day: {
      ...result,
      blocks: merged,
      dropped: result.dropped.map((b) =>
        b.itemId && leftoverIds.has(b.itemId) ? { ...b, status: 'skipped' as const } : b
      ),
      startedAt: day.startedAt,
      section: next,
      sectionExtra: extra,
      sectionUsed: used,
      sectionStartedAt: now.iso,
      sectionRemainingMinutes: caps[next],
      pausedAt: null,
      packedAt: now.iso,
    },
    logs: [...skipLogs(date, leftovers), { type: 'start_next', date, section: next }],
    pushes: endPushes(date, tenant, day, leftovers),
    scoreDelta: 0,
  };
}

/**
 * End the day. Shared by End Day and Start Next's no-capacity branch.
 * - No-op if `prev.endedAt` is set.
 * - Completes Evening Routine, skips leftover blocks and dropped rows.
 * - Computes skip pushes (collectEndDaySkipPushes), log rows for auto-skips
 *   (skipLogBlocks), event_hours (when ending from section 'event'), end_day.
 * - Scores the day (scoreDay); `scoreDelta` on the plan and in `day.scoreDelta`.
 * - Clears section, sectionStartedAt, sectionRemainingMinutes, pausedAt,
 *   eventStartedAt; sets endedAt.
 * - Every pending or dropped item on the day is a leftover, whichever section
 *   it sits in, so Start Next ending the day loses nothing.
 */
export function planFinishDay(
  prev: DayState | null,
  tenant: TenantData,
  date: string,
  now: Now
): DayPlan {
  const day = requireDay(prev);
  if (day.endedAt) return NO_PLAN;
  const all = day.blocks || [];
  const rest = day.dropped || [];
  const leftovers = [...all, ...rest].filter((b) => b.itemId && (b.status === 'pending' || b.status === 'dropped'));
  const blocks = markLeftoversSkipped(all, leftovers).map((b) =>
    isEveningRoutine(b) ? { ...b, status: 'complete' as const } : b
  );
  const dropped = markLeftoversSkipped(rest, leftovers);

  const score = scoreDay(blocks, dropped, {
    started: Boolean(day.startedAt),
    isEventDay: isEventDay(eventsBucket(tenant), date),
    hasAppointments: dayHasAppointments(blocks),
  });
  const eventMinutes =
    day.section === 'event' && day.eventStartedAt ? Math.round(elapsedSince(day.eventStartedAt, now.ms)) : 0;

  const logs: LogRow[] = [
    ...skipLogs(date, leftovers),
    ...(eventMinutes ? [{ type: 'event_hours' as const, date, minutes: eventMinutes }] : []),
    { type: 'end_day', date },
  ];
  return {
    day: {
      blocks,
      dropped,
      endedAt: now.iso,
      pausedAt: null,
      section: null,
      sectionStartedAt: null,
      sectionRemainingMinutes: null,
      eventStartedAt: null,
      scoreDelta: score.delta,
    },
    logs,
    pushes: endPushes(date, tenant, day, leftovers),
    // A day reopened by Start Day and ended again replaces its earlier score.
    scoreDelta: score.delta - (day.scoreDelta || 0),
  };
}

/**
 * Respawn (resetToday): repack the day fresh, clear started/ended/section
 * fields, sectionExtra/sectionUsed {}, scoreDelta 0.
 * Plan carries `scoreDelta = -(prev?.scoreDelta ?? 0)`,
 * `deletePushesFrom = date`, and a reset_today log row.
 */
export function planRespawn(
  prev: DayState | null,
  tenant: TenantData,
  date: string,
  now: Now
): DayPlan {
  const result = packDay(asPackInput(tenant, date));
  return {
    day: {
      ...result,
      scoreDelta: 0,
      startedAt: null,
      endedAt: null,
      packedAt: now.iso,
      section: null,
      sectionStartedAt: null,
      sectionRemainingMinutes: null,
      pausedAt: null,
      sectionExtra: {},
      sectionUsed: {},
      eventStartedAt: null,
    },
    logs: [{ type: 'reset_today', date }],
    pushes: [],
    deletePushesFrom: date,
    scoreDelta: prev?.scoreDelta ? -prev.scoreDelta : 0,
  };
}

const VOLATILE_DAY_KEYS = new Set([
  'packedAt',
  'created_at',
  'created_by',
  'created_by_signature',
  'last_updated_at',
  'last_updated_by',
  'last_updated_by_signature',
]);

/**
 * Key order is not stable between what Firestore returns and what we build, so
 * a plain JSON.stringify would report every day as changed.
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
function unchangedDay(prev: object, next: object): boolean {
  const strip = (row: object) =>
    Object.fromEntries(Object.entries(row).filter(([k, v]) => !VOLATILE_DAY_KEYS.has(k) && v !== undefined));
  return stableJson(strip(prev)) === stableJson(strip(next));
}

/**
 * Repack a date from tenant data (writePackedDates), keeping what the packer
 * does not own.
 * - Carries scoreDelta, sectionExtra, sectionUsed, startedAt, endedAt, section,
 *   sectionStartedAt, sectionRemainingMinutes, pausedAt, eventStartedAt and the
 *   audit stamp fields from `prev`.
 * - A started or ended day packs with `prev.blocks` as previous and with
 *   `prev.sectionExtra` / `prev.sectionUsed`.
 * - `day: null` when the packed content is unchanged (ignoring packedAt and
 *   audit stamps). No logs, no pushes, scoreDelta 0.
 */
export function planRepack(
  prev: DayState | null,
  tenant: TenantData,
  date: string,
  now: Now
): DayPlan {
  const live = Boolean(prev?.blocks && (prev.startedAt || prev.endedAt));
  const { extra, used } = liveSectionState(prev ?? undefined);
  const result = packDay(
    asPackInput(tenant, date, live ? [...(prev?.blocks || []), ...(prev?.dropped || [])] : undefined, extra, used)
  );
  const next: DayState = {
    ...result,
    startedAt: prev?.startedAt || null,
    endedAt: prev?.endedAt || null,
    packedAt: now.iso,
    section: prev?.section ?? null,
    sectionStartedAt: prev?.sectionStartedAt ?? null,
    sectionRemainingMinutes: prev?.sectionRemainingMinutes ?? null,
    pausedAt: prev?.pausedAt ?? null,
    sectionExtra: extra,
    sectionUsed: used,
    eventStartedAt: prev?.eventStartedAt ?? null,
    ...(prev?.scoreDelta !== undefined ? { scoreDelta: prev.scoreDelta } : {}),
    ...(prev?.created_at ? { created_at: prev.created_at } : {}),
    ...(prev?.created_by ? { created_by: prev.created_by } : {}),
    ...(prev?.last_updated_at ? { last_updated_at: prev.last_updated_at } : {}),
    ...(prev?.last_updated_by ? { last_updated_by: prev.last_updated_by } : {}),
  };
  if (prev && unchangedDay(prev, next)) return NO_PLAN;
  return { day: next, logs: [], pushes: [], scoreDelta: 0 };
}
