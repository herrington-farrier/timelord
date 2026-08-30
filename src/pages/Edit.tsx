import { useMemo, useState } from 'react';

import { FormField } from '../components/FormField';
import { SortableList } from '../components/SortableList';
import { DaySectionsBar } from '../components/DaySectionsBar';
import { WeekBudgetBar } from '../components/WeekBudgetBar';
import { CollapsibleBucket } from '../components/CollapsibleBucket';
import {
  assignedWeekMinutes,
  collapsedSlotHours,
  derivedWeeklyMinutes,
  eventsRangeLabel,
  formatBucketHours,
  formatHoursField,
  hoursMinutesOf,
  hoursModeOf,
  personalWeekMinutes,
  weekBudgetSummary,
  type WeekBudgetSummary,
} from '../domain/budget';
import { formatDuration, hoursToMinutes, splitMinutes } from '../domain/duration';
import { canDeleteBucket, canRenameBucket, listCadenceDays, listableBuckets, splitEditBuckets } from '../domain/seed';
import {
  EVENTS_ID,
  WEEKDAYS,
  type Appointment,
  type Bucket,
  type Cadence,
  type DaySettings,
  type HoursMode,
  type ListItem,
  type Slot,
  type Weekday,
} from '../domain/types';
import { api } from '../services/api';
import { useAppointments, useBuckets, useItems, useSettings } from '../services/live';
import { useAuth } from '../shared/auth';
import { formatActionError } from '../shared/formatActionError';
import { useToast } from '../shared/toast';
import { Chrome } from '../components/Chrome';

const TABS = ['day', 'buckets', 'lists', 'appointments'] as const;
const RANGE_DAYS = 21;

