import { formatClock, formatDuration } from '../domain/duration';
import { addDaysKey, todayKey, weekStart } from '../shared/dates';
import { useAuth } from '../shared/auth';
import { useDays, useSettings } from '../services/live';
import { Chrome } from '../components/Chrome';
import type { PackedBlock } from '../domain/types';

function keysFrom(start: string, count: number): string[] {
  const list: string[] = [];
  for (let i = 0; i < count; i += 1) list.push(addDaysKey(start, i));
  return list;
}

export function CalendarPage() {
  const { user } = useAuth();
  const today = todayKey();
  const boardStart = weekStart(today);
  const listKeys = keysFrom(today, 21);
  const boardKeys = keysFrom(boardStart, 21);
  const rangeEnd = addDaysKey(today, 20);
  const days = useDays(user?.uid, boardStart, rangeEnd);
  const settings = useSettings(user?.uid);
  const dayMinutes = settings?.dayMinutes || 0;

  return (
    <Chrome title="3-week" wide>
      <div className="cal-layout">
        <div className="cal-list">
          {listKeys.map((key) => {
            const blocks = days[key]?.blocks || [];
            const packed = blocks.filter((b) => b.kind !== 'transition');
            if (!packed.length) return null;
            const hours = scheduledMinutes(blocks);
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
                {packed.map((it) => (
                  <Chip key={it.id} block={it} />
                ))}
              </div>
            );
          })}
        </div>
        <div className="cal-board">
          <div className="cal-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="cal-weeks">
            {boardKeys.map((key) => {
              const blocks = days[key]?.blocks || [];
              const packed = visibleChips(blocks.filter((b) => b.kind !== 'transition' && b.kind !== 'personal'));
              const hours = scheduledMinutes(blocks);
              return (
                <div key={key} className={`cal-cell${key === today ? ' is-today' : ''}`}>
                  <div className="cal-cell-num">
                    <span>{key.slice(8)}</span>
                    <HoursMark minutes={hours} dayMinutes={dayMinutes} />
                  </div>
                  {packed.map((it) => (
                    <Chip key={it.id} block={it} />
                  ))}
                  {(days[key]?.dropped || []).slice(0, 2).map((it) => (
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
      {appt ? `${formatClock(block.startMinutes)} · ${block.title}` : block.title}
      {!appt && block.durationMinutes ? ` · ${formatDuration(block.durationMinutes)}` : ''}
    </div>
  );
}

export function scheduledMinutes(blocks: PackedBlock[]): number {
  return blocks
    .filter((b) => b.status !== 'dropped')
    .reduce((sum, b) => sum + Math.max(0, b.durationMinutes), 0);
}

export function loadTone(scheduled: number, dayMinutes: number): 'ok' | 'mid' | 'hot' {
  if (dayMinutes <= 0) return 'mid';
  const part = scheduled / dayMinutes;
  if (part < 0.5) return 'ok';
  if (part <= 0.85) return 'mid';
  return 'hot';
}

export function visibleChips(blocks: PackedBlock[]): PackedBlock[] {
  const appts = blocks.filter((b) => b.kind === 'appointment');
  const rest = blocks.filter((b) => b.kind !== 'appointment');
  return [...appts, ...rest.slice(0, Math.max(0, 6 - appts.length))];
}
