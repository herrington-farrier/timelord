import { formatDuration } from '../domain/duration';
import { useLogs } from '../services/live';
import { useAuth } from '../shared/auth';
import { todayKey } from '../shared/dates';
import { Chrome } from '../components/Chrome';

export function LogPage() {
  const { user } = useAuth();
  const date = todayKey();
  const logs = useLogs(user?.uid, date);
  return (
    <Chrome title="Log" stamp={date}>
      <p className="hint">Append-only. Complete, skip, start, and end are never overwritten.</p>
      {logs
        .slice()
        .sort((a, b) => String(a.at).localeCompare(String(b.at)))
        .map((row) => (
          <div key={String(row.id)} className="item">
            <div className="item-title">{String(row.type)}</div>
            <div className="item-meta">
              {String(row.at || '')}
              {row.minutes ? ` · ${formatDuration(Number(row.minutes))}` : ''}
            </div>
          </div>
        ))}
      {!logs.length ? <p className="hint">No events for today yet.</p> : null}
    </Chrome>
  );
}
