import { useMemo, useState } from 'react';

import { FormField } from '../components/FormField';
import { SortableList } from '../components/SortableList';
import { DaySectionsBar } from '../components/DaySectionsBar';
import { WeekBudgetBar } from '../components/WeekBudgetBar';
import { CollapsibleBucket } from '../components/CollapsibleBucket';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  assignedWeekMinutes,
  collapsedSlotHours,
  derivedWeeklyMinutes,
  eventsSummaryLabel,
  formatBucketHours,
  formatHoursField,
  hoursMinutesOf,
  hoursModeOf,
  personalWeekMinutes,
  weekBudgetSummary,
  type WeekBudgetSummary,
} from '../domain/budget';
import { durationInputs, formatDuration, hoursToMinutes, splitMinutes } from '../domain/duration';
import { eventRangeForItem, eventRangeName, eventRanges, newEventRangeId, parseEventRanges } from '../domain/events';
import { PACK_RANGE_DAYS } from '../domain/packWeek';
import { canDeleteBucket, canRenameBucket, listCadenceDays, listableBuckets, splitEditBuckets } from '../domain/seed';
import { bucketSlots, itemSlots, itemWorkSlot, workShowsItemSlot } from '../domain/sections';
import { isAppointmentBucket } from '../domain/seed';
import {
  APPOINTMENTS_ID,
  EVENTS_ID,
  SLOTS,
  WEEKDAYS,
  type Bucket,
  type EventRange,
  type Cadence,
  type DaySettings,
  type HoursMode,
  type ListItem,
  type Slot,
  type Weekday,
} from '../domain/types';
import { api } from '../services/api';
import { useBuckets, useItems, useSettings } from '../services/live';
import { useAuth } from '../shared/auth';
import { formatActionError } from '../shared/formatActionError';
import { toActionError, type ActionError } from '../shared/actionError';
import { Chrome } from '../components/Chrome';

const TABS = ['day', 'buckets', 'lists'] as const;

