import { formatDuration } from '../domain/duration';
import { formatLogEvent, logEventTone } from '../domain/log';
import { addDaysKey, todayKey } from '../shared/dates';
import { useItems, useLogs } from '../services/live';
import { useAuth } from '../shared/auth';
import { Chrome } from '../components/Chrome';

const LOG_DAYS = 14;

export function LogPage() {
  const { user } = useAuth();
  const today = todayKey();
  const start = addDaysKey(today, -(LOG_DAYS - 1));
  const logs = useLogs(user?.uid, start, today);
  const items = useItems(user?.uid);
  return (
    <Chrome title="Log" stamp={`${LOG_DAYS} days`}>
      <p className="hint">Append-only. Complete, skip, start, and end are never overwritten.</p>
      {logs
        .slice()
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
        .map((row) => {
          const title = String(row.title || items.find((i) => i.id === row.itemId)?.title || '');
          const tone = logEventTone(String(row.type || ''));
          return (
            <div key={String(row.id)} className={`item${tone ? ` log-row--${tone}` : ''}`}>
              <div className="item-title">{formatLogEvent({ ...row, title })}</div>
              <div className="item-meta">
                {String(row.date || '')}
                {row.at ? ` · ${String(row.at)}` : ''}
                {row.minutes ? ` · ${formatDuration(Number(row.minutes))}` : ''}
              </div>
            </div>
          );
        })}
      {!logs.length ? <p className="hint">No events in the last {LOG_DAYS} days.</p> : null}
    </Chrome>
  );
}
