import { describe, expect, it } from 'vitest';

import {
  DayFlowError,
  planComplete,
  planFinishDay,
  planRepack,
  planRespawn,
  planSkip,
  planStartDay,
  planStartNext,
  stampLogTimes,
  type DayState,
  type Now,
} from '../domain/dayFlow';
import { APPOINTMENTS_ID, EVENTS_ID, type PackedBlock } from '../domain/types';
import { bucket, dayState, item, packedBlock, tenantData } from './fixtures';

const DATE = '2026-08-31';
const NOW: Now = { iso: '2026-08-31T09:00:00.000Z', ms: Date.parse('2026-08-31T09:00:00.000Z') };
const EARLIER = '2026-08-31T07:00:00.000Z';

const house = bucket({ id: 'house', name: 'House', weight: 1, slot: 'morning' });
const errands = bucket({ id: 'errands', name: 'Errands', weight: 1, slot: 'morning' });
const appointments = bucket({
  id: APPOINTMENTS_ID,
  kind: 'appointment',
  name: 'Appointments',
  weight: 1,
  slot: 'morning',
});

const floors = item({ id: 'floors', bucketId: 'house', title: 'Floors' });
const post = item({
  id: 'post',
  bucketId: 'errands',
  title: 'Post parcel',
  type: 'scheduled',
  cadence: { kind: 'daily' },
  dueAt: DATE,
});
const dentist = item({
  id: 'dentist',
  bucketId: APPOINTMENTS_ID,
  title: 'Dentist',
  type: 'scheduled',
  cadence: { kind: 'daily' },
  dueAt: DATE,
  durationMinutes: 60,
  slot: 'morning',
});

function tenant() {
  const base = tenantData();
  return tenantData({
    buckets: [...base.buckets, house, errands, appointments],
    items: [floors, post, dentist],
  });
}

function morningRoutine(overrides: Partial<PackedBlock> = {}): PackedBlock {
  return packedBlock({
    id: `${DATE}:morning`,
    kind: 'personal',
    bucketId: 'personal',
    title: 'Morning Routine',
    durationMinutes: 0,
    slot: 'morning',
    ...overrides,
  });
}

function eveningRoutine(overrides: Partial<PackedBlock> = {}): PackedBlock {
  return packedBlock({
    id: `${DATE}:evening`,
    kind: 'personal',
    bucketId: 'personal',
    title: 'Evening Routine',
    durationMinutes: 0,
    slot: 'evening',
    ...overrides,
  });
}

function floorsBlock(overrides: Partial<PackedBlock> = {}): PackedBlock {
  return packedBlock({
    id: `${DATE}:item-floors`,
    itemId: 'floors',
    kind: 'weighted',
    title: 'Floors',
    slot: 'morning',
    ...overrides,
  });
}

function postBlock(overrides: Partial<PackedBlock> = {}): PackedBlock {
  return packedBlock({
    id: `${DATE}:item-post`,
    itemId: 'post',
    bucketId: 'errands',
    kind: 'weighted',
    title: 'Post parcel',
    slot: 'morning',
    ...overrides,
  });
}

function runningDay(overrides: Partial<DayState> = {}): DayState {
  return dayState({
    blocks: [morningRoutine({ status: 'complete' }), eveningRoutine(), floorsBlock()],
    startedAt: EARLIER,
    section: 'morning',
    sectionStartedAt: EARLIER,
    sectionRemainingMinutes: 120,
    ...overrides,
  });
}

function errorOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('planFinishDay', () => {
  it('scores an already ended day once by doing nothing the second time', () => {
    const ended = runningDay({
      blocks: [morningRoutine({ status: 'complete' }), floorsBlock({ status: 'complete' }), eveningRoutine({ status: 'complete' })],
      section: null,
      endedAt: EARLIER,
      scoreDelta: 1,
    });
    const plan = planFinishDay(ended, tenant(), DATE, NOW);
    expect(plan.day).toBeNull();
    expect(plan.scoreDelta).toBe(0);
  });
});

