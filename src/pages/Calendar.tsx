import { useState } from 'react';

import { freeTone, loadTone } from '../domain/budget';
import {
  BOARD_DAYS,
  boardShowsDay,
  boardStartFor,
  fallingChips,
  isAccentChip,
  keysFrom,
  listChips,
  listKeysFrom,
  listShowsDay,
  placedChips,
  scheduledMinutes,
  sectionFreeMinutes,
  visibleChips,
} from '../domain/calendar';
import { formatApptTime, formatDuration } from '../domain/duration';
import { findEventsBucket } from '../domain/predicates';
import { isEventDay, sectionCapacity } from '../domain/sections';
import { bookedMinutes, isBreakBlock } from '../domain/today';
import { formatDayLabel, todayKey } from '../shared/dates';
import { useAuth } from '../shared/useAuth';
import { useBuckets, useDays, useSettings } from '../services/live';
import { isLoadFailed } from '../services/loadState';
import { Chrome } from '../components/Chrome';
import { SLOTS, type Bucket, type PackedBlock, type Slot } from '../domain/types';

const NO_BUCKETS: Bucket[] = [];

export function CalendarPage() {
  const { user } = useAuth();
  const today = todayKey();
  const [offset, setOffset] = useState(0);
  const boardStart = boardStartFor(today, offset);
  const boardKeys = keysFrom(boardStart, BOARD_DAYS);
  const listKeys = listKeysFrom(boardKeys, today);
  const days = useDays(user?.uid, boardStart, boardKeys[boardKeys.length - 1]);
  const settings = useSettings(user?.uid);
  const bucketsRaw = useBuckets(user?.uid);
  const buckets = !bucketsRaw || isLoadFailed(bucketsRaw) ? NO_BUCKETS : bucketsRaw;
  const events = findEventsBucket(buckets);
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
