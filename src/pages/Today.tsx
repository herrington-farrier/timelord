import { formatClock, formatDuration } from '../domain/duration';
import { recomputeEtas } from '../domain/etas';
import type { PackedBlock } from '../domain/types';
import { api } from '../services/api';
import { useDay, useSettings } from '../services/live';
import { useAuth } from '../shared/auth';
import { nowMinutes, todayKey } from '../shared/dates';
import { formatActionError } from '../shared/formatActionError';
import { useToast } from '../shared/toast';
import { Chrome } from '../components/Chrome';

export function TodayPage() {
  const { user, logOut } = useAuth();
  const date = todayKey();
  const settings = useSettings(user?.uid);
  const day = useDay(user?.uid, date);
  const { showToast } = useToast();
  const started = Boolean(day?.startedAt) && !day?.endedAt;
  const blocks = started && day
    ? recomputeEtas(day.blocks || [], nowMinutes(settings?.timezone), settings?.transitionMinutes || 10)
    : day?.blocks || [];

  async function act(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      showToast(label, 'success');
    } catch (err) {
      console.error(err);
      showToast(formatActionError(err, label.replace(/\.$/, '')), 'error');
    }
  }

  return (
    <Chrome
      title="Timelord"
      stamp={day?.packedAt ? 'Packed' : 'Not packed'}
      actions={
        <>
          <button
            type="button"
            className="chrome-btn"
            onClick={() => act('Rebuilt.', () => api.rebuildRange({ start: date, days: 21 }))}
          >
            Rebuild
          </button>
          <button type="button" className="chrome-btn" onClick={() => logOut()}>
            Sign Out
          </button>
        </>
      }
    >
      <div className="day-totals">
        {formatDuration(settings?.dayMinutes || 0)} day · packed {formatDuration(day?.packedMinutes || 0)} · dropped{' '}
        {formatDuration(day?.droppedMinutes || 0)}
      </div>
      <div className="day-acts">
        <button
          type="button"
          className="btn--success"
          disabled={!day || Boolean(day.endedAt)}
          onClick={() => act('Day started.', () => api.startDay({ date }))}
        >
          Start Day
        </button>
        <button
          type="button"
          className="danger"
          disabled={!day?.startedAt || Boolean(day?.endedAt)}
          onClick={() => act('Day ended.', () => api.endDay({ date }))}
        >
          End Day
        </button>
      </div>
      <div className="day">
        {blocks.map((b) => (
          <BlockCard
            key={b.id}
            block={b}
            showEta={started}
            onComplete={() => act('Marked complete.', () => api.completeBlock({ date, id: b.id }))}
            onSkip={() => act('Skipped.', () => api.skipBlock({ date, id: b.id }))}
          />
        ))}
        {!day ? <p className="err">No packed day. Tap Rebuild.</p> : null}
      </div>
      {(day?.dropped?.length || 0) > 0 ? (
        <section className="fall-wrap">
          <h2>Falling off</h2>
          {(day?.droppedBuckets || []).map((b) => (
            <div key={b.bucketId} className="hint">
              {b.name} · {formatDuration(b.minutes)}
            </div>
          ))}
          {(day?.dropped || []).map((b) => (
            <div key={b.id} className="fall-row" style={{ ['--bcolor' as string]: `#${b.color}` }}>
              <span>
                {b.title} · {formatDuration(b.durationMinutes)}
              </span>
              {b.status === 'dropped' || b.status === 'pending' ? (
                <span className="item-acts">
                  <button type="button" className="btn--success" onClick={() => act('Marked complete.', () => api.completeBlock({ date, id: b.id }))}>
                    Complete
                  </button>
                  <button type="button" className="skip" onClick={() => act('Skipped.', () => api.skipBlock({ date, id: b.id }))}>
                    Skip
                  </button>
                </span>
              ) : (
                <span>{b.status}</span>
              )}
            </div>
          ))}
        </section>
      ) : null}
    </Chrome>
  );
}

function BlockCard({
  block,
  showEta,
  onComplete,
  onSkip,
}: {
  block: PackedBlock;
  showEta: boolean;
  onComplete: () => void;
  onSkip: () => void;
}) {
  if (block.kind === 'transition') {
    return <div className="buffer">{block.title}</div>;
  }
  const cls = block.status === 'complete' ? ' complete' : block.status === 'skipped' ? ' skipped' : '';
  return (
    <div className={`item${cls}`} style={{ ['--bcolor' as string]: `#${block.color}` }}>
      <div className="item-top">
        <div className="item-title">{block.title}</div>
        <div className="item-hours">{formatDuration(block.durationMinutes)}</div>
      </div>
      <div className="item-meta">
        {showEta ? <span className="eta">{formatClock(block.startMinutes)}–{formatClock(block.endMinutes)} · </span> : null}
        {block.status !== 'pending' ? block.status : ''}
      </div>
      {block.status === 'pending' && block.kind !== 'personal' ? (
        <div className="item-acts">
          <button type="button" className="btn--success" onClick={onComplete}>
            Complete
          </button>
          <button type="button" className="skip" onClick={onSkip}>
            Skip
          </button>
        </div>
      ) : null}
    </div>
  );
}
