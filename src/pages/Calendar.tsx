import { useState } from 'react';

import { formatDuration } from '../domain/duration';
import { slotIndex } from '../domain/sections';
import { isBreakBlock, isEventPacked } from '../domain/today';
import { addDaysKey, todayKey, weekStart } from '../shared/dates';
import { isEventDay } from '../domain/sections';
import { useAuth } from '../shared/auth';
import { useBuckets, useDays, useSettings } from '../services/live';
import { Chrome } from '../components/Chrome';
import { EVENTS_ID, type PackedBlock } from '../domain/types';

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
    <Chrome title="2-week" wide>
      <div className="cal-layout">
        <div className="cal-list">
          {listKeys.map((key) => {
            const day = days[key];
            const placed = listChips(day?.blocks || []);
            const falling = fallingChips(day?.dropped);
            const eventDay = isEventDay(events, key);
            if (!listShowsDay(placed, falling, eventDay)) return null;
            const hours = scheduledMinutes(day?.blocks || []);
            return (
              <div key={key}>
                <div
                  className={`cal-day-h${eventDay ? ' is-event' : ''}`}
                  style={mark(eventDay)}
                >
                  {key}
                  {key === today ? ' · today' : ''}
                  {hours > 0 ? (
                    <>
                      {' · '}
                      <HoursMark minutes={hours} dayMinutes={dayMinutes} />
                    </>
                  ) : null}
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
              const day = days[key];
              const placed = visibleChips(placedChips(day?.blocks || []));
              const falling = fallingChips(day?.dropped);
              const hours = scheduledMinutes(day?.blocks || []);
              const eventDay = isEventDay(events, key);
              return (
                <div
                  key={key}
                  className={`cal-cell${key === today ? ' is-today' : ''}${eventDay ? ' is-event' : ''}`}
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

function HoursMark({ minutes, dayMinutes }: { minutes: number; dayMinutes: number }) {
  if (minutes <= 0) return null;
  return <span className={`cal-hrs cal-hrs--${loadTone(minutes, dayMinutes)}`}>{formatDuration(minutes)}</span>;
}

export function isAccentChip(block: PackedBlock): boolean {
  return block.kind === 'appointment' || block.kind === 'event' || block.bucketId === EVENTS_ID;
}

function Chip({ block, overflow }: { block: PackedBlock; overflow?: boolean }) {
  const brk = isBreakBlock(block);
  return (
    <div
      className={`cal-chip${overflow ? ' overflow' : ''}${isAccentChip(block) ? ' cal-chip--appt' : ''}${brk ? ' cal-chip--break' : ''}`}
      style={{ ['--bcolor' as string]: `#${block.color}` }}
    >
      {block.title}
      {block.durationMinutes ? ` · ${formatDuration(block.durationMinutes)}` : ''}
    </div>
  );
}

export function scheduledMinutes(blocks: PackedBlock[]): number {
  return blocks
    .filter((b) => b.status !== 'dropped' && b.kind !== 'personal' && b.kind !== 'transition')
    .reduce((sum, b) => sum + Math.max(0, b.durationMinutes), 0);
}

export function loadTone(scheduled: number, dayMinutes: number): 'ok' | 'mid' | 'hot' {
  if (dayMinutes <= 0) return 'mid';
  const part = scheduled / dayMinutes;
  if (part < 0.5) return 'ok';
  if (part <= 0.85) return 'mid';
  return 'hot';
}

export function listKeysFrom(boardKeys: string[], today: string): string[] {
  return boardKeys.filter((key) => key >= today);
}

export function listShowsDay(
  placed: PackedBlock[],
  falling: PackedBlock[],
  eventDay: boolean
): boolean {
  return eventDay || placed.length > 0 || falling.length > 0;
}

export function placedChips(blocks: PackedBlock[]): PackedBlock[] {
  return blocks.filter((b) => b.kind !== 'transition' && (b.kind !== 'personal' || isBreakBlock(b)));
}

function listRank(block: PackedBlock): number {
  if (block.title === 'Morning Routine') return -2;
  if (block.title === 'Evening Routine') return 2;
  return 0;
}

export function listChips(blocks: PackedBlock[]): PackedBlock[] {
  if (isEventPacked(blocks)) {
    return blocks.filter((b) => b.kind !== 'transition' && b.kind !== 'personal');
  }
  const rows = blocks.filter((b) => b.kind !== 'transition');
  const accent = rows.filter((b) => isAccentChip(b));
  const rest = rows
    .filter((b) => !isAccentChip(b))
    .sort(
      (a, b) =>
        slotIndex(a.slot) - slotIndex(b.slot) ||
        listRank(a) - listRank(b) ||
        a.startMinutes - b.startMinutes
    );
  return [...accent, ...rest];
}

export function orderChips(blocks: PackedBlock[]): PackedBlock[] {
  const accent = blocks.filter((b) => isAccentChip(b));
  const rest = blocks
    .filter((b) => !isAccentChip(b))
    .sort((a, b) => slotIndex(a.slot) - slotIndex(b.slot) || a.startMinutes - b.startMinutes);
  return [...accent, ...rest];
}

export function fallingChips(dropped: PackedBlock[] | undefined): PackedBlock[] {
  return (dropped || []).filter((b) => b.status === 'dropped');
}

export function visibleChips(blocks: PackedBlock[]): PackedBlock[] {
  return orderChips(blocks);
}
