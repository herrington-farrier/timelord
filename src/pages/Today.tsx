import { useEffect, useRef, useState } from 'react';

import { Chrome } from '../components/Chrome';
import { formatDuration } from '../domain/duration';
import { isEventDay } from '../domain/sections';
import {
  appointmentElapsed,
  formatCountdown,
  nextSectionAction,
  signalSectionEnd,
  slotLabel,
  todayEventItems,
  todaySectionDropped,
  todaySectionItems,
} from '../domain/today';
import { sectionRemainingNow } from '../domain/timer';
import { EVENTS_ID, type PackedBlock, type Slot } from '../domain/types';
import { api } from '../services/api';
import { useBuckets, useDay, useSettings } from '../services/live';
import { useAuth } from '../shared/auth';
import { todayKey } from '../shared/dates';
import { formatActionError } from '../shared/formatActionError';
import { useToast } from '../shared/toast';

export function TodayPage() {
  const { user, logOut } = useAuth();
  const date = todayKey();
  const settings = useSettings(user?.uid);
  const buckets = useBuckets(user?.uid);
  const day = useDay(user?.uid, date);
  const { showToast } = useToast();
  const events = buckets.find((b) => b.id === EVENTS_ID || b.kind === 'event');
  const eventDay = isEventDay(events, date);
  const started = Boolean(day?.startedAt) && !day?.endedAt;
  const ended = Boolean(day?.endedAt);
  const section = day?.section && day.section !== 'event' ? day.section : null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const wasPositive = useRef(true);

  useEffect(() => {
    if (!started) return;
    const tick = () => setNowMs(Date.now());
    const id = window.setInterval(tick, 1000);
    window.addEventListener('visibilitychange', tick);
    window.addEventListener('pageshow', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('visibilitychange', tick);
      window.removeEventListener('pageshow', tick);
      window.removeEventListener('focus', tick);
    };
  }, [started]);

  const remaining = started && section
    ? sectionRemainingNow(day?.sectionRemainingMinutes || 0, day?.sectionStartedAt, day?.pausedAt, nowMs)
    : 0;
  const paused = Boolean(day?.pausedAt);

  useEffect(() => {
    if (!started || eventDay || !section) return;
    if (wasPositive.current && remaining <= 0) {
      signalSectionEnd(settings?.timerSound !== false, settings?.timerVibrate === true);
    }
    wasPositive.current = remaining > 0;
  }, [remaining, started, eventDay, section, settings?.timerSound, settings?.timerVibrate]);

  async function act(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      showToast(label, 'success');
    } catch (err) {
      console.error(err);
      showToast(formatActionError(err, label.replace(/\.$/, '')), 'error');
    }
  }

  const placed = day?.blocks || [];
  const dropped = day?.dropped || [];
  const sectionItems = started && section ? todaySectionItems(placed, section) : [];
  const sectionDropped = started && section ? todaySectionDropped(dropped, section) : [];
  const eventItems = eventDay ? todayEventItems(placed) : [];

  return (
    <Chrome
      title="Timelord"
      stamp={day?.packedAt ? 'Packed' : 'Not packed'}
      actions={
        <button type="button" className="chrome-btn" onClick={() => logOut()}>
          Sign Out
        </button>
      }
    >
      <div className="day-totals">
        {eventDay
          ? `Event day · ${formatDuration(day?.packedMinutes || 0)}`
          : `${formatDuration(settings?.dayMinutes || 0)} day · packed ${formatDuration(day?.packedMinutes || 0)}`}
      </div>

      {eventDay ? null : (
        <NormalDayControls
          started={started}
          ended={ended}
          section={section}
          remaining={remaining}
          paused={paused}
          ready={Boolean(day)}
          onStartDay={() => act('Day started.', () => api.startDay({ date }))}
        />
      )}

      {!day ? <p className="err">No packed day.</p> : null}

      {eventDay && day ? (
        <div className="day">
          {eventItems.map((b) => (
            <ItemCard key={b.id} block={b} date={date} act={act} />
          ))}
          {!eventItems.length ? <p className="hint">No Events items today.</p> : null}
        </div>
      ) : null}

      {!eventDay && started && section ? (
        <div className="day">
          {sectionItems
            .filter((b) => b.kind === 'appointment')
            .map((b) => (
              <AppointmentCard
                key={b.id}
                block={b}
                date={date}
                nowMs={nowMs}
                run={day?.appointmentRuns?.[b.appointmentId || '']}
                act={act}
              />
            ))}
          {sectionItems
            .filter((b) => b.kind !== 'appointment')
            .map((b) =>
              b.title === 'Break' ? (
                <BreakControl
                  key={b.id}
                  on={paused}
                  onStart={() => act('Break started.', () => api.startBreak({ date }))}
                  onEnd={() => act('Break ended.', () => api.endBreak({ date }))}
                />
              ) : (
                <ItemCard key={b.id} block={b} date={date} act={act} />
              )
            )}
        </div>
      ) : null}

      {!eventDay && started && sectionDropped.length ? (
        <section className="fall-wrap">
          <h2>Falling off</h2>
          {sectionDropped.map((b) => (
            <div key={b.id} className="fall-row" style={{ ['--bcolor' as string]: `#${b.color}` }}>
              <span>
                {b.title}
                {b.durationMinutes ? ` · ${formatDuration(b.durationMinutes)}` : ''}
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

      {!eventDay && started && section ? (
        <SectionEndActs
          section={section}
          remaining={remaining}
          onStartNext={() =>
            act(section === 'morning' ? 'Midday started.' : 'Evening started.', () => api.startNext({ date }))
          }
          onEvening={() => act('Day ended.', () => api.endDay({ date }))}
        />
      ) : null}
    </Chrome>
  );
}

function NormalDayControls({
  started,
  ended,
  section,
  remaining,
  paused,
  ready,
  onStartDay,
}: {
  started: boolean;
  ended: boolean;
  section: Slot | null;
  remaining: number;
  paused: boolean;
  ready: boolean;
  onStartDay: () => void;
}) {
  if (ended) return <p className="hint">Day ended.</p>;
  if (!started) {
    return (
      <div className="day-acts">
        <button type="button" className="btn--success" disabled={!ready} onClick={onStartDay}>
          Start Day
        </button>
      </div>
    );
  }
  return (
    <div className="day-totals">
      <span className={`section-timer${paused ? ' is-paused' : ''}`} aria-live="polite">
        {formatCountdown(remaining)}
      </span>
      {paused ? ' · paused' : ''}
      {section ? ` · ${slotLabel(section)}` : ''}
    </div>
  );
}

function SectionEndActs({
  section,
  remaining,
  onStartNext,
  onEvening,
}: {
  section: Slot;
  remaining: number;
  onStartNext: () => void;
  onEvening: () => void;
}) {
  const action = nextSectionAction(section);
  return (
    <div className="day-acts day-acts--end">
      {action.kind === 'end' ? (
        <button type="button" className="danger" onClick={onEvening}>
          {action.label}
        </button>
      ) : (
        <button type="button" className="btn--success" onClick={onStartNext}>
          {action.label} · {formatCountdown(remaining)}
        </button>
      )}
    </div>
  );
}

function BreakControl({ on, onStart, onEnd }: { on: boolean; onStart: () => void; onEnd: () => void }) {
  return (
    <div className="item">
      <div className="item-top">
        <div className="item-title">Break</div>
      </div>
      <div className="item-acts">
        {on ? (
          <button type="button" className="danger" onClick={onEnd}>
            End Break
          </button>
        ) : (
          <button type="button" className="skip" onClick={onStart}>
            Start Break
          </button>
        )}
      </div>
    </div>
  );
}

function AppointmentCard({
  block,
  date,
  nowMs,
  run,
  act,
}: {
  block: PackedBlock;
  date: string;
  nowMs: number;
  run?: { startedAt?: string; elapsedMinutes?: number };
  act: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const running = Boolean(run?.startedAt);
  const elapsed = appointmentElapsed(run, nowMs);
  const id = block.appointmentId || '';
  return (
    <div className="item item--appt" style={{ ['--bcolor' as string]: `#${block.color}` }}>
      <div className="item-top">
        <div className="item-title">
          <span className="item-tag">Appt</span>
          {block.title}
        </div>
        <div className="item-hours">{formatCountdown(elapsed)}</div>
      </div>
      <div className="item-meta">{block.durationMinutes ? formatDuration(block.durationMinutes) : ''}</div>
      <div className="item-acts">
        {running ? (
          <button type="button" className="danger" onClick={() => act('Appointment stopped.', () => api.stopAppointment({ date, id }))}>
            Stop
          </button>
        ) : (
          <button type="button" className="btn--success" onClick={() => act('Appointment started.', () => api.startAppointment({ date, id }))}>
            Start
          </button>
        )}
      </div>
    </div>
  );
}

function ItemCard({
  block,
  date,
  act,
}: {
  block: PackedBlock;
  date: string;
  act: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const cls = `${block.status === 'complete' ? ' complete' : block.status === 'skipped' ? ' skipped' : ''}`;
  return (
    <div className={`item${cls}`} style={{ ['--bcolor' as string]: `#${block.color}` }}>
      <div className="item-top">
        <div className="item-title">
          {block.kind === 'event' ? <span className="item-tag">Event</span> : null}
          {block.title}
        </div>
        {block.durationMinutes ? <div className="item-hours">{formatDuration(block.durationMinutes)}</div> : null}
      </div>
      {block.status === 'pending' ? (
        <div className="item-acts">
          <button type="button" className="btn--success" onClick={() => act('Marked complete.', () => api.completeBlock({ date, id: block.id }))}>
            Complete
          </button>
          <button type="button" className="skip" onClick={() => act('Skipped.', () => api.skipBlock({ date, id: block.id }))}>
            Skip
          </button>
        </div>
      ) : (
        <div className="item-meta">{block.status}</div>
      )}
    </div>
  );
}
