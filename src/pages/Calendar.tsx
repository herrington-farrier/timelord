import { useState } from 'react';

import { freeTone, loadTone } from '../domain/budget';
import { formatApptTime, formatDuration } from '../domain/duration';
import { bucketSlots, isEventDay, sectionCapacity, slotIndex } from '../domain/sections';
import { bookedMinutes, isBreakBlock, isEventPacked } from '../domain/today';
import { addDaysKey, formatDayLabel, todayKey, weekStart } from '../shared/dates';
import { useAuth } from '../shared/auth';
import { useBuckets, useDays, useSettings } from '../services/live';
import { Chrome } from '../components/Chrome';
import { EVENTS_ID, SLOTS, type Bucket, type DaySettings, type PackedBlock, type Slot } from '../domain/types';

type SlotRef = Pick<Bucket, 'id' | 'slot' | 'slots'> & { kind?: Bucket['kind'] };

const BOARD_DAYS = 14;

function keysFrom(start: string, count: number): string[] {
  const list: string[] = [];
  for (let i = 0; i < count; i += 1) list.push(addDaysKey(start, i));
  return list;
}

export function boardStartFor(today: string, offsetDays: number): string {
  return addDaysKey(weekStart(today), offsetDays);
}

export function CalendarPage() {
  const { user } = useAuth();
  const today = todayKey();
  const [offset, setOffset] = useState(0);
  const boardStart = boardStartFor(today, offset);
  const boardKeys = keysFrom(boardStart, BOARD_DAYS);
  const listKeys = listKeysFrom(boardKeys, today);
  const days = useDays(user?.uid, boardStart, boardKeys[boardKeys.length - 1]);
  const settings = useSettings(user?.uid);
  const buckets = useBuckets(user?.uid);
  const events = buckets.find((b) => b.id === EVENTS_ID || b.kind === 'event');
  const eventColor = events?.color ? `#${events.color}` : undefined;
  const dayMinutes = settings?.dayMinutes || 0;
  const mark = (on: boolean) => (on && eventColor ? { ['--bcolor' as string]: eventColor } : undefined);

  return (
    <Chrome title="Quest Log" wide>
      <div className="cal-layout">
        <div className="cal-list">
          {listKeys.map((key) => {
            const day = days[key];
            const placed = listChips(day?.blocks || [], buckets);
            const falling = fallingChips(day?.dropped);
            const eventDay = isEventDay(events, key);
            if (!listShowsDay(placed, falling, eventDay)) return null;
            const hours = scheduledMinutes(day?.blocks || []);
            return (
              <div
                key={key}
                className={`cal-day${key === today ? ' is-today' : ''}${eventDay ? ' is-event' : ''}`}
                style={mark(eventDay)}
              >
                <div className="cal-day-h">
                  {formatDayLabel(key)}
                  {key === today ? ' · today' : ''}
                  {hours > 0 ? (
                    <>
                      {' · '}
                      <HoursMark minutes={hours} dayMinutes={dayMinutes} />
                    </>
                  ) : null}
                  {bookedMinutes(day?.blocks || []) > 0 ? (
                    <>
                      {' · '}
                      <span className="cal-booked">
                        {formatDuration(bookedMinutes(day?.blocks || []))} booked
                      </span>
                    </>
                  ) : null}
                </div>
                {eventDay || !settings ? null : (
                  <ListSectionFree
                    free={sectionFreeMinutes(
                      settings,
                      day?.blocks || [],
                      buckets,
                      day?.sectionExtra,
                      day?.sectionUsed
                    )}
                    cap={sectionCapacity(settings, day?.sectionExtra, day?.sectionUsed)}
                  />
                )}
                {placed.map((it) => (
                  <Chip key={it.id} block={it} />
                ))}
                {falling.map((it) => (
                  <Chip key={it.id} block={it} overflow />
                ))}
              </div>
            );
          })}
        </div>
        <div className="cal-board">
          <div className="cal-nav">
            <button type="button" disabled={offset === 0} onClick={() => setOffset(0)}>
              Today
            </button>
            <button type="button" onClick={() => setOffset((n) => n + BOARD_DAYS)}>
              Next 2wks
            </button>
          </div>
          <div className="cal-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="cal-weeks">
            {boardKeys.map((key) => {
              const open = boardShowsDay(key, today);
              const day = open ? days[key] : undefined;
              const placed = open ? visibleChips(placedChips(day?.blocks || []), buckets) : [];
              const falling = open ? fallingChips(day?.dropped) : [];
              const hours = open ? scheduledMinutes(day?.blocks || []) : 0;
              const eventDay = open && isEventDay(events, key);
              return (
                <div
                  key={key}
                  className={`cal-cell${key === today ? ' is-today' : ''}${eventDay ? ' is-event' : ''}${open ? '' : ' is-past'}`}
                  style={mark(eventDay)}
                >
                  <div className="cal-cell-num">
                    <span>{key.slice(8)}</span>
                    <HoursMark minutes={hours} dayMinutes={dayMinutes} />
                  </div>
                  {placed.map((it) => (
                    <Chip key={it.id} block={it} />
                  ))}
                  {falling.map((it) => (
                    <Chip key={it.id} block={it} overflow />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Chrome>
  );
}

const SLOT_LABEL: Record<Slot, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
};

export function ListSectionFree({ free, cap }: { free: Record<Slot, number>; cap: Record<Slot, number> }) {
  return (
    <div className="cal-secs">
      {SLOTS.map((slot) => (
        <span key={slot}>
          {SLOT_LABEL[slot]}{' '}
          <b className={`cal-hrs--${freeTone(free[slot], cap[slot])}`}>{formatDuration(free[slot])}</b>
        </span>
      ))}
    </div>
  );
}

function HoursMark({ minutes, dayMinutes }: { minutes: number; dayMinutes: number }) {
  if (minutes <= 0) return null;
  return <span className={`cal-hrs cal-hrs--${loadTone(minutes, dayMinutes)}`}>{formatDuration(minutes)}</span>;
}

export function isAccentChip(block: PackedBlock): boolean {
  return block.kind === 'appointment';
}

function Chip({ block, overflow }: { block: PackedBlock; overflow?: boolean }) {
  const brk = isBreakBlock(block);
  return (
    <div
      className={`cal-chip${overflow ? ' overflow' : ''}${isAccentChip(block) ? ' cal-chip--appt' : ''}${brk ? ' cal-chip--break' : ''}${block.finalOccurrence ? ' is-final' : ''}`}
      style={{ ['--bcolor' as string]: `#${block.color}` }}
    >
      {block.apptTime ? <b className="cal-chip__when">{formatApptTime(block.apptTime)}</b> : null}
      {block.title}
      {block.durationMinutes ? ` · ${formatDuration(block.durationMinutes)}` : ''}
      {block.finalOccurrence ? <span className="final-tag">Final</span> : null}
    </div>
  );
}

export function sectionFreeMinutes(
  settings: Pick<DaySettings, 'dayMinutes'>,
  blocks: PackedBlock[],
  buckets: SlotRef[] = [],
  extra: Partial<Record<Slot, number>> = {},
  used: Partial<Record<Slot, number>> = {}
): Record<Slot, number> {
  const caps = sectionCapacity(settings, extra, used);
  const packed: Record<Slot, number> = { morning: 0, midday: 0, evening: 0 };
  for (const block of blocks) {
    if (block.status === 'dropped' || block.kind === 'personal' || block.kind === 'transition') continue;
    const slot = chipSlot(block, buckets);
    if (!slot) continue;
    packed[slot] += Math.max(0, block.durationMinutes);
  }
  const free = { ...packed };
  for (const slot of SLOTS) free[slot] = Math.max(0, caps[slot] - packed[slot]);
  return free;
}

export function scheduledMinutes(blocks: PackedBlock[]): number {
  return blocks
    .filter((b) => b.status !== 'dropped' && b.kind !== 'personal' && b.kind !== 'transition')
    .reduce((sum, b) => sum + Math.max(0, b.durationMinutes), 0);
}


export function boardShowsDay(key: string, today: string): boolean {
  return key >= today;
}

export function listKeysFrom(boardKeys: string[], today: string): string[] {
  return boardKeys.filter((key) => boardShowsDay(key, today));
}

export function listShowsDay(
  placed: PackedBlock[],
  falling: PackedBlock[],
  eventDay: boolean
): boolean {
  return eventDay || placed.length > 0 || falling.length > 0;
}

export function placedChips(blocks: PackedBlock[]): PackedBlock[] {
  return blocks.filter((b) => {
    if (b.kind === 'transition') return false;
    // A routine carrying minutes is time the day has actually lost, so the board
    // has to show it or the cell reads as emptier than the day is. Carrying
    // none, it is an invisible marker and stays off.
    if (b.kind === 'personal') return isBreakBlock(b) || b.durationMinutes > 0;
    return true;
  });
}

function listRank(block: PackedBlock): number {
  if (block.title === 'Morning Routine') return -2;
  if (block.title === 'Evening Routine') return 2;
  return 0;
}

export function chipSlot(block: PackedBlock, buckets: SlotRef[] = []): Slot | undefined {
  if (block.slot) return block.slot;
  if (block.kind === 'appointment' || block.kind === 'event') return undefined;
  const bucket = buckets.find((b) => b.id === block.bucketId);
  if (!bucket || bucket.kind === 'event' || bucket.id === EVENTS_ID) return undefined;
  return bucketSlots(bucket)[0];
}

function chipSlotIndex(block: PackedBlock, buckets: SlotRef[] = []): number {
  const slot = chipSlot(block, buckets);
  return slot ? slotIndex(slot) : slotIndex('evening');
}

export function listChips(blocks: PackedBlock[], buckets: SlotRef[] = []): PackedBlock[] {
  if (isEventPacked(blocks)) {
    return blocks.filter((b) => b.kind !== 'transition' && b.kind !== 'personal');
  }
  const rows = blocks.filter((b) => b.kind !== 'transition');
  const accent = rows.filter((b) => isAccentChip(b));
  const rest = rows
    .filter((b) => !isAccentChip(b))
    .sort(
      (a, b) =>
        chipSlotIndex(a, buckets) - chipSlotIndex(b, buckets) ||
        listRank(a) - listRank(b) ||
        a.startMinutes - b.startMinutes
    );
  return [...accent, ...rest];
}

export function orderChips(blocks: PackedBlock[], buckets: SlotRef[] = []): PackedBlock[] {
  const accent = blocks.filter((b) => isAccentChip(b));
  const rest = blocks
    .filter((b) => !isAccentChip(b))
    .sort((a, b) => chipSlotIndex(a, buckets) - chipSlotIndex(b, buckets) || a.startMinutes - b.startMinutes);
  return [...accent, ...rest];
}

export function fallingChips(dropped: PackedBlock[] | undefined): PackedBlock[] {
  return (dropped || []).filter((b) => b.status === 'dropped');
}

export function visibleChips(blocks: PackedBlock[], buckets: SlotRef[] = []): PackedBlock[] {
  return orderChips(blocks, buckets);
}
