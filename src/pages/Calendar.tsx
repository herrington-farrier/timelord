import { formatDuration } from '../domain/duration';
import { addDaysKey, todayKey } from '../shared/dates';
import { useAuth } from '../shared/auth';
import { useDays } from '../services/live';
import { Chrome } from '../components/Chrome';
import type { PackedBlock } from '../domain/types';

export function CalendarPage() {
  const { user } = useAuth();
  const start = weekStart(todayKey());
  const end = addDaysKey(start, 20);
  const days = useDays(user?.uid, start, end);

  const list: string[] = [];
  for (let i = 0; i < 21; i += 1) list.push(addDaysKey(start, i));

  return (
    <Chrome title="3-week" wide>
      <div className="cal-layout">
        <div className="cal-list">
          {list.map((key) => {
            const packed = (days[key]?.blocks || []).filter((b) => b.kind !== 'transition');
            if (!packed.length) return null;
            return (
              <div key={key}>
                <div className="cal-day-h">
                  {key}
                  {key === todayKey() ? ' · today' : ''}
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
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="cal-weeks">
            {list.map((key) => {
              const packed = (days[key]?.blocks || [])
                .filter((b) => b.kind !== 'transition' && b.kind !== 'personal')
                .slice(0, 6);
              return (
                <div key={key} className={`cal-cell${key === todayKey() ? ' is-today' : ''}`}>
                  <div className="cal-cell-num">{key.slice(8)}</div>
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

function Chip({ block, overflow }: { block: PackedBlock; overflow?: boolean }) {
  return (
    <div className={`cal-chip${overflow ? ' overflow' : ''}`} style={{ ['--bcolor' as string]: `#${block.color}` }}>
      {block.title}
      {block.durationMinutes ? ` · ${formatDuration(block.durationMinutes)}` : ''}
    </div>
  );
}

function weekStart(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.getUTCDay();
  const back = wd === 0 ? 6 : wd - 1;
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}