export function EditPage() {
  const { user } = useAuth();
  const settings = useSettings(user?.uid);
  const buckets = useBuckets(user?.uid);
  const items = useItems(user?.uid);
  const [tab, setTab] = useState<(typeof TABS)[number]>('day');
  const [error, setError] = useState<ActionError | null>(null);

  // No success message: the page re-renders from live data, which is the
  // confirmation. Failures show where they happened instead.
  async function act(label: string, fn: () => Promise<unknown>, failed?: string) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      setError(toActionError(err, failed || label.replace(/\.$/, '')));
    }
  }

  async function rebuild() {
    await api.rebuildRange({ days: PACK_RANGE_DAYS });
  }

  return (
    <Chrome title="Strategize">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`tab${tab === t ? ' is-on' : ''}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      {tab === 'day' && settings ? (
        <DayForm
          settings={settings}
          onSave={(payload) =>
            act('Page saved.', async () => {
              await api.saveSettings(payload);
              await rebuild();
            })
          }
          onResetToday={() => act('Quests reset. +1 Life', () => api.resetToday(), 'Respawn')}
          onReroll={() => act('Stats rerolled.', () => api.clearLogs(), 'Reroll Stats')}
        />
      ) : null}
      {tab === 'buckets' && settings ? (
        <BucketsForm
          settings={settings}
          buckets={buckets}
          onSave={(payload) => act('Page saved.', () => api.saveBuckets(payload))}
          onReorder={(ids) =>
            act('Order saved.', async () => {
              await api.reorderBuckets({ weightedOrderIds: ids });
            })
          }
          onRemove={(id) =>
            act('Bucket removed.', async () => {
              await api.archiveBucket({ id });
              await rebuild();
            })
          }
        />
      ) : null}
      {tab === 'lists' ? (
        <ListsForm
          buckets={listableBuckets(buckets)}
          items={items}
          error={error}
          onSaveAll={(rows) => act('Page saved.', () => api.saveItems({ rows }), 'Save')}
          onReorder={(ids) =>
            act('Order saved.', async () => {
              await api.reorderItems({ orderedIds: ids });
            })
          }
          onRemove={(id) =>
            act('Item removed.', async () => {
              await api.archiveItem({ id });
            })
          }
        />
      ) : null}
    </Chrome>
  );
}

function DayForm({
  settings,
  onSave,
  onResetToday,
  onReroll,
}: {
  settings: DaySettings;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onResetToday: () => Promise<void>;
  onReroll: () => Promise<void>;
}) {
  // Erasing the log cannot be undone, so it asks. A dialog rather than a
  // second press on the same button: a label that changes under your finger
  // never reads as a question.
  const [confirmReroll, setConfirmReroll] = useState(false);
  const day = splitMinutes(settings.dayMinutes);
  const [liveMinutes, setLiveMinutes] = useState<number | null>(null);
  const dayMinutes = liveMinutes ?? settings.dayMinutes;
  return (
    <form
      className="edit-page"
      onInput={(e) => setLiveMinutes(durationFrom(e.currentTarget, 'day', settings.dayMinutes))}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSave({
          dayMinutes: hoursToMinutes(fd.get('dayH'), fd.get('dayM')),
          dayStartMinutes: settings.dayStartMinutes,
          transitionMinutes: Number(fd.get('trans')),
          timezone: 'America/Chicago',
          morningMinutes: settings.morningMinutes,
          breakMinutes: settings.breakMinutes,
          eveningMinutes: settings.eveningMinutes,
          timerSound: fd.get('timerSound') === 'on',
          timerVibrate: fd.get('timerVibrate') === 'on',
          personalCountsAsDay: fd.get('personalCountsAsDay') === 'on',
        });
      }}
    >
      <DaySectionsBar dayMinutes={dayMinutes} />
      <div className="edit-card meta-form">
        <div className="fields">
          <DurationFields name="day" label="Day Length" h={day.hours} m={day.minutes} />
          <FormField label="Transition minutes">
            <input name="trans" type="number" min={0} defaultValue={settings.transitionMinutes} />
          </FormField>
          <div className="field">
            <span>Personal time</span>
            <div className="pills" role="group" aria-label="Personal time">
              <label>
                <input
                  name="personalCountsAsDay"
                  type="checkbox"
                  defaultChecked={settings.personalCountsAsDay === true}
                />
                Counts as day hours
              </label>
            </div>
          </div>
          <div className="field">
            <span>Timer alerts</span>
            <div className="pills" role="group" aria-label="Timer alerts">
              <label>
                <input name="timerSound" type="checkbox" defaultChecked={settings.timerSound !== false} />
                Sound
              </label>
              <label>
                <input name="timerVibrate" type="checkbox" defaultChecked={settings.timerVibrate === true} />
                Vibrate
              </label>
            </div>
          </div>
        </div>
      </div>
      <div className="page-save">
        <button type="button" className="btn--green" onClick={() => onResetToday()}>
          Respawn
        </button>
        <button type="button" className="btn--red" onClick={() => setConfirmReroll(true)}>
          Reroll Stats
        </button>
        <button type="submit" className="btn--gold">
          Save
        </button>
      </div>
      <ConfirmDialog
        open={confirmReroll}
        title="Erase all Stats?"
        confirmLabel="Erase"
        onCancel={() => setConfirmReroll(false)}
        onConfirm={() => {
          setConfirmReroll(false);
          onReroll();
        }}
      />
    </form>
  );
}

function DurationFields({
  name,
  label,
  h,
  m,
  invalid,
}: {
  name: string;
  label: string;
  h: number;
  m: number;
  invalid?: boolean;
}) {
  return (
    <div className={`duration-fields${invalid ? ' is-invalid' : ''}`}>
      <span className="duration-fields__name">{label}</span>
      <div className="duration-fields__inputs">
        <FormField label="Hrs">
          <input name={`${name}H`} type="number" min={0} defaultValue={h} />
        </FormField>
        <FormField label="Min">
          <input name={`${name}M`} type="number" min={0} max={59} defaultValue={m} />
        </FormField>
      </div>
    </div>
  );
}

function inputValue(root: ParentNode, selector: string): string | null {
  const el = root.querySelector(selector);
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.value : null;
}

function durationFrom(root: ParentNode, prefix: string, fallback: number): number {
  const h = inputValue(root, `input[name="${prefix}H"]`);
  if (h == null) return fallback;
  return hoursToMinutes(h, inputValue(root, `input[name="${prefix}M"]`) || '0');
}

function formHoursMode(form: HTMLFormElement): HoursMode {
  const checked = form.querySelector('input[name="hoursMode"]:checked');
  return checked instanceof HTMLInputElement && checked.value === 'day' ? 'day' : 'week';
}

function formDays(form: HTMLFormElement): Weekday[] {
  return [...form.querySelectorAll('input[name="days"]:checked')].flatMap((el) =>
    el instanceof HTMLInputElement ? [el.value as Weekday] : []
  );
}

function formSlots(form: HTMLFormElement): Slot[] {
  const checked = [...form.querySelectorAll('input[name="slots"]:checked')].flatMap((el) =>
    el instanceof HTMLInputElement && SLOTS.includes(el.value as Slot) ? [el.value as Slot] : []
  );
  if (checked.length) return SLOTS.filter((s) => checked.includes(s));
  const one = inputValue(form, 'select[name="slot"]');
  if (one === 'morning' || one === 'midday' || one === 'evening') return [one];
  return [];
}

function liveWeekBudget(root: HTMLElement, settings: DaySettings): WeekBudgetSummary {
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

function bucketPayloadFromForm(form: HTMLFormElement, fallback: { id?: string; kind: string; weight: number }) {
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

function BucketsForm({
  settings,
  buckets,
  onSave,
  onReorder,
  onRemove,
}: {
  settings: DaySettings;
  buckets: Bucket[];
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [rangeError, setRangeError] = useState<string | null>(null);
  const { personal, appointments, work, events, weighted } = splitEditBuckets(buckets);
  const ids = weighted.map((b) => b.id);
  const saved = useMemo(
    () => weekBudgetSummary(settings, assignedWeekMinutes(buckets)),
    [settings, buckets]
  );
  const cacheKey = `${settings.dayMinutes}-${settings.morningMinutes}-${settings.breakMinutes}-${settings.eveningMinutes}-${buckets.map(b => b.id).join(',')}`;
  const [liveState, setLiveState] = useState<{ key: string; value: WeekBudgetSummary | null }>({ key: '', value: null });
  const live = liveState.key === cacheKey ? liveState.value : null;

  function refreshLive(root: HTMLElement) {
    setLiveState({ key: cacheKey, value: liveWeekBudget(root, settings) });
  }

  return (
    <div
      className="edit-page"
      onInput={(e) => refreshLive(e.currentTarget)}
      onChange={(e) => refreshLive(e.currentTarget)}
    >
      <WeekBudgetBar summary={live ?? saved} />
      <AppointmentsCard bucket={appointments} />
      <PersonalCard settings={settings} bucket={personal} />
      <BucketCard bucket={work} />
      <EventsCard bucket={events} />
      <SortableList ids={ids} onReorder={(next) => onReorder(next)}>
        {(id) => {
          const bucket = weighted.find((b) => b.id === id);
          if (!bucket) return null;
          return <BucketCard bucket={bucket} onRemove={onRemove} />;
        }}
      </SortableList>
      <div className="edit-card add-card">
        <h3 className="group-h">Add New</h3>
        <BucketFields kind="new" />
      </div>
      <div className="page-save">
        {rangeError ? <p className="err page-save__err">{rangeError}</p> : null}
        <button
          type="button"
          className="btn--gold"
          onClick={(e) => {
            const root = e.currentTarget.closest('.edit-page');
            if (!(root instanceof HTMLElement)) return;
            const personalForm = root.querySelector<HTMLFormElement>('form[data-kind="personal"]');
            const rows: Record<string, unknown>[] = [];
            root.querySelectorAll<HTMLFormElement>('form[data-kind="work"], form[data-kind="weighted"]').forEach((form) => {
              const id = form.dataset.id;
              const kind = form.dataset.kind || 'weighted';
              const weight = Number(form.dataset.weight || 0);
              rows.push(bucketPayloadFromForm(form, { id, kind, weight }));
            });
            const apptForm = root.querySelector<HTMLFormElement>('form[data-kind="appointment"]');
            if (apptForm) {
              rows.push({
                id: APPOINTMENTS_ID,
                kind: 'appointment',
                name: 'Appointments',
                weight: 0,
                hoursMode: 'week',
                hoursMinutes: 0,
                days: WEEKDAYS,
                slot: 'morning',
                slots: SLOTS,
                color: String(new FormData(apptForm).get('color') || '').replace('#', ''),
              });
            }
            const eventsForm = root.querySelector<HTMLFormElement>('form[data-kind="event"]');
            if (eventsForm) {
              const fd = new FormData(eventsForm);
              const ids = fd.getAll('rangeId').map(String);
              const names = fd.getAll('rangeName').map(String);
              const starts = fd.getAll('rangeStart').map(String);
              const ends = fd.getAll('rangeEnd').map(String);
              let ranges: EventRange[] = [];
              try {
                ranges = parseEventRanges(
                  ids.map((id, i) => ({ id, name: names[i] || '', startDate: starts[i] || '', endDate: ends[i] || '' }))
                );
              } catch (err) {
                setRangeError(formatActionError(err, 'Events'));
                return;
              }
              rows.push({
                id: EVENTS_ID,
                kind: 'event',
                name: 'Events',
                weight: 0,
                hoursMode: 'week',
                hoursMinutes: 0,
                days: WEEKDAYS,
                slot: 'morning',
                color: String(fd.get('color') || '').replace('#', ''),
                ranges,
                startDate: '',
                endDate: '',
              });
            }
            const addForm = root.querySelector<HTMLFormElement>('form[data-kind="new"]');
            if (addForm) {
              const payload = bucketPayloadFromForm(addForm, { kind: 'weighted', weight: weighted.length + 2 });
              if (payload.name) rows.push(payload);
            }
            const personalFd = personalForm ? new FormData(personalForm) : null;
            onSave({
              personal: {
                morningMinutes: personalForm ? hoursToMinutes(personalFd?.get('mH'), personalFd?.get('mM')) : settings.morningMinutes,
                breakMinutes: personalForm ? hoursToMinutes(personalFd?.get('bH'), personalFd?.get('bM')) : settings.breakMinutes,
                eveningMinutes: personalForm ? hoursToMinutes(personalFd?.get('eH'), personalFd?.get('eM')) : settings.eveningMinutes,
                color: String(personalFd?.get('color') || '').replace('#', ''),
              },
              buckets: rows,
            });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

// The board, packing and weekStart all run Sunday-first; the picker follows.
const DAY_PICKER_ORDER: Weekday[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DayChips({
  name,
  isOn,
  isOpen,
}: {
  name: string;
  isOn: (d: Weekday) => boolean;
  isOpen?: (d: Weekday) => boolean;
}) {
  return (
    <div className="day-chips" role="group" aria-label="Days">
      {DAY_PICKER_ORDER.map((d) => {
        const open = isOpen ? isOpen(d) : true;
        return (
          <label key={d}>
            <input name={name} type="checkbox" value={d} aria-label={d} disabled={!open} defaultChecked={open && isOn(d)} />
            <span aria-hidden="true">{d[0]}</span>
          </label>
        );
      })}
    </div>
  );
}

function CompactHours({
  name,
  h,
  m,
}: {
  name: string;
  h: number;
  m: number;
}) {
  return (
    <div className="compact-hours">
      <FormField label="Hrs">
        <input name={`${name}H`} type="number" min={0} defaultValue={h} />
      </FormField>
      <FormField label="Min">
        <input name={`${name}M`} type="number" min={0} max={59} defaultValue={m} />
      </FormField>
    </div>
  );
}

/**
 * Appointments is a container, not a scheduled bucket: no hours, no days, no
 * sections. The only thing to set is the colour every appointment wears.
 */
function AppointmentsCard({ bucket }: { bucket: Bucket }) {
  return (
    <CollapsibleBucket title="Appointments" hours="always first" color={bucket.color}>
      <form
        key={bucket.color}
        data-kind="appointment"
        data-id={APPOINTMENTS_ID}
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <div className="fields">
          <FormField label="Color">
            <input name="color" type="color" defaultValue={`#${bucket.color || 'e85d4c'}`} />
          </FormField>
        </div>
        <p className="hint">
          Appointments are packed before every other bucket in their section. Add them under Lists.
        </p>
      </form>
    </CollapsibleBucket>
  );
}

