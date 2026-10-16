import { useMemo, useState } from 'react';

import { CollapsibleBucket } from '../../components/CollapsibleBucket';
import { FormField } from '../../components/FormField';
import { SortableList } from '../../components/SortableList';
import { WeekBudgetBar } from '../../components/WeekBudgetBar';
import {
  assignedWeekMinutes,
  collapsedSlotHours,
  eventsSummaryLabel,
  formatBucketHours,
  formatHoursField,
  hoursMinutesOf,
  hoursModeOf,
  personalWeekMinutes,
  weekBudgetSummary,
  type WeekBudgetSummary,
} from '../../domain/budget';
import { formatDuration, hoursToMinutes, splitMinutes } from '../../domain/duration';
import { eventRanges, newEventRangeId, parseEventRanges } from '../../domain/events';
import { APPOINTMENTS_BUCKET, EVENTS_BUCKET, PERSONAL_BUCKET, canDeleteBucket, canRenameBucket, splitEditBuckets } from '../../domain/seed';
import { bucketSlots } from '../../domain/sections';
import { APPOINTMENTS_ID, EVENTS_ID, SLOTS, WEEKDAYS, type Bucket, type DaySettings, type EventRange } from '../../domain/types';
import { toastFailure } from '../../shared/toastBus';
import { DayChips } from './DayChips';
import { NEW_BUCKET_COLOR, bucketPayloadFromForm, durationFrom, formHoursMode, formSlots, liveWeekBudget } from './formRead';

export function BucketsForm({
  settings,
  busy,
  buckets,
  onSave,
  onReorder,
  onRemove,
}: {
  settings: DaySettings;
  busy: boolean;
  buckets: Bucket[];
  onSave: (payload: Record<string, unknown>) => Promise<boolean>;
  onReorder: (ids: string[]) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  // Add New is an uncontrolled form, so a saved bucket's details sit there
  // afterwards and the next Save submits them again as another new bucket.
  // Remounting on success empties it; on failure it keeps what was typed.
  const [addKey, setAddKey] = useState(0);
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
      <EventsCard key={eventsCardKey(events)} bucket={events} />
      <SortableList ids={ids} onReorder={(next) => onReorder(next)}>
        {(id) => {
          const bucket = weighted.find((b) => b.id === id);
          if (!bucket) return null;
          return <BucketCard bucket={bucket} onRemove={onRemove} />;
        }}
      </SortableList>
      <div className="edit-card add-card">
        <h3 className="group-h">Add New</h3>
        <BucketFields key={addKey} kind="new" />
      </div>
      <div className="page-save">
        <button
          type="button"
          className="btn--gold"
          disabled={busy}
          onClick={async (e) => {
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
                toastFailure(err, 'Save Buckets');
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
            const added = Boolean(addForm && rows.some((r) => !r.id));
            const ok = await onSave({
              personal: {
                morningMinutes: personalForm ? hoursToMinutes(personalFd?.get('mH'), personalFd?.get('mM')) : settings.morningMinutes,
                breakMinutes: personalForm ? hoursToMinutes(personalFd?.get('bH'), personalFd?.get('bM')) : settings.breakMinutes,
                eveningMinutes: personalForm ? hoursToMinutes(personalFd?.get('eH'), personalFd?.get('eM')) : settings.eveningMinutes,
                color: String(personalFd?.get('color') || '').replace('#', ''),
              },
              buckets: rows,
            });
            if (ok && added) setAddKey((k) => k + 1);
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
            <input name="color" type="color" defaultValue={`#${bucket.color || APPOINTMENTS_BUCKET.color}`} />
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
            <input name="color" type="color" defaultValue={`#${bucket.color || PERSONAL_BUCKET.color}`} />
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
  /** The card fires and forgets; whether the write landed is the page's business. */
  onRemove?: (id: string) => Promise<unknown>;
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

/** The card copies its ranges once, so it remounts when the saved ranges change. */
function eventsCardKey(bucket: Bucket): string {
  return eventRanges(bucket)
    .map((r) => `${r.id}:${r.name || ''}:${r.startDate}:${r.endDate}`)
    .join('|');
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
            <input name="color" type="color" defaultValue={`#${bucket.color || EVENTS_BUCKET.color}`} />
          </FormField>
        </div>
        <div className="edit-acts">
          <button
            type="button"
            onClick={() => setRanges((cur) => [...cur, { id: newEventRangeId(), startDate: '', endDate: '' }])}
          >
            Add New
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
            <input name="color" type="color" defaultValue={`#${bucket?.color || NEW_BUCKET_COLOR}`} />
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
