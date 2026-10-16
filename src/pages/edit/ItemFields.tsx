import { useState } from 'react';

import { FormField } from '../../components/FormField';
import { nextOpenDay } from '../../domain/cadence';
import { durationInputs, splitMinutes } from '../../domain/duration';
import { eventRangeForItem, eventRangeName, eventRanges } from '../../domain/events';
import { findEventsBucket, isEventsBucket } from '../../domain/predicates';
import { isAppointmentBucket, listCadenceDays } from '../../domain/seed';
import { bucketSlots, itemSlots, itemWorkSlot, workShowsItemSlot } from '../../domain/sections';
import type { Bucket, Cadence, ListItem } from '../../domain/types';
import type { ActionError } from '../../shared/actionError';
import { todayKey } from '../../shared/dates';
import { DayChips } from './DayChips';
import { ITEM_DEFAULT_MINUTES } from './formRead';

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

export function ItemFields({
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
  const dur = durationInputs(item?.durationMinutes, splitMinutes(ITEM_DEFAULT_MINUTES));
  const [bucketId, setBucketId] = useState(item?.bucketId || buckets[0]?.id);
  const currentBucket = buckets.find((b) => b.id === bucketId);
  const eventItem = isEventsBucket(currentBucket);
  const apptItem = isAppointmentBucket(currentBucket);
  const [kind, setKind] = useState<ListItem['type']>(item?.type || 'recurring');
  /** Events are always pinned to a date; an appointment only while scheduled. */
  const slotPick = currentBucket ? workShowsItemSlot(currentBucket) : false;
  const slotOptions = currentBucket ? bucketSlots(currentBucket) : [];
  const eventOptions = eventRanges(findEventsBucket(buckets));
  const [eventId, setEventId] = useState(
    item?.eventId || eventRangeForItem(eventOptions, item || {})?.id || ''
  );
  const chosenEvent = eventOptions.find((r) => r.id === eventId);
  const openDays = listCadenceDays(currentBucket);
  const [cadenceKind, setCadenceKind] = useState(item?.cadence.kind || 'daily');
  // A start date sets the weekday, so the two controls can never disagree about
  // when the stream runs.
  const [startDate, setStartDate] = useState(
    item?.cadence.kind === 'everyNDays' ? item.cadence.startDate || todayKey() : todayKey()
  );
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
        ) : !eventItem && slotOptions.length === 1 ? (
          // One section is not a choice, but it is still worth knowing. Shown
          // rather than hidden so you can see when an item runs without opening
          // its bucket to remember.
          <div className="field">
            <span>Time of day</span>
            <p className="field-static">{slotOptions[0]}</p>
          </div>
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
            ) : (
              // Only a cadence can expire: a scheduled item already names the
              // one day it runs. Optional — most things genuinely do go on
              // forever, and a required end date would invent one.
              <FormField label="Expires (optional)">
                <input
                  name="expiresAt"
                  type="date"
                  className={invalid('expiresAt').trim() || undefined}
                  defaultValue={item?.expiresAt || ''}
                />
              </FormField>
            )}
            {apptItem ? (
              <FormField label="Time (label only)">
                <input name="apptTime" type="time" defaultValue={item?.apptTime || ''} />
              </FormField>
            ) : null}
          </>
        )}
      </div>
      {!eventItem && cadenceKind === 'weekly' ? (
        <div key={bucketId} className="field field--spaced">
          <span>Days</span>
          <DayChips
            name="weeklyDays"
            isOpen={(d) => openDays.includes(d)}
            isOn={(d) => (item?.cadence.kind === 'weekly' ? item.cadence.days.includes(d) : false)}
          />
        </div>
      ) : null}
      {!eventItem && cadenceKind === 'everyNDays' ? (
        <div key={`${bucketId}-n`} className="fields field--spaced">
          <FormField label="Every N days">
            <input name="everyN" type="number" min={2} defaultValue={item?.cadence.kind === 'everyNDays' ? item.cadence.n : 2} />
          </FormField>
          <FormField label="Start date">
            <input
              name="startDate"
              type="date"
              value={startDate}
              // Snap to a day the bucket runs as soon as it is picked, so the
              // date shown is the date that will be used.
              onChange={(e) =>
                setStartDate(
                  e.target.value && openDays.length ? nextOpenDay(e.target.value, openDays) : e.target.value
                )
              }
            />
          </FormField>
        </div>
      ) : null}
      {!eventItem && cadenceKind === 'monthly' ? (
        <div className="fields field--spaced">
          <FormField label="Day of month">
            <input name="monthDay" type="number" min={1} max={31} defaultValue={item?.cadence.kind === 'monthly' ? item.cadence.dayOfMonth : 1} />
          </FormField>
        </div>
      ) : null}
    </form>
  );
}