function PersonalCard({ settings, bucket }: { settings: DaySettings; bucket: Bucket }) {
  const morning = splitMinutes(settings.morningMinutes);
  const brk = splitMinutes(settings.breakMinutes);
  const evening = splitMinutes(settings.eveningMinutes);
  return (
    <CollapsibleBucket
      title="Personal"
      hours={formatDuration(personalWeekMinutes(settings))}
      color={bucket.color}
      liveHours={(root) => {
        const form = root.querySelector('form');
        if (!(form instanceof HTMLFormElement)) return formatDuration(personalWeekMinutes(settings));
        return formatDuration(
          personalWeekMinutes({
            ...settings,
            morningMinutes: durationFrom(form, 'm', settings.morningMinutes),
            breakMinutes: durationFrom(form, 'b', settings.breakMinutes),
            eveningMinutes: durationFrom(form, 'e', settings.eveningMinutes),
          })
        );
      }}
    >
      <form
        key={`${settings.morningMinutes}-${settings.breakMinutes}-${settings.eveningMinutes}-${bucket.color}`}
        data-kind="personal"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <div className="personal-grid">
          <div className="personal-hit">
            <span className="compact-hours__label">Morning</span>
            <CompactHours name="m" h={morning.hours} m={morning.minutes} />
          </div>
          <div className="personal-hit">
            <span className="compact-hours__label">Break</span>
            <CompactHours name="b" h={brk.hours} m={brk.minutes} />
          </div>
          <div className="personal-hit">
            <span className="compact-hours__label">Evening</span>
            <CompactHours name="e" h={evening.hours} m={evening.minutes} />
          </div>
          <FormField label="Color">
            <input name="color" type="color" defaultValue={`#${bucket.color || '5b9bd5'}`} />
          </FormField>
        </div>
      </form>
    </CollapsibleBucket>
  );
}

