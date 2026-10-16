import { nextOpenDay } from '../../domain/cadence';
import { derivedWeeklyMinutes, weekBudgetSummary, type WeekBudgetSummary } from '../../domain/budget';
import { durationFromInputs, hoursToMinutes } from '../../domain/duration';
import { isEventsBucket } from '../../domain/predicates';
import { isAppointmentBucket, listCadenceDays } from '../../domain/seed';
import { sectionMinutes, workShowsItemSlot } from '../../domain/sections';
import { SLOTS, type Bucket, type Cadence, type DaySettings, type HoursMode, type Slot, type Weekday } from '../../domain/types';
import { todayKey } from '../../shared/dates';

/** The colour a bucket starts with in Add New, before anyone picks one. */
export const NEW_BUCKET_COLOR = '94a3b8';

/** Every setting the Day form reads, so a save or a change from another device remounts it with the new values. */
export function dayFormKey(s: DaySettings): string {
  return JSON.stringify([
    s.dayMinutes,
    sectionMinutes(s),
    s.transitionMinutes,
    s.dayStartMinutes,
    s.morningMinutes,
    s.breakMinutes,
    s.eveningMinutes,
    s.timerSound,
    s.timerVibrate,
    s.personalCountsAsDay,
  ]);
}

export function inputValue(root: ParentNode, selector: string): string | null {
  const el = root.querySelector(selector);
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.value : null;
}

export function durationFrom(root: ParentNode, prefix: string, fallback: number): number {
  const h = inputValue(root, `input[name="${prefix}H"]`);
  if (h == null) return fallback;
  return hoursToMinutes(h, inputValue(root, `input[name="${prefix}M"]`) || '0');
}

export function formHoursMode(form: HTMLFormElement): HoursMode {
  const checked = form.querySelector('input[name="hoursMode"]:checked');
  return checked instanceof HTMLInputElement && checked.value === 'day' ? 'day' : 'week';
}

export function formDays(form: HTMLFormElement): Weekday[] {
  return [...form.querySelectorAll('input[name="days"]:checked')].flatMap((el) =>
    el instanceof HTMLInputElement ? [el.value as Weekday] : []
  );
}

export function formSlots(form: HTMLFormElement): Slot[] {
  const checked = [...form.querySelectorAll('input[name="slots"]:checked')].flatMap((el) =>
    el instanceof HTMLInputElement && SLOTS.includes(el.value as Slot) ? [el.value as Slot] : []
  );
  if (checked.length) return SLOTS.filter((s) => checked.includes(s));
  const one = inputValue(form, 'select[name="slot"]');
  if (one === 'morning' || one === 'midday' || one === 'evening') return [one];
  return [];
}

export function liveWeekBudget(root: HTMLElement, settings: DaySettings): WeekBudgetSummary {
  const next = {
    ...settings,
    morningMinutes: durationFrom(root, 'm', settings.morningMinutes),
    breakMinutes: durationFrom(root, 'b', settings.breakMinutes),
    eveningMinutes: durationFrom(root, 'e', settings.eveningMinutes),
  };
  let assigned = 0;
  root.querySelectorAll<HTMLFormElement>('form[data-kind="work"], form[data-kind="weighted"], form[data-kind="new"]').forEach((form) => {
    const name = inputValue(form, 'input[name="name"]')?.trim() || '';
    if (form.dataset.kind === 'new' && !name) return;
    assigned += derivedWeeklyMinutes(formHoursMode(form), durationFrom(form, 'w', 0), formDays(form));
  });
  return weekBudgetSummary(next, assigned);
}

export function bucketPayloadFromForm(form: HTMLFormElement, fallback: { id?: string; kind: string; weight: number }) {
  const fd = new FormData(form);
  return {
    id: fallback.id,
    kind: fallback.kind,
    name: String(fd.get('name') || '').trim(),
    weight: fallback.weight,
    hoursMode: formHoursMode(form),
    hoursMinutes: hoursToMinutes(fd.get('wH'), fd.get('wM')),
    days: fd.getAll('days'),
    slots: fd.getAll('slots'),
    slot: fd.get('slot') || fd.getAll('slots')[0],
    color: String(fd.get('color') || '').replace('#', ''),
  };
}

/** What a new item is worth before anyone says otherwise. */
export const ITEM_DEFAULT_MINUTES = 30;

/**
 * Read one item row out of its form. Pure, so the page Save can build exactly
 * the same payload the row Save built — no component state involved beyond
 * what the form itself holds.
 */
export function itemPayloadFromForm(form: HTMLFormElement, buckets: Bucket[]): Record<string, unknown> | null {
  const fd = new FormData(form);
  const title = String(fd.get('title') || '').trim();
  const bucketId = String(fd.get('bucketId') || '');
  // An untouched Add New row is not a row.
  if (!title || !bucketId) return null;
  const bucket = buckets.find((b) => b.id === bucketId);
  const eventItem = isEventsBucket(bucket);
  const apptItem = isAppointmentBucket(bucket);
  const openDays = listCadenceDays(bucket);
  // Events are pinned to a date; an appointment repeats if it says so.
  const type = eventItem ? 'scheduled' : String(fd.get('type') || 'recurring');
  const cadKind = String(fd.get('cadenceKind') || 'daily');

  let cadence: Cadence = { kind: 'daily' };
  if (!eventItem) {
    if (cadKind === 'weekdays' || cadKind === 'weekends' || cadKind === 'daily') {
      cadence = { kind: cadKind };
    } else if (cadKind === 'weekly') {
      cadence = { kind: 'weekly', days: (fd.getAll('weeklyDays') as Weekday[]).filter((d) => openDays.includes(d)) };
    } else if (cadKind === 'everyNDays') {
      // The start date is the whole definition of an every-N stream: it sets
      // both the phase and the weekday. Blank means starting today, and a day
      // the bucket does not run moves to the next one that it does — the
      // bucket's days bound the stream, not the other way round.
      const picked = String(fd.get('startDate') || '').trim() || todayKey();
      const startDate = openDays.length ? nextOpenDay(picked, openDays) : picked;
      cadence = { kind: 'everyNDays', n: Number(fd.get('everyN')) || 2, startDate };
    } else if (cadKind === 'monthly') {
      cadence = { kind: 'monthly', dayOfMonth: Number(fd.get('monthDay')) || 1 };
    }
  }

  const id = form.dataset.id;
  return {
    ...(id ? { id } : {}),
    bucketId,
    title,
    type,
    durationMinutes: durationFromInputs(fd.get('iH'), fd.get('iM'), ITEM_DEFAULT_MINUTES),
    cadence,
    dueAt: type === 'scheduled' ? fd.get('dueAt') : '',
    expiresAt: type === 'recurring' ? String(fd.get('expiresAt') || '') : '',
    ...(apptItem
      ? { slots: fd.getAll('slots') }
      : bucket && workShowsItemSlot(bucket)
        ? { slot: fd.get('slot') }
        : {}),
    ...(apptItem ? { apptTime: fd.get('apptTime') } : {}),
    ...(eventItem ? { eventId: fd.get('eventId') } : {}),
  };
}