describe('planStartNext', () => {
  // Midday has no minutes left, so leaving morning ends the day.
  const noMiddayRoom = () => runningDay({ sectionUsed: { midday: 100000 } });

  it('ends and scores the day when the next section has no capacity left', () => {
    const prev = noMiddayRoom();
    prev.blocks = [morningRoutine({ status: 'complete' }), eveningRoutine(), floorsBlock({ status: 'complete' })];
    const plan = planStartNext(prev, tenant(), DATE, 'morning', NOW);
    expect(plan.scoreDelta).toBe(1);
    expect(plan.day?.scoreDelta).toBe(1);
    expect(plan.day?.endedAt).toBe(NOW.iso);
    expect(plan.day?.blocks?.find((b) => b.title === 'Evening Routine')?.status).toBe('complete');
    expect(plan.logs.map((l) => l.type)).toContain('end_day');
  });

  it('does nothing when the day has already left the section the client is leaving', () => {
    const prev = runningDay({ section: 'midday' });
    const plan = planStartNext(prev, tenant(), DATE, 'morning', NOW);
    expect(plan.day).toBeNull();
    expect(plan.logs).toEqual([]);
    expect(plan.pushes).toEqual([]);
    expect(plan.scoreDelta).toBe(0);
  });

  it('refuses to start next when there is no section to leave', () => {
    const prev = dayState({ startedAt: EARLIER, section: null });
    const e = errorOf(() => planStartNext(prev, tenant(), DATE, null, NOW));
    expect(e).toBeInstanceOf(DayFlowError);
    expect((e as DayFlowError).code).toBe('failed-precondition');
  });

  describe('leaving a section with leftovers', () => {
    // Two halves of a recurring item and two halves of a scheduled one.
    const leftoverDay = () =>
      runningDay({
        blocks: [
          morningRoutine({ status: 'complete' }),
          eveningRoutine(),
          floorsBlock({ id: `${DATE}:item-floors-a` }),
          floorsBlock({ id: `${DATE}:item-floors-b` }),
          postBlock({ id: `${DATE}:item-post-a` }),
          postBlock({ id: `${DATE}:item-post-b` }),
        ],
      });

    it('marks the leftover items in the leaving section skipped', () => {
      const plan = planStartNext(leftoverDay(), tenant(), DATE, 'morning', NOW);
      const all = [...(plan.day?.blocks ?? []), ...(plan.day?.dropped ?? [])];
      const rows = all.filter((b) => b.itemId === 'floors' || b.itemId === 'post');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((b) => b.status === 'skipped')).toBe(true);
    });

    it('writes one skip log per item, not per split half', () => {
      const plan = planStartNext(leftoverDay(), tenant(), DATE, 'morning', NOW);
      const skips = plan.logs.filter((l) => l.type === 'skip');
      expect(skips.map((l) => l.itemId).sort()).toEqual(['floors', 'post']);
    });

    it('writes one push per pushed item, not per split half', () => {
      const plan = planStartNext(leftoverDay(), tenant(), DATE, 'morning', NOW);
      expect(plan.pushes).toHaveLength(1);
      expect(plan.pushes[0]).toMatchObject({ itemId: 'post', fromDate: DATE });
    });
  });
});

describe('planSkip', () => {
  it('pushes a scheduled item once when it is skipped twice', () => {
    const prev = runningDay({ blocks: [morningRoutine({ status: 'complete' }), postBlock({ status: 'skipped' })] });
    const plan = planSkip(prev, tenant(), DATE, `${DATE}:item-post`, NOW);
    expect(plan.day).toBeNull();
    expect(plan.pushes).toEqual([]);
  });

  it('pushes a scheduled item the first time it is skipped', () => {
    const prev = runningDay({ blocks: [morningRoutine({ status: 'complete' }), postBlock()] });
    const plan = planSkip(prev, tenant(), DATE, `${DATE}:item-post`, NOW);
    expect(plan.pushes).toHaveLength(1);
    expect(plan.pushes[0]).toMatchObject({ itemId: 'post', fromDate: DATE });
  });

  it('pushes a split item once when both halves are skipped', () => {
    const a = postBlock({ id: `${DATE}:item-post-a` });
    const b = postBlock({ id: `${DATE}:item-post-b` });
    const first = planSkip(runningDay({ blocks: [morningRoutine({ status: 'complete' }), a, b] }), tenant(), DATE, a.id, NOW);
    expect(first.pushes).toHaveLength(1);
    const second = planSkip(
      runningDay({ blocks: [morningRoutine({ status: 'complete' }), { ...a, status: 'skipped' }, b] }),
      tenant(),
      DATE,
      b.id,
      NOW
    );
    expect(second.pushes).toEqual([]);
    const stored = tenantData({ ...tenant(), skipPushes: [{ itemId: 'post', toDate: '2026-09-01', fromDate: DATE } as never] });
    expect(planSkip(runningDay({ blocks: [morningRoutine({ status: 'complete' }), b] }), stored, DATE, b.id, NOW).pushes).toEqual([]);
  });

  it('refunds the freed minutes to the running section when an appointment is skipped', () => {
    const appt = packedBlock({
      id: `${DATE}:item-dentist`,
      itemId: 'dentist',
      bucketId: APPOINTMENTS_ID,
      kind: 'appointment',
      title: 'Dentist',
      durationMinutes: 60,
      slot: 'morning',
    });
    const prev = runningDay({ blocks: [morningRoutine({ status: 'complete' }), eveningRoutine(), appt], sectionRemainingMinutes: 100 });
    const plan = planSkip(prev, tenant(), DATE, appt.id, NOW);
    expect(plan.day?.sectionRemainingMinutes).toBe(160);
  });

  it('throws not-found for a block that is not on the day', () => {
    const e = errorOf(() => planSkip(runningDay(), tenant(), DATE, 'missing', NOW));
    expect(e).toBeInstanceOf(DayFlowError);
    expect((e as DayFlowError).code).toBe('not-found');
  });

  it('throws not-found when the day does not exist', () => {
    const e = errorOf(() => planSkip(null, tenant(), DATE, `${DATE}:item-floors`, NOW));
    expect(e).toBeInstanceOf(DayFlowError);
    expect((e as DayFlowError).code).toBe('not-found');
  });
});

