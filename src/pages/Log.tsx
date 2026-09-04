import { formatDuration } from '../domain/duration';
import { formatLogEvent, logEventTone } from '../domain/log';
import { addDaysKey, formatClock, formatDayLabel, todayKey } from '../shared/dates';
import { useItems, useLogs, useScore } from '../services/live';
import { useAuth } from '../shared/auth';
import { Chrome } from '../components/Chrome';
import { ScoreBar } from '../components/ScoreBar';

const LOG_DAYS = 14;

export function LogPage() {
  const { user } = useAuth();
  const today = todayKey();
  const start = addDaysKey(today, -(LOG_DAYS - 1));
  const logs = useLogs(user?.uid, start, today);
  const items = useItems(user?.uid);
  const score = useScore(user?.uid);
  return (
    <Chrome title="Stats" stamp={`${LOG_DAYS} days`}>
      <ScoreBar total={score} wide />
      {logs
        .slice()
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
        .map((row) => {
          const title = String(row.title || items.find((i) => i.id === row.itemId)?.title || '');
          const tone = logEventTone(String(row.type || ''));
          return (
            <div key={String(row.id)} className={`item log-row${tone ? ` log-row--${tone}` : ''}`}>
              <div className="item-title">{formatLogEvent({ ...row, title })}</div>
              <div className="item-meta">
                {row.date ? formatDayLabel(String(row.date)) : ''}
                {row.at ? ` · ${formatClock(String(row.at))}` : ''}
                {row.minutes ? ` · ${formatDuration(Number(row.minutes))}` : ''}
              </div>
            </div>
          );
        })}
      {!logs.length ? <p className="hint">No events in the last {LOG_DAYS} days.</p> : null}
    </Chrome>
  );
}