export function EditPage() {
  const { user } = useAuth();
  const settings = useSettings(user?.uid);
  const buckets = useBuckets(user?.uid);
  const items = useItems(user?.uid);
  const appointments = useAppointments(user?.uid);
  const [tab, setTab] = useState<(typeof TABS)[number]>('day');
  const { showToast } = useToast();

  async function act(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      showToast(label, 'success');
    } catch (err) {
      console.error(err);
      showToast(formatActionError(err, label.replace(/\.$/, '')), 'error');
    }
  }

  async function rebuild() {
    await api.rebuildRange({ days: RANGE_DAYS });
  }

  return (
    <Chrome title="Edit">
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
              await rebuild();
            })
          }
          onRemove={(id) =>
            act('Bucket removed.', async () => {
              await api.archiveBucket({ id });
              await rebuild();
            })
          }
          onReset={(id) =>
            act('Bucket reset.', () => api.resetBucket({ id }))
          }
        />
      ) : null}
      {tab === 'lists' ? (
        <ListsForm
          buckets={listableBuckets(buckets)}
          items={items}
          onSave={(row) =>
            act('Item saved.', async () => {
              await api.upsertItem(row);
              await rebuild();
            })
          }
          onReorder={(ids) =>
            act('Order saved.', async () => {
              await api.reorderItems({ orderedIds: ids });
              await rebuild();
            })
          }
          onRemove={(id) =>
            act('Item removed.', async () => {
              await api.archiveItem({ id });
              await rebuild();
            })
          }
        />
      ) : null}
      {tab === 'appointments' ? (
        <ApptForm
          appointments={appointments}
          onSave={(row) =>
            act('Appointment saved.', async () => {
              await api.upsertAppointment(row);
              await rebuild();
            })
          }
          onRemove={(id) =>
            act('Appointment removed.', async () => {
              await api.archiveAppointment({ id });
              await rebuild();
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
}: {
  settings: DaySettings;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
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
          <label className="check">
            <input name="timerSound" type="checkbox" defaultChecked={settings.timerSound !== false} />
            Timer sound
          </label>
          <label className="check">
            <input name="timerVibrate" type="checkbox" defaultChecked={settings.timerVibrate === true} />
            Timer vibrate
          </label>
        </div>
      </div>
      <div className="page-save">
        <button type="submit" className="primary">
          Save
        </button>
      </div>
    </form>
  );
}

function DurationFields({
  name,
  label,
  h,
  m,
}: {
  name: string;
  label: string;
  h: number;
  m: number;
}) {
  return (
    <div className="duration-fields">
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
    slot: fd.get('slot'),
    color: String(fd.get('color') || '').replace('#', ''),
  };
}

function BucketsForm({
  settings,
  buckets,
  onSave,
  onReorder,
  onRemove,
  onReset,
}: {
  settings: DaySettings;
  buckets: Bucket[];
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReset: (id: string) => Promise<void>;
}) {
  const { personal, work, events, weighted } = splitEditBuckets(buckets);
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
      <PersonalCard settings={settings} bucket={personal} />
      <BucketCard bucket={work} onReset={onReset} />
      <EventsCard bucket={events} />
      <SortableList ids={ids} onReorder={(next) => onReorder(next)}>
        {(id) => {
          const bucket = weighted.find((b) => b.id === id);
          if (!bucket) return null;
          return <BucketCard bucket={bucket} onRemove={onRemove} onReset={onReset} />;
        }}
      </SortableList>
      <div className="edit-card add-card">
        <h3 className="group-h">Add New</h3>
        <BucketFields kind="new" />
      </div>
      <div className="page-save">
        <button
          type="button"
          className="primary"
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
            const eventsForm = root.querySelector<HTMLFormElement>('form[data-kind="event"]');
            if (eventsForm) {
              const fd = new FormData(eventsForm);
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
                startDate: String(fd.get('startDate') || ''),
                endDate: String(fd.get('endDate') || ''),
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
  onReset,
}: {
  bucket: Bucket;
  onRemove?: (id: string) => Promise<void>;
  onReset?: (id: string) => Promise<void>;
}) {
  return (
    <CollapsibleBucket
      title={bucket.name}
      hours={collapsedSlotHours(bucket.slot, formatBucketHours(bucket))}
      color={bucket.color}
      liveHours={(root) => {
        const form = root.querySelector('form');
        if (!(form instanceof HTMLFormElement)) return collapsedSlotHours(bucket.slot, formatBucketHours(bucket));
        const slot = (inputValue(form, 'select[name="slot"]') || bucket.slot) as Slot;
        return collapsedSlotHours(slot, formatHoursField(formHoursMode(form), durationFrom(form, 'w', 0)));
      }}
    >
      <BucketFields
        bucket={bucket}
        kind={bucket.kind === 'work' ? 'work' : 'weighted'}
        onRemove={onRemove && canDeleteBucket(bucket) ? () => onRemove(bucket.id) : undefined}
        onReset={onReset ? () => onReset(bucket.id) : undefined}
      />
    </CollapsibleBucket>
  );
}

function EventsCard({ bucket }: { bucket: Bucket }) {
  return (
    <CollapsibleBucket
      title="Events"
      hours={eventsRangeLabel(bucket.startDate, bucket.endDate)}
      color={bucket.color}
      liveHours={(root) => {
        const form = root.querySelector('form');
        if (!(form instanceof HTMLFormElement)) return eventsRangeLabel(bucket.startDate, bucket.endDate);
        return eventsRangeLabel(inputValue(form, 'input[name="startDate"]') || '', inputValue(form, 'input[name="endDate"]') || '');
      }}
    >
      <form
        key={`${bucket.startDate || ''}-${bucket.endDate || ''}-${bucket.color}`}
        data-kind="event"
        data-id={EVENTS_ID}
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <div className="fields">
          <FormField label="Start date">
            <input name="startDate" type="date" defaultValue={bucket.startDate || ''} />
          </FormField>
          <FormField label="End date">
            <input name="endDate" type="date" defaultValue={bucket.endDate || ''} />
          </FormField>
          <FormField label="Color">
            <input name="color" type="color" defaultValue={`#${bucket.color || 'c4923a'}`} />
          </FormField>
        </div>
      </form>
    </CollapsibleBucket>
  );
}

function BucketFields({
  bucket,
  kind,
  onRemove,
  onReset,
}: {
  bucket?: Bucket;
  kind: 'work' | 'weighted' | 'new';
  onRemove?: () => void;
  onReset?: () => void;
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
        <div className="bucket-line">
          <FormField label="Name">
            <input name="name" defaultValue={bucket?.name || ''} readOnly={!rename} required={kind !== 'new'} />
          </FormField>
          <FormField label="Color">
            <input name="color" type="color" defaultValue={`#${bucket?.color || '94a3b8'}`} />
          </FormField>
          <CompactHours name="w" h={hours.hours} m={hours.minutes} />
          <div className="hours-mode" role="group" aria-label="Hours mode">
            <label>
              <input name="hoursMode" type="radio" value="week" defaultChecked={mode === 'week'} />
              Week
            </label>
            <label>
              <input name="hoursMode" type="radio" value="day" defaultChecked={mode === 'day'} />
              Day
            </label>
          </div>
          <FormField label="Time of day">
            <select name="slot" defaultValue={bucket?.slot || 'morning'}>
              {(['morning', 'midday', 'evening'] as Slot[]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="bucket-days">
          {WEEKDAYS.map((d) => (
            <label key={d} className="check">
              <input name="days" type="checkbox" value={d} defaultChecked={bucket ? bucket.days.includes(d) : true} />
              {d}
            </label>
          ))}
          {onReset ? (
            <button type="button" className="skip bucket-remove" onClick={onReset}>
              Reset
            </button>
          ) : null}
          {onRemove ? (
            <button type="button" className="danger bucket-remove" onClick={onRemove}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function ListsForm({
  buckets,
  items,
  onSave,
  onReorder,
  onRemove,
}: {
  buckets: Bucket[];
  items: ListItem[];
  onSave: (row: Record<string, unknown>) => Promise<void>;
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
        <ItemFields buckets={buckets} onSubmit={(payload) => onSave(payload)} />
      </div>
      {buckets.map((b) => {
        const rows = grouped[b.id] || [];
        if (!rows.length) return null;
        const ids = rows.map((r) => r.id);
        return (
          <div key={b.id}>
            <h3 className="group-h" style={{ ['--bcolor' as string]: `#${b.color}` }}>
              {b.name}
            </h3>
            <SortableList ids={ids} onReorder={(next) => onReorder(next)}>
              {(id) => {
                const row = rows.find((r) => r.id === id);
                if (!row) return null;
                return (
                  <div className="edit-card" style={{ ['--bcolor' as string]: `#${b.color}` }}>
                    <ItemFields
                      buckets={buckets}
                      item={row}
                      onSubmit={(payload) => onSave({ id: row.id, ...payload })}
                    />
                    <div className="edit-acts">
                      <button type="button" className="danger" onClick={() => onRemove(row.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              }}
            </SortableList>
          </div>
        );
      })}
    </div>
  );
}

function ItemFields({
  buckets,
  item,
  onSubmit,
}: {
  buckets: Bucket[];
  item?: ListItem;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const dur = splitMinutes(item?.durationMinutes || 30);
  const [bucketId, setBucketId] = useState(item?.bucketId || buckets[0]?.id);
  const currentBucket = buckets.find((b) => b.id === bucketId);
  const eventItem = Boolean(currentBucket && (currentBucket.kind === 'event' || currentBucket.id === EVENTS_ID));
  const openDays = listCadenceDays(currentBucket);
  const [kind, setKind] = useState(item?.type || 'recurring');
  const [cadenceKind, setCadenceKind] = useState(item?.cadence.kind || 'daily');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const type = eventItem ? 'scheduled' : String(fd.get('type'));
        const cadKind = String(fd.get('cadenceKind') || 'daily');
        let cadence: Cadence = { kind: 'daily' };
        if (!eventItem) {
          if (cadKind === 'weekdays' || cadKind === 'weekends' || cadKind === 'daily') {
            cadence = { kind: cadKind };
          } else if (cadKind === 'weekly') {
            cadence = {
              kind: 'weekly',
              days: (fd.getAll('weeklyDays') as Weekday[]).filter((d) => openDays.includes(d)),
            };
          } else if (cadKind === 'everyNDays') {
            cadence = {
              kind: 'everyNDays',
              n: Number(fd.get('everyN')) || 2,
              startWeekday: (openDays.includes(String(fd.get('startWeekday')) as Weekday)
              ? String(fd.get('startWeekday'))
              : openDays[0] || 'Mon') as Weekday,
            };
          } else if (cadKind === 'monthly') {
            cadence = { kind: 'monthly', dayOfMonth: Number(fd.get('monthDay')) || 1 };
          }
        }
        onSubmit({
          bucketId: fd.get('bucketId'),
          title: fd.get('title'),
          type,
          durationMinutes: hoursToMinutes(fd.get('iH'), fd.get('iM')),
          cadence,
          dueAt: type === 'scheduled' ? fd.get('dueAt') : '',
        });
      }}
    >
      <div className="fields">
        <FormField label="Title">
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
        <DurationFields name="i" label="Duration" h={dur.hours} m={dur.minutes} />
        {eventItem ? (
          <FormField label="Date">
            <input name="dueAt" type="date" defaultValue={item?.dueAt || ''} required />
          </FormField>
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
              <FormField label="Due">
                <input name="dueAt" type="date" defaultValue={item?.dueAt || ''} required />
              </FormField>
            ) : null}
          </>
        )}
      </div>
      {!eventItem && cadenceKind === 'weekly' ? (
        <div key={bucketId} className="fields" style={{ marginTop: '10px' }}>
          {WEEKDAYS.map((d) => {
            const open = openDays.includes(d);
            return (
              <label key={d} className="check">
                <input
                  name="weeklyDays"
                  type="checkbox"
                  value={d}
                  disabled={!open}
                  defaultChecked={open && item?.cadence.kind === 'weekly' ? item.cadence.days.includes(d) : false}
                />
                {d}
              </label>
            );
          })}
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
        </div>
      ) : null}
      {!eventItem && cadenceKind === 'monthly' ? (
        <div className="fields" style={{ marginTop: '10px' }}>
          <FormField label="Day of month">
            <input name="monthDay" type="number" min={1} max={31} defaultValue={item?.cadence.kind === 'monthly' ? item.cadence.dayOfMonth : 1} />
          </FormField>
        </div>
      ) : null}
      <div className="edit-acts">
        <button type="submit" className="primary">
          Save
        </button>
      </div>
    </form>
  );
}

function ApptForm({
  appointments,
  onSave,
  onRemove,
}: {
  appointments: Appointment[];
  onSave: (row: Record<string, unknown>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <div className="edit-page">
      <div className="edit-card add-card">
        <ApptFields onSubmit={(payload) => onSave(payload)} />
      </div>
      {appointments.map((a) => {
        const dur = splitMinutes(a.durationMinutes);
        return (
          <div key={a.id} className="edit-card" style={{ ['--bcolor' as string]: `#${a.color || 'f87171'}` }}>
            <ApptFields
              appointment={a}
              dur={dur}
              onSubmit={(payload) => onSave({ id: a.id, ...payload })}
            />
            <div className="edit-acts">
              <button type="button" className="danger" onClick={() => onRemove(a.id)}>
                Remove
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ApptFields({
  appointment,
  dur,
  onSubmit,
}: {
  appointment?: { title: string; date: string; color?: string };
  dur?: { hours: number; minutes: number };
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSubmit({
          title: fd.get('title'),
          date: fd.get('date'),
          durationMinutes: hoursToMinutes(fd.get('dH'), fd.get('dM')),
          color: String(fd.get('color') || '').replace('#', ''),
        });
      }}
    >
      <div className="fields">
        <FormField label="Title">
          <input name="title" defaultValue={appointment?.title || ''} required />
        </FormField>
        <FormField label="Date">
          <input name="date" type="date" defaultValue={appointment?.date || ''} required />
        </FormField>
        <DurationFields name="d" label="Duration" h={dur?.hours || 1} m={dur?.minutes || 0} />
        <FormField label="Color">
          <input name="color" type="color" defaultValue={`#${appointment?.color || 'f87171'}`} />
        </FormField>
      </div>
      <div className="edit-acts">
        <button type="submit" className="primary">
          Save
        </button>
      </div>
    </form>
  );
}