describe('planComplete', () => {
  it('refuses to complete a skipped block', () => {
    const prev = runningDay({ blocks: [floorsBlock({ status: 'skipped' })] });
    const e = errorOf(() => planComplete(prev, tenant(), DATE, `${DATE}:item-floors`, NOW));
    expect(e).toBeInstanceOf(DayFlowError);
    expect((e as DayFlowError).code).toBe('failed-precondition');
  });

  it('throws not-found for a block that is not on the day', () => {
    const e = errorOf(() => planComplete(runningDay(), tenant(), DATE, 'missing', NOW));
    expect(e).toBeInstanceOf(DayFlowError);
    expect((e as DayFlowError).code).toBe('not-found');
  });

  it('throws not-found when the day does not exist', () => {
    const e = errorOf(() => planComplete(null, tenant(), DATE, `${DATE}:item-floors`, NOW));
    expect(e).toBeInstanceOf(DayFlowError);
    expect((e as DayFlowError).code).toBe('not-found');
  });

  it('leaves the section timer alone when Morning Routine is completed on a started day', () => {
    const prev = runningDay({ blocks: [morningRoutine(), floorsBlock()] });
    const plan = planComplete(prev, tenant(), DATE, `${DATE}:morning`, NOW);
    expect(plan.day?.sectionStartedAt ?? prev.sectionStartedAt).toBe(EARLIER);
    expect(plan.day?.sectionRemainingMinutes ?? prev.sectionRemainingMinutes).toBe(120);
    expect(plan.logs.map((l) => l.type)).not.toContain('start_day');
  });

  it('begins the morning section and logs start_day when Morning Routine is completed on an unstarted day', () => {
    const prev = dayState({ blocks: [morningRoutine(), floorsBlock()] });
    const plan = planComplete(prev, tenant(), DATE, `${DATE}:morning`, NOW);
    expect(plan.day?.section).toBe('morning');
    expect(plan.day?.startedAt).toBe(NOW.iso);
    expect(plan.logs.map((l) => l.type).sort()).toEqual(['complete', 'start_day']);
  });

  it('writes exactly one complete log row carrying the block details', () => {
    const plan = planComplete(runningDay(), tenant(), DATE, `${DATE}:item-floors`, NOW);
    const rows = plan.logs.filter((l) => l.type === 'complete');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      itemId: 'floors',
      bucketId: 'house',
      minutes: 30,
      title: 'Floors',
    });
  });
});

describe('planRepack', () => {
  it('keeps the scoreDelta of an ended day', () => {
    const prev = runningDay({ blocks: [], section: null, endedAt: EARLIER, scoreDelta: 3 });
    const plan = planRepack(prev, tenant(), DATE, NOW);
    expect(plan.day).not.toBeNull();
    expect(plan.day?.scoreDelta).toBe(3);
  });

  it('keeps sectionExtra and sectionUsed on a started day', () => {
    const prev = runningDay({ blocks: [], sectionExtra: { morning: 30 }, sectionUsed: { midday: 20 } });
    const plan = planRepack(prev, tenant(), DATE, NOW);
    expect(plan.day).not.toBeNull();
    expect(plan.day?.sectionExtra).toEqual({ morning: 30 });
    expect(plan.day?.sectionUsed).toEqual({ midday: 20 });
  });
});

