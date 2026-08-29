import { useState } from 'react';

import { formatDuration } from '../domain/duration';
import { slotIndex } from '../domain/sections';
import { isEventPacked } from '../domain/today';
import { addDaysKey, todayKey, weekStart } from '../shared/dates';
import { useAuth } from '../shared/auth';
import { useDays, useSettings } from '../services/live';
import { Chrome } from '../components/Chrome';
import type { PackedBlock } from '../domain/types';

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
  const dayMinutes = settings?.dayMinutes || 0;

  return (
    <Chrome title="2-week" wide>
      <div className="cal-layout">
        <div className="cal-list">
          {listKeys.map((key) => {
            const day = days[key];
            const placed = listChips(day?.blocks || []);
            const falling = fallingChips(day?.dropped);
            if (!placed.length && !falling.length) return null;
            const hours = scheduledMinutes(day?.blocks || []);
            return (
              <div key={key}>
                <div className="cal-day-h">
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
              return (
                <div key={key} className={`cal-cell${key === today ? ' is-today' : ''}`}>
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

function Chip({ block, overflow }: { block: PackedBlock; overflow?: boolean }) {
  const appt = block.kind === 'appointment';
  return (
    <div className={`cal-chip${overflow ? ' overflow' : ''}${appt ? ' cal-chip--appt' : ''}`} style={{ ['--bcolor' as string]: `#${block.color}` }}>
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

export function placedChips(blocks: PackedBlock[]): PackedBlock[] {
  return blocks.filter((b) => b.kind !== 'transition' && b.kind !== 'personal');
}

function listRank(block: PackedBlock): number {
  if (block.title === 'Morning Routine') return -2;
  if (block.title === 'Evening Routine') return 2;
  if (block.title === 'Break') return 1;
  return 0;
}

export function listChips(blocks: PackedBlock[]): PackedBlock[] {
  if (isEventPacked(blocks)) {
    return blocks.filter((b) => b.kind !== 'transition' && b.kind !== 'personal');
  }
  return blocks
    .filter((b) => b.kind !== 'transition')
    .sort(
      (a, b) =>
        slotIndex(a.slot) - slotIndex(b.slot) ||
        listRank(a) - listRank(b) ||
        a.startMinutes - b.startMinutes
    );
}

export function orderChips(blocks: PackedBlock[]): PackedBlock[] {
  const appts = blocks.filter((b) => b.kind === 'appointment');
  const rest = blocks.filter((b) => b.kind !== 'appointment');
  return [...appts, ...rest];
}

export function fallingChips(dropped: PackedBlock[] | undefined): PackedBlock[] {
  return (dropped || []).filter((b) => b.status === 'dropped');
}

export function visibleChips(blocks: PackedBlock[]): PackedBlock[] {
  return orderChips(blocks);
}
