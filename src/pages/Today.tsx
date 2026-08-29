import { useEffect, useRef, useState } from 'react';

import { Chrome } from '../components/Chrome';
import { formatDuration } from '../domain/duration';
import { isEventDay } from '../domain/sections';
import {
  appointmentElapsed,
  formatCountdown,
  signalSectionEnd,
  todayEventItems,
  todaySectionDropped,
  todaySectionItems,
} from '../domain/today';
import { elapsedSince, sectionRemainingNow } from '../domain/timer';
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
  const [morningOn, setMorningOn] = useState(false);
  const wasPositive = useRef(true);

  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [started]);

  const remaining = started && section
    ? sectionRemainingNow(day?.sectionRemainingMinutes || 0, day?.sectionStartedAt, day?.pausedAt, nowMs)
    : 0;
  const eventElapsed = started && eventDay && day?.eventStartedAt ? elapsedSince(day.eventStartedAt, nowMs) : 0;
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
        <>
          <button
            type="button"
            className="chrome-btn"
            onClick={() => act('Rebuilt.', () => api.rebuildRange({ start: date, days: 21 }))}
          >
            Pack
          </button>
          <button type="button" className="chrome-btn" onClick={() => logOut()}>
            Sign Out
          </button>
        </>
      }
    >
      <div className="day-totals">
        {eventDay
          ? `Event day · ${formatDuration(day?.packedMinutes || 0)}`
          : `${formatDuration(settings?.dayMinutes || 0)} day · packed ${formatDuration(day?.packedMinutes || 0)}`}
      </div>

      {eventDay ? (
        <EventDayControls
          started={started}
          ended={ended}
          elapsed={eventElapsed}
          ready={Boolean(day)}
          onStart={() => act('Day started.', () => api.startDay({ date }))}
          onEnd={() => act('Day ended.', () => api.endDay({ date }))}
        />
      ) : (
        <NormalDayControls
          started={started}
          ended={ended}
          morningOn={morningOn}
          section={section}
          remaining={remaining}
          paused={paused}
          ready={Boolean(day)}
          onMorningStart={() => setMorningOn(true)}
          onMorningEnd={() =>
            act('Day started.', async () => {
              await api.startDay({ date });
              setMorningOn(false);
            })
          }
          onStartNext={() => act('Next section.', () => api.startNext({ date }))}
          onEvening={() => act('Day ended.', () => api.endDay({ date }))}
        />
      )}

      {!day ? <p className="err">No packed day. Tap Pack.</p> : null}

      {eventDay && started ? (
        <div className="day">
          {eventItems.map((b) => (
            <ItemCard key={b.id} block={b} date={date} act={act} />
          ))}
        </div>
      ) : null}

      {!eventDay && !started && !ended ? (
        <p className="hint">End Morning Routine to start the morning timer.</p>
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
    </Chrome>
  );
}

function EventDayControls({
  started,
  ended,
  elapsed,
  ready,
  onStart,
  onEnd,
}: {
  started: boolean;
  ended: boolean;
  elapsed: number;
  ready: boolean;
  onStart: () => void;
  onEnd: () => void;
}) {
  if (ended) return <p className="hint">Day ended.</p>;
  if (!started) {
    return (
      <div className="day-acts">
        <button type="button" className="btn--success" disabled={!ready} onClick={onStart}>
          Start Day
        </button>
      </div>
    );
  }
  return (
    <div className="day-acts">
      <div className="section-timer" aria-live="polite">
        {formatCountdown(elapsed)}
      </div>
      <button type="button" className="danger" onClick={onEnd}>
        End Day
      </button>
    </div>
  );
}

function NormalDayControls({
  started,
  ended,
  morningOn,
  section,
  remaining,
  paused,
  ready,
  onMorningStart,
  onMorningEnd,
  onStartNext,
  onEvening,
}: {
  started: boolean;
  ended: boolean;
  morningOn: boolean;
  section: Slot | null;
  remaining: number;
  paused: boolean;
  ready: boolean;
  onMorningStart: () => void;
  onMorningEnd: () => void;
  onStartNext: () => void;
  onEvening: () => void;
}) {
  if (ended) return <p className="hint">Day ended.</p>;
  if (!started) {
    return (
      <div className="day-acts">
        {morningOn ? (
          <button type="button" className="danger" onClick={onMorningEnd}>
            End Routine
          </button>
        ) : (
          <button type="button" className="btn--success" disabled={!ready} onClick={onMorningStart}>
            Start Routine
          </button>
        )}
      </div>
    );
  }
  return (
    <>
      <div className="day-totals">
        <span className={`section-timer${paused ? ' is-paused' : ''}`} aria-live="polite">
          {formatCountdown(remaining)}
        </span>
        {paused ? ' · paused' : ''}
        {section ? ` · ${section}` : ''}
      </div>
      <div className="day-acts day-acts--end">
        {section === 'evening' ? (
          <button type="button" className="danger" onClick={onEvening}>
            Start Evening Routine
          </button>
        ) : (
          <button type="button" className="btn--success" onClick={onStartNext}>
            Start Next · {formatCountdown(remaining)}
          </button>
        )}
      </div>
    </>
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