describe('planRepack split halves', () => {
  it('leaves the second half pending when only the first half is complete', () => {
    const work = bucket({ id: 'work', kind: 'work', name: 'Work', weight: 1, slot: 'midday', weeklyMinutes: 40 * 60 });
    const t = tenantData({
      buckets: [work],
      items: [item({ id: 'big', bucketId: 'work', title: 'Big', durationMinutes: 240, type: 'recurring' })],
    });
    const fresh = planRepack(null, t, DATE, NOW).day as DayState;
    const halves = (fresh.blocks || []).filter((b) => b.itemId === 'big');
    expect(halves.length).toBe(2);
    const prev = dayState({
      ...fresh,
      startedAt: EARLIER,
      section: 'morning',
      blocks: (fresh.blocks || []).map((b) => (b.id === halves[0].id ? { ...b, status: 'complete' as const } : b)),
    });
    const next = planRepack({ ...prev, packedAt: 'x' }, t, DATE, NOW).day ?? prev;
    const after = (next.blocks || []).filter((b) => b.itemId === 'big');
    expect(after.map((b) => b.status)).toEqual(['complete', 'pending']);
  });
});

describe('planRespawn', () => {
  const ended = () =>
    runningDay({
      section: null,
      endedAt: EARLIER,
      scoreDelta: 4,
      sectionExtra: { morning: 30 },
      sectionUsed: { midday: 20 },
    });

  it('takes back the stored scoreDelta and removes pushes made from that date', () => {
    const plan = planRespawn(ended(), tenant(), DATE, NOW);
    expect(plan.scoreDelta).toBe(-4);
    expect(plan.deletePushesFrom).toBe(DATE);
  });

  it('resets started, ended and section fields and zeroes the day score', () => {
    const plan = planRespawn(ended(), tenant(), DATE, NOW);
    expect(plan.day).not.toBeNull();
    expect(plan.day?.startedAt).toBeNull();
    expect(plan.day?.endedAt).toBeNull();
    expect(plan.day?.section).toBeNull();
    expect(plan.day?.scoreDelta).toBe(0);
    expect(plan.day?.sectionExtra).toEqual({});
    expect(plan.day?.sectionUsed).toEqual({});
    expect(plan.logs.map((l) => l.type)).toContain('reset_today');
  });
});

describe('planFinishDay leftovers and pushes', () => {
  const noMiddayRoom = (blocks: PackedBlock[]) => runningDay({ sectionUsed: { midday: 100000 }, blocks });

  it("skips and pushes later sections' items when Start Next ends the day", () => {
    const later = postBlock({ slot: 'midday' });
    const prev = noMiddayRoom([morningRoutine({ status: 'complete' }), eveningRoutine(), floorsBlock({ status: 'complete' }), later]);
    const plan = planStartNext(prev, tenant(), DATE, 'morning', NOW);
    expect(plan.day?.endedAt).toBe(NOW.iso);
    expect(plan.day?.blocks?.find((b) => b.itemId === 'post')?.status).toBe('skipped');
    expect(plan.pushes).toHaveLength(1);
    expect(plan.pushes[0]).toMatchObject({ itemId: 'post', fromDate: DATE });
    expect(plan.logs.filter((l) => l.type === 'skip').map((l) => l.itemId)).toEqual(['post']);
  });

  it('pushes a split item once when one half was skipped by hand and the day ends', () => {
    const prev = runningDay({
      blocks: [
        morningRoutine({ status: 'complete' }),
        eveningRoutine(),
        postBlock({ id: `${DATE}:item-post-a`, status: 'skipped' }),
        postBlock({ id: `${DATE}:item-post-b` }),
      ],
    });
    expect(planFinishDay(prev, tenant(), DATE, NOW).pushes).toEqual([]);
  });

  it('does not push an item that already has a push from that date', () => {
    const t = tenantData({ ...tenant(), skipPushes: [{ itemId: 'post', toDate: '2026-09-01', fromDate: DATE } as never] });
    const prev = runningDay({ blocks: [morningRoutine({ status: 'complete' }), eveningRoutine(), postBlock()] });
    expect(planFinishDay(prev, t, DATE, NOW).pushes).toEqual([]);
  });

  it('re-ending a reopened day replaces its earlier score', () => {
    const prev = runningDay({
      blocks: [morningRoutine({ status: 'complete' }), eveningRoutine(), floorsBlock({ status: 'complete' }), postBlock({ status: 'complete' })],
      scoreDelta: 1,
    });
    const plan = planFinishDay(prev, tenant(), DATE, NOW);
    expect(plan.day?.scoreDelta).toBe(2);
    expect(plan.scoreDelta).toBe(1);
  });

  it('writes event_hours and clears eventStartedAt when ending from the event section', () => {
    const prev = runningDay({
      section: 'event',
      eventStartedAt: '2026-08-31T07:30:00.000Z',
      blocks: [morningRoutine({ status: 'complete' }), eveningRoutine()],
    });
    const plan = planFinishDay(prev, tenant(), DATE, NOW);
    expect(plan.logs.find((l) => l.type === 'event_hours')?.minutes).toBe(90);
    expect(plan.day?.eventStartedAt).toBeNull();
    expect(plan.day?.section).toBeNull();
  });
});

