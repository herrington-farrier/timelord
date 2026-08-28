import { useMemo, useState } from 'react';

import { FormField } from '../components/FormField';
import { SortableList } from '../components/SortableList';
import { hoursToMinutes, splitMinutes } from '../domain/duration';
import { canDeleteBucket } from '../domain/seed';
import { WEEKDAYS, type Bucket, type Cadence, type ListItem, type Slot } from '../domain/types';
import { api } from '../services/api';
import { useAppointments, useBuckets, useItems, useSettings } from '../services/live';
import { useAuth } from '../shared/auth';
import { formatActionError } from '../shared/formatActionError';
import { useToast } from '../shared/toast';
import { Chrome } from '../components/Chrome';

const TABS = ['day', 'buckets', 'lists', 'appointments'] as const;

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
          onSave={(payload) => act('Page saved.', () => api.saveSettings(payload))}
        />
      ) : null}
      {tab === 'buckets' ? (
        <BucketsForm
          buckets={buckets}
          onSave={(b) => act('Bucket saved.', () => api.upsertBucket(b))}
          onReorder={(ids) => act('Order saved.', () => api.reorderBuckets({ weightedOrderIds: ids }))}
          onRemove={(id) => act('Bucket removed.', () => api.archiveBucket({ id }))}
        />
      ) : null}
      {tab === 'lists' ? (
        <ListsForm
          buckets={buckets}
          items={items}
          onSave={(row) => act('Item saved.', () => api.upsertItem(row))}
          onReorder={(ids) => act('Order saved.', () => api.reorderItems({ orderedIds: ids }))}
          onRemove={(id) => act('Item removed.', () => api.archiveItem({ id }))}
        />
      ) : null}
      {tab === 'appointments' ? (
        <ApptForm
          appointments={appointments}
          onSave={(row) => act('Appointment saved.', () => api.upsertAppointment(row))}
          onRemove={(id) => act('Appointment removed.', () => api.archiveAppointment({ id }))}
        />
      ) : null}
    </Chrome>
  );
}

function DayForm({
  settings,
  onSave,
}: {
  settings: {
    dayMinutes: number;
    dayStartMinutes: number;
    transitionMinutes: number;
    timezone: string;
    morningMinutes: number;
    breakMinutes: number;
    eveningMinutes: number;
  };
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const day = splitMinutes(settings.dayMinutes);
  const start = splitMinutes(settings.dayStartMinutes);
  const morning = splitMinutes(settings.morningMinutes);
  const brk = splitMinutes(settings.breakMinutes);
  const evening = splitMinutes(settings.eveningMinutes);
  return (
    <form
      className="edit-page"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSave({
          dayMinutes: hoursToMinutes(fd.get('dayH'), fd.get('dayM')),
          dayStartMinutes: hoursToMinutes(fd.get('startH'), fd.get('startM')),
          transitionMinutes: Number(fd.get('trans')),
          timezone: 'America/Chicago',
          morningMinutes: hoursToMinutes(fd.get('mH'), fd.get('mM')),
          breakMinutes: hoursToMinutes(fd.get('bH'), fd.get('bM')),
          eveningMinutes: hoursToMinutes(fd.get('eH'), fd.get('eM')),
        });
      }}
    >
      <div className="edit-card meta-form">
        <div className="fields">
          <Hm name="day" label="Day length" h={day.hours} m={day.minutes} />
          <Hm name="start" label="Day start" h={start.hours} m={start.minutes} />
          <FormField label="Transition minutes">
            <input name="trans" type="number" min={0} defaultValue={settings.transitionMinutes} />
          </FormField>
        </div>
      </div>
      <div className="edit-card">
        <div className="fields">
          <Hm name="m" label="Morning Routine" h={morning.hours} m={morning.minutes} />
          <Hm name="b" label="Break" h={brk.hours} m={brk.minutes} />
          <Hm name="e" label="Evening Routine" h={evening.hours} m={evening.minutes} />
        </div>
      </div>
      <div className="page-save">
        <button type="submit" className="primary">
          Save this page
        </button>
      </div>
    </form>
  );
}

function Hm({ name, label, h, m }: { name: string; label: string; h: number; m: number }) {
  return (
    <>
      <FormField label={`${label} hours`}>
        <input name={`${name}H`} type="number" min={0} defaultValue={h} />
      </FormField>
      <FormField label="Minutes">
        <input name={`${name}M`} type="number" min={0} max={59} defaultValue={m} />
      </FormField>
    </>
  );
}