function BucketCard({
  bucket,
  onRemove,
}: {
  bucket: Bucket;
  onRemove?: (id: string) => Promise<void>;
}) {
  return (
    <CollapsibleBucket
      title={bucket.name}
      hours={collapsedSlotHours(bucketSlots(bucket), formatBucketHours(bucket))}
      color={bucket.color}
      liveHours={(root) => {
        const form = root.querySelector('form');
        if (!(form instanceof HTMLFormElement)) return collapsedSlotHours(bucketSlots(bucket), formatBucketHours(bucket));
        const slots = formSlots(form);
        return collapsedSlotHours(slots.length ? slots : bucketSlots(bucket), formatHoursField(formHoursMode(form), durationFrom(form, 'w', 0)));
      }}
    >
      <BucketFields
        bucket={bucket}
        kind={bucket.kind === 'work' ? 'work' : 'weighted'}
        onRemove={onRemove && canDeleteBucket(bucket) ? () => onRemove(bucket.id) : undefined}
      />
    </CollapsibleBucket>
  );
}

function EventsCard({ bucket }: { bucket: Bucket }) {
  const [ranges, setRanges] = useState<EventRange[]>(() => eventRanges(bucket));
  return (
    <CollapsibleBucket
      title="Events"
      hours={eventsSummaryLabel(eventRanges(bucket))}
      color={bucket.color}
      liveHours={(root) => {
        const form = root.querySelector('form');
        if (!(form instanceof HTMLFormElement)) return eventsSummaryLabel(ranges);
        const starts = [...form.querySelectorAll<HTMLInputElement>('input[name="rangeStart"]')];
        const ends = [...form.querySelectorAll<HTMLInputElement>('input[name="rangeEnd"]')];
        return eventsSummaryLabel(starts.map((el, i) => ({ startDate: el.value, endDate: ends[i]?.value || '' })));
      }}
    >
      <form
        data-kind="event"
        data-id={EVENTS_ID}
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <div className="event-ranges">
          {ranges.map((range) => (
            <div key={range.id} className="event-range">
              <input type="hidden" name="rangeId" value={range.id} />
              <FormField label="Event" wide>
                <input name="rangeName" type="text" placeholder="Conference" defaultValue={range.name || ''} />
              </FormField>
              <FormField label="Start">
                <input name="rangeStart" type="date" defaultValue={range.startDate} />
              </FormField>
              <FormField label="End">
                <input name="rangeEnd" type="date" defaultValue={range.endDate} />
              </FormField>
              <button
                type="button"
                className="btn--red"
                onClick={() => setRanges((cur) => cur.filter((row) => row.id !== range.id))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="fields">
          <FormField label="Color">
            <input name="color" type="color" defaultValue={`#${bucket.color || 'c4923a'}`} />
          </FormField>
        </div>
        <div className="edit-acts">
          <button
            type="button"
            onClick={() => setRanges((cur) => [...cur, { id: newEventRangeId(), startDate: '', endDate: '' }])}
          >
            Add range
          </button>
        </div>
      </form>
    </CollapsibleBucket>
  );
}

function BucketFields({
  bucket,
  kind,
  onRemove,
}: {
  bucket?: Bucket;
  kind: 'work' | 'weighted' | 'new';
  onRemove?: () => void;
}) {
  const hours = splitMinutes(bucket ? hoursMinutesOf(bucket) : 0);
  const mode = bucket ? hoursModeOf(bucket) : 'week';
  const rename = !bucket || canRenameBucket(bucket);
  return (
    <form
      key={`${bucket?.id || 'new'}-${mode}-${hours.hours}-${hours.minutes}-${bucket?.color || ''}`}
      data-kind={kind}
      data-id={bucket?.id}
      data-weight={bucket?.weight}
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <div className="bucket-grid">
        <div className="bucket-row bucket-row--name">
          <FormField label="Name">
            <input name="name" defaultValue={bucket?.name || ''} readOnly={!rename} required={kind !== 'new'} />
          </FormField>
          <FormField label="Color">
            <input name="color" type="color" defaultValue={`#${bucket?.color || '94a3b8'}`} />
          </FormField>
        </div>
        <div className="bucket-row bucket-row--hours">
          <CompactHours name="w" h={hours.hours} m={hours.minutes} />
          <div className="field">
            <span>Per</span>
            <div className="pills" role="group" aria-label="Hours mode">
              <label>
                <input name="hoursMode" type="radio" value="week" defaultChecked={mode === 'week'} />
                Week
              </label>
              <label>
                <input name="hoursMode" type="radio" value="day" defaultChecked={mode === 'day'} />
                Day
              </label>
            </div>
          </div>
        </div>
        <div className="field">
          <span>Time of day</span>
          <div className="pills" role="group" aria-label="Time of day">
            {SLOTS.map((s) => (
              <label key={s}>
                <input
                  name="slots"
                  type="checkbox"
                  value={s}
                  defaultChecked={(bucket ? bucketSlots(bucket) : kind === 'work' ? ['midday'] : ['morning']).includes(s)}
                />
                {s}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Days</span>
          <DayChips name="days" isOn={(d) => (bucket ? bucket.days.includes(d) : true)} />
        </div>
        {onRemove ? (
          <div className="bucket-days">
            {onRemove ? (
              <button type="button" className="btn--red bucket-remove" onClick={onRemove}>
                Remove
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}

function ListsForm({
  buckets,
  items,
  error,
  onSaveAll,
  onReorder,
  onRemove,
}: {
  buckets: Bucket[];
  items: ListItem[];
  error: ActionError | null;
  onSaveAll: (rows: Record<string, unknown>[]) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const grouped = useMemo(() => {
    const map: Record<string, ListItem[]> = {};
    for (const it of items) {
      if (!map[it.bucketId]) map[it.bucketId] = [];
      map[it.bucketId].push(it);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.weight - b.weight);
    return map;
  }, [items]);

  return (
    <div className="edit-page">
      <div className="edit-card add-card">
        <h3 className="group-h">Add New</h3>
        <ItemFields buckets={buckets} error={error} />
      </div>
      {buckets.map((b) => {
        const rows = grouped[b.id] || [];
        if (!rows.length) return null;
        const ids = rows.map((r) => r.id);
        // Events items are grouped under the event they belong to, so you read
        // "Conference · 3" rather than one flat pile keyed by remembered dates.
        if (b.kind === 'event' || b.id === EVENTS_ID) {
          const ranges = eventRanges(b);
          const byEvent = ranges.map((r) => ({
            range: r,
            rows: rows.filter((row) => eventRangeForItem(ranges, row)?.id === r.id),
          }));
          const orphans = rows.filter((row) => !eventRangeForItem(ranges, row));
          return (
            <div key={b.id}>
              {byEvent.map(({ range, rows: eventRows }) => (
                <CollapsibleBucket
                  key={range.id}
                  title={eventRangeName(range)}
                  hours={`${range.startDate} to ${range.endDate} · ${eventRows.length}`}
                  color={b.color}
                >
                  {eventRows.map((row) => (
                    <div key={row.id} className="edit-card" style={{ ['--bcolor' as string]: `#${b.color}` }}>
                      <ItemFields buckets={buckets} item={row} error={error} />
                      <div className="edit-acts">
                        <button type="button" className="btn--red" onClick={() => onRemove(row.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {!eventRows.length ? <p className="hint">Nothing scheduled for this event yet.</p> : null}
                </CollapsibleBucket>
              ))}
              {orphans.length ? (
                <CollapsibleBucket title="Unassigned" hours={String(orphans.length)} color={b.color}>
                  {orphans.map((row) => (
                    <div key={row.id} className="edit-card" style={{ ['--bcolor' as string]: `#${b.color}` }}>
                      <ItemFields buckets={buckets} item={row} error={error} />
                      <div className="edit-acts">
                        <button type="button" className="btn--red" onClick={() => onRemove(row.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </CollapsibleBucket>
              ) : null}
            </div>
          );
        }
        return (
          <CollapsibleBucket key={b.id} title={b.name} hours={String(rows.length)} color={b.color}>
            <SortableList ids={ids} onReorder={(next) => onReorder(next)}>
              {(id) => {
                const row = rows.find((r) => r.id === id);
                if (!row) return null;
                return (
                  <div className="edit-card" style={{ ['--bcolor' as string]: `#${b.color}` }}>
                    <ItemFields buckets={buckets} item={row} error={error} />
                    <div className="edit-acts">
                      <button type="button" className="btn--red" onClick={() => onRemove(row.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              }}
            </SortableList>
          </CollapsibleBucket>
        );
      })}
      <div className="page-save">
        {error ? <p className="err page-save__err">{error.message}</p> : null}
        <button
          type="button"
          className="btn--gold"
          onClick={(e) => {
            const root = e.currentTarget.closest('.edit-page');
            if (!(root instanceof HTMLElement)) return;
            // Collapsed groups are hidden, not removed, so their fields are
            // still here to read.
            const rows = [...root.querySelectorAll<HTMLFormElement>('form[data-kind="item"]')]
              .map((form) => itemPayloadFromForm(form, buckets))
              .filter((row): row is Record<string, unknown> => row !== null);
            onSaveAll(rows);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

/**
 * Read one item row out of its form. Pure, so the page Save can build exactly
 * the same payload the row Save built — no component state involved beyond
 * what the form itself holds.
 */
function itemPayloadFromForm(form: HTMLFormElement, buckets: Bucket[]): Record<string, unknown> | null {
  const fd = new FormData(form);
  const title = String(fd.get('title') || '').trim();
  const bucketId = String(fd.get('bucketId') || '');
  // An untouched Add New row is not a row.
  if (!title || !bucketId) return null;
  const bucket = buckets.find((b) => b.id === bucketId);
  const eventItem = Boolean(bucket && (bucket.kind === 'event' || bucket.id === EVENTS_ID));
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
      const startDate = String(fd.get('startDate') || '').trim();
      cadence = {
        kind: 'everyNDays',
        n: Number(fd.get('everyN')) || 2,
        startWeekday: (openDays.includes(String(fd.get('startWeekday')) as Weekday)
          ? String(fd.get('startWeekday'))
          : openDays[0] || 'Mon') as Weekday,
        ...(startDate ? { startDate } : {}),
      };
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
    durationMinutes: hoursToMinutes(fd.get('iH'), fd.get('iM')),
    cadence,
    dueAt: type === 'scheduled' ? fd.get('dueAt') : '',
    ...(apptItem
      ? { slots: fd.getAll('slots') }
      : bucket && workShowsItemSlot(bucket)
        ? { slot: fd.get('slot') }
        : {}),
    ...(apptItem ? { apptTime: fd.get('apptTime') } : {}),
    ...(eventItem ? { eventId: fd.get('eventId') } : {}),
  };
}

function ItemFields({
  buckets,
  item,
  error,
}: {
  buckets: Bucket[];
  item?: ListItem;
  error?: ActionError | null;
}) {
  // Only the row the server named is marked, so one bad row does not light up
  // the whole page.
  const failed = error && error.itemId && error.itemId === item?.id ? error : null;
  const invalid = (field: string) => (failed?.field === field ? ' is-invalid' : '');
  const dur = durationInputs(item?.durationMinutes, { hours: 0, minutes: 30 });
  const [bucketId, setBucketId] = useState(item?.bucketId || buckets[0]?.id);
  const currentBucket = buckets.find((b) => b.id === bucketId);
  const eventItem = Boolean(currentBucket && (currentBucket.kind === 'event' || currentBucket.id === EVENTS_ID));
  const apptItem = isAppointmentBucket(currentBucket);
  const [kind, setKind] = useState<ListItem['type']>(item?.type || 'recurring');
  /** Events are always pinned to a date; an appointment only while scheduled. */
  const slotPick = currentBucket ? workShowsItemSlot(currentBucket) : false;
  const slotOptions = currentBucket ? bucketSlots(currentBucket) : [];
  const eventOptions = eventRanges(buckets.find((b) => b.kind === 'event' || b.id === EVENTS_ID));
  const [eventId, setEventId] = useState(
    item?.eventId || eventRangeForItem(eventOptions, item || {})?.id || ''
  );
  const chosenEvent = eventOptions.find((r) => r.id === eventId);
  const openDays = listCadenceDays(currentBucket);
  const [cadenceKind, setCadenceKind] = useState(item?.cadence.kind || 'daily');
  return (
    <form
      data-kind="item"
      data-id={item?.id}
      className={failed ? 'is-invalid-row' : undefined}
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="fields">
        <FormField label="Title" wide>
          <input name="title" defaultValue={item?.title || ''} required />
        </FormField>
        <FormField label="Bucket">
          <select
            name="bucketId"
            defaultValue={item?.bucketId || buckets[0]?.id}
            onChange={(e) => setBucketId(e.target.value)}
          >
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </FormField>
        <DurationFields name="i" label="Duration" h={dur.hours} m={dur.minutes} invalid={Boolean(invalid('iH'))} />
        {apptItem && currentBucket ? (
          <div className="field field--wide">
            <span>Sections it spans</span>
            <div className={`pills${invalid('slots')}`} role="group" aria-label="Sections it spans">
              {slotOptions.map((s) => (
                <label key={s}>
                  <input
                    name="slots"
                    type="checkbox"
                    value={s}
                    defaultChecked={itemSlots(item || {}, currentBucket).includes(s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
        ) : slotPick && currentBucket ? (
          <FormField label="Time of day">
            <select
              key={bucketId}
              name="slot"
              className={invalid('slot').trim() || undefined}
              defaultValue={itemWorkSlot(item || {}, currentBucket)}
            >
              {slotOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
        {eventItem ? (
          <>
            <FormField label="Event" wide>
              <select
                name="eventId"
                className={invalid('eventId').trim() || undefined}
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                required
              >
                <option value="">Pick an event</option>
                {eventOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {eventRangeName(r)} · {r.startDate} to {r.endDate}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Date">
              <input
                name="dueAt"
                type="date"
                className={invalid('dueAt').trim() || undefined}
                defaultValue={item?.dueAt || ''}
                {...(chosenEvent ? { min: chosenEvent.startDate, max: chosenEvent.endDate } : {})}
                required
              />
            </FormField>
          </>
        ) : (
          <>
            <FormField label="Type">
              <select name="type" defaultValue={kind} onChange={(e) => setKind(e.target.value as ListItem['type'])}>
                <option value="recurring">Recurring</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </FormField>
            <FormField label="Cadence">
              <select name="cadenceKind" defaultValue={cadenceKind} onChange={(e) => setCadenceKind(e.target.value as Cadence['kind'])}>
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekends">Weekends</option>
                <option value="weekly">Weekly days</option>
                <option value="everyNDays">Every N days</option>
                <option value="monthly">Monthly</option>
              </select>
            </FormField>
            {kind === 'scheduled' ? (
              <FormField label={apptItem ? 'Date' : 'Due'}>
                <input
                  name="dueAt"
                  type="date"
                  className={invalid('dueAt').trim() || undefined}
                  defaultValue={item?.dueAt || ''}
                  required
                />
              </FormField>
            ) : null}
            {apptItem ? (
              <FormField label="Time (label only)">
                <input name="apptTime" type="time" defaultValue={item?.apptTime || ''} />
              </FormField>
            ) : null}
          </>
        )}
      </div>
      {!eventItem && cadenceKind === 'weekly' ? (
        <div key={bucketId} className="field" style={{ marginTop: '10px' }}>
          <span>Days</span>
          <DayChips
            name="weeklyDays"
            isOpen={(d) => openDays.includes(d)}
            isOn={(d) => (item?.cadence.kind === 'weekly' ? item.cadence.days.includes(d) : false)}
          />
        </div>
      ) : null}
      {!eventItem && cadenceKind === 'everyNDays' ? (
        <div key={`${bucketId}-n`} className="fields" style={{ marginTop: '10px' }}>
          <FormField label="Every N days">
            <input name="everyN" type="number" min={2} defaultValue={item?.cadence.kind === 'everyNDays' ? item.cadence.n : 2} />
          </FormField>
          <FormField label="Start weekday">
            <select
              name="startWeekday"
              defaultValue={
                item?.cadence.kind === 'everyNDays' && openDays.includes(item.cadence.startWeekday)
                  ? item.cadence.startWeekday
                  : openDays[0] || 'Mon'
              }
            >
              {WEEKDAYS.map((d) => (
                <option key={d} value={d} disabled={!openDays.includes(d)}>
                  {d}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Start date">
            <input
              name="startDate"
              type="date"
              defaultValue={item?.cadence.kind === 'everyNDays' ? item.cadence.startDate || '' : ''}
            />
          </FormField>
        </div>
      ) : null}
      {!eventItem && cadenceKind === 'monthly' ? (
        <div className="fields" style={{ marginTop: '10px' }}>
          <FormField label="Day of month">
            <input name="monthDay" type="number" min={1} max={31} defaultValue={item?.cadence.kind === 'monthly' ? item.cadence.dayOfMonth : 1} />
          </FormField>
        </div>
      ) : null}
    </form>
  );
}