describe('log order', () => {
  it('keeps planner order and gives each row its own increasing time', () => {
    const prev = runningDay({
      blocks: [morningRoutine({ status: 'complete' }), eveningRoutine(), floorsBlock(), postBlock()],
    });
    const plan = planStartNext(prev, tenant(), DATE, 'morning', NOW);
    const types = plan.logs.map((l) => l.type);
    expect(types[types.length - 1]).toBe('start_next');
    expect(types.slice(0, -1).every((t) => t === 'skip')).toBe(true);
    const stamped = stampLogTimes(plan.logs, NOW);
    expect(stamped.map((l) => l.type)).toEqual(types);
    const times = stamped.map((l) => Date.parse(l.at));
    expect(times.every((t, i) => i === 0 || t > times[i - 1])).toBe(true);
  });
});

describe('planSkip appointment refund', () => {
  it('credits only the second appointment when an earlier one was already skipped', () => {
    const appt = (n: string, status: PackedBlock['status']) =>
      packedBlock({
        id: `${DATE}:item-${n}`,
        itemId: n,
        bucketId: APPOINTMENTS_ID,
        kind: 'appointment',
        title: n,
        durationMinutes: 60,
        slot: 'morning',
        status,
      });
    const prev = runningDay({
      blocks: [morningRoutine({ status: 'complete' }), eveningRoutine(), appt('one', 'skipped'), appt('dentist', 'pending')],
      sectionRemainingMinutes: 100,
    });
    expect(planSkip(prev, tenant(), DATE, `${DATE}:item-dentist`, NOW).day?.sectionRemainingMinutes).toBe(160);
  });
});

describe('planStartDay', () => {
  it('reopens an ended day, keeping startedAt', () => {
    const prev = runningDay({ section: null, endedAt: EARLIER, scoreDelta: 2 });
    const plan = planStartDay(prev, tenant(), DATE, NOW);
    expect(plan.day?.endedAt).toBeNull();
    expect(plan.day?.startedAt).toBe(EARLIER);
    expect(plan.day?.section).toBe('morning');
    expect(plan.logs.map((l) => l.type)).toEqual(['start_day']);
  });

  it('does nothing on a day that is started and not ended', () => {
    expect(planStartDay(runningDay(), tenant(), DATE, NOW).day).toBeNull();
  });

  it('starts the event section on an event day', () => {
    const events = bucket({
      id: EVENTS_ID,
      kind: 'event',
      name: 'Events',
      weight: 1,
      ranges: [{ id: 'e1', startDate: DATE, endDate: DATE }],
    });
    const t = tenantData({ ...tenant(), buckets: [...tenant().buckets, events] });
    const plan = planStartDay(dayState({ blocks: [morningRoutine()] }), t, DATE, NOW);
    expect(plan.day?.section).toBe('event');
    expect(plan.day?.eventStartedAt).toBe(NOW.iso);
    expect(plan.day?.sectionRemainingMinutes).toBe(0);
  });
});

describe('planRespawn edges', () => {
  it('has no score change when the day scored nothing', () => {
    expect(planRespawn(dayState(), tenant(), DATE, NOW).scoreDelta).toBe(0);
  });

  it('plans a fresh day when none is stored', () => {
    const plan = planRespawn(null, tenant(), DATE, NOW);
    expect(plan.day?.startedAt).toBeNull();
    expect(plan.scoreDelta).toBe(0);
    expect(plan.deletePushesFrom).toBe(DATE);
  });
});

describe('planRepack with no stored day', () => {
  it('returns the full field set', () => {
    const day = planRepack(null, tenant(), DATE, NOW).day;
    expect(day).toMatchObject({
      startedAt: null,
      endedAt: null,
      packedAt: NOW.iso,
      section: null,
      sectionStartedAt: null,
      sectionRemainingMinutes: null,
      pausedAt: null,
      sectionExtra: {},
      sectionUsed: {},
      eventStartedAt: null,
    });
    expect(day?.blocks).toBeDefined();
    expect(day?.dropped).toBeDefined();
  });
});