function BucketsForm({
  buckets,
  onSave,
  onReorder,
  onRemove,
}: {
  buckets: Bucket[];
  onSave: (b: Record<string, unknown>) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const work = buckets.find((b) => b.kind === 'work');
  const weighted = buckets.filter((b) => b.kind === 'weighted').sort((a, b) => a.weight - b.weight);
  const ids = weighted.map((b) => b.id);
  return (
    <div className="edit-page">
      <p className="hint">Drag buckets to set priority. Work stays first and cannot be removed. Add or recolor freely.</p>
      {work ? <BucketCard bucket={work} onSave={onSave} /> : null}
      <SortableList
        ids={ids}
        onReorder={(next) => onReorder(next)}
      >
        {(id) => {
          const bucket = weighted.find((b) => b.id === id);
          if (!bucket) return null;
          return <BucketCard bucket={bucket} onSave={onSave} onRemove={onRemove} />;
        }}
      </SortableList>
      <div className="edit-card add-card">
        <h3 className="group-h">Add New</h3>
        <BucketFields
          onSubmit={(payload) => onSave({ ...payload, kind: 'weighted', weight: weighted.length + 2 })}
        />
      </div>
    </div>
  );
}

function BucketCard({
  bucket,
  onSave,
  onRemove,
}: {
  bucket: Bucket;
  onSave: (b: Record<string, unknown>) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
}) {
  return (
    <div className="edit-card bucket-card" style={{ ['--bcolor' as string]: `#${bucket.color}` }}>
      <BucketFields
        bucket={bucket}
        onSubmit={(payload) => onSave({ id: bucket.id, kind: bucket.kind, weight: bucket.weight, ...payload })}
      />
      {onRemove && canDeleteBucket(bucket) ? (
        <div className="edit-acts">
          <button type="button" className="danger" onClick={() => onRemove(bucket.id)}>
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BucketFields({
  bucket,
  onSubmit,
}: {
  bucket?: Bucket;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const weekly = splitMinutes(bucket?.weeklyMinutes || 0);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSubmit({
          name: fd.get('name'),
          weeklyMinutes: hoursToMinutes(fd.get('wH'), fd.get('wM')),
          days: fd.getAll('days'),
          slot: fd.get('slot'),
          color: String(fd.get('color') || '').replace('#', ''),
        });
      }}
    >
      <div className="fields">
        <FormField label="Name">
          <input name="name" defaultValue={bucket?.name || ''} required />
        </FormField>
        <Hm name="w" label="Weekly" h={weekly.hours} m={weekly.minutes} />
        <FormField label="Time of day">
          <select name="slot" defaultValue={bucket?.slot || 'morning'}>
            {(['morning', 'midday', 'evening'] as Slot[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Color">
          <input name="color" type="color" defaultValue={`#${bucket?.color || '94a3b8'}`} />
        </FormField>
      </div>
      <div className="fields">
        {WEEKDAYS.map((d) => (
          <label key={d} className="check">
            <input name="days" type="checkbox" value={d} defaultChecked={bucket ? bucket.days.includes(d) : true} />
            {d}
          </label>
        ))}
      </div>
      <div className="edit-acts">
        <button type="submit" className="primary">
          Save
        </button>
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
      <p className="hint">Drag items inside a bucket to set priority. No numbering.</p>
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
                  <div className="edit-card">
                    <ItemFields
                      buckets={buckets}
                      item={row}
                      onSubmit={(payload) => onSave({ id: row.id, weight: row.weight, ...payload })}
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
  const [kind, setKind] = useState(item?.type || 'recurring');
  const [cadenceKind, setCadenceKind] = useState(item?.cadence.kind || 'daily');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const type = String(fd.get('type'));
        const cadKind = String(fd.get('cadenceKind'));
        let cadence: Cadence = { kind: 'daily' };
        if (cadKind === 'weekdays' || cadKind === 'weekends' || cadKind === 'daily') {
          cadence = { kind: cadKind };
        } else if (cadKind === 'weekly') {
          cadence = { kind: 'weekly', days: fd.getAll('weeklyDays') as typeof WEEKDAYS };
        } else if (cadKind === 'everyNDays') {
          cadence = {
            kind: 'everyNDays',
            n: Number(fd.get('everyN')) || 2,
            startWeekday: String(fd.get('startWeekday') || 'Mon') as (typeof WEEKDAYS)[number],
          };
        } else if (cadKind === 'monthly') {
          cadence = { kind: 'monthly', dayOfMonth: Number(fd.get('monthDay')) || 1 };
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
          <select name="bucketId" defaultValue={item?.bucketId || buckets[0]?.id}>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </FormField>
        <Hm name="i" label="Duration" h={dur.hours} m={dur.minutes} />
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
            <input name="dueAt" type="date" defaultValue={item?.dueAt || ''} />
          </FormField>
        ) : null}
      </div>
      {cadenceKind === 'weekly' ? (
        <div className="fields" style={{ marginTop: '10px' }}>
          {WEEKDAYS.map((d) => (
            <label key={d} className="check">
              <input
                name="weeklyDays"
                type="checkbox"
                value={d}
                defaultChecked={item?.cadence.kind === 'weekly' ? item.cadence.days.includes(d) : false}
              />
              {d}
            </label>
          ))}
        </div>
      ) : null}
      {cadenceKind === 'everyNDays' ? (
        <div className="fields" style={{ marginTop: '10px' }}>
          <FormField label="Every N days">
            <input name="everyN" type="number" min={2} defaultValue={item?.cadence.kind === 'everyNDays' ? item.cadence.n : 2} />
          </FormField>
          <FormField label="Start weekday">
            <select name="startWeekday" defaultValue={item?.cadence.kind === 'everyNDays' ? item.cadence.startWeekday : 'Mon'}>
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      ) : null}
      {cadenceKind === 'monthly' ? (
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
  appointments: { id: string; title: string; date: string; startMinutes: number; durationMinutes: number }[];
  onSave: (row: Record<string, unknown>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <div className="edit-page">
      <div className="edit-card add-card">
        <ApptFields onSubmit={(payload) => onSave(payload)} />
      </div>
      {appointments.map((a) => {
        const start = splitMinutes(a.startMinutes);
        const dur = splitMinutes(a.durationMinutes);
        return (
          <div key={a.id} className="edit-card">
            <ApptFields
              appointment={a}
              start={start}
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
  start,
  dur,
  onSubmit,
}: {
  appointment?: { title: string; date: string };
  start?: { hours: number; minutes: number };
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
          startMinutes: hoursToMinutes(fd.get('sH'), fd.get('sM')),
          durationMinutes: hoursToMinutes(fd.get('dH'), fd.get('dM')),
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
        <Hm name="s" label="Start" h={start?.hours || 10} m={start?.minutes || 0} />
        <Hm name="d" label="Duration" h={dur?.hours || 1} m={dur?.minutes || 0} />
      </div>
      <div className="edit-acts">
        <button type="submit" className="primary">
          Save
        </button>
      </div>
    </form>
  );
}
