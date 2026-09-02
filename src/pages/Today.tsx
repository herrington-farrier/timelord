import { useEffect, useId, useRef, useState } from 'react';

import { Chrome } from '../components/Chrome';
import { loadTone } from '../domain/budget';
import { formatApptTime, formatDuration } from '../domain/duration';
import { isEventDay } from '../domain/sections';
import {
  formatCountdown,
  nextSectionAction,
  nextSectionMinutes,
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

/** Feeds the list-assembly animation; each card starts a beat after the last. */
function stagger(index?: number): Record<string, string> {
  return index === undefined ? {} : { ['--i']: String(index) };
}

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
      compact
      title="Timelord"
      actions={
        <button type="button" className="chrome-btn" onClick={() => logOut()}>
          Sign Out
        </button>
      }
    >
      <DayHead
        eventDay={eventDay}
        dayMinutes={settings?.dayMinutes || 0}
        packedMinutes={day?.packedMinutes || 0}
        running={started && !eventDay && Boolean(section)}
        section={section}
        remaining={remaining}
        paused={paused}
      />

      {eventDay ? null : (
        <NormalDayControls
          started={started}
          ended={ended}
          ready={Boolean(day)}
          onStartDay={() => act('Quest started.', () => api.startDay({ date }))}
        />
      )}

      {!day ? <p className="err">No packed day.</p> : null}

      {eventDay && day ? (
        <div className="day">
          {eventItems.map((b, i) => (
            <ItemCard key={b.id} block={b} date={date} act={act} index={i} />
          ))}
          {!eventItems.length ? <p className="hint">No Events items today.</p> : null}
        </div>
      ) : null}

      {!eventDay && started && section ? (
        <div className="day">
          {sectionItems.map((b, i) =>
            b.title === 'Break' ? (
              <BreakControl
                key={b.id}
                on={paused}
                color={b.color}
                index={i}
                onStart={() => act('Resting.', () => api.startBreak({ date }))}
                onEnd={() => act('Rest over.', () => api.endBreak({ date }))}
              />
            ) : (
              <ItemCard key={b.id} block={b} date={date} act={act} index={i} />
            )
          )}
        </div>
      ) : null}

      {!eventDay && started && sectionDropped.length ? (
        <section className="fall-wrap">
          <h2>Falling off</h2>
          {sectionDropped.map((b) => (
            <FallRow key={b.id} block={b} date={date} act={act} />
          ))}
        </section>
      ) : null}

      {!eventDay && started && section ? (
        <SectionEndActs
          section={section}
          nextMinutes={nextSectionMinutes(placed, section)}
          onStartNext={() =>
            act(section === 'morning' ? 'Midday started.' : 'Evening started.', () => api.startNext({ date }))
          }
          onEvening={() => act('Day ended.', () => api.endDay({ date }))}
        />
      ) : null}
    </Chrome>
  );
}

function DayHead({
  eventDay,
  dayMinutes,
  packedMinutes,
  running,
  section,
  remaining,
  paused,
}: {
  eventDay: boolean;
  dayMinutes: number;
  packedMinutes: number;
  running: boolean;
  section: Slot | null;
  remaining: number;
  paused: boolean;
}) {
  return (
    <header className="day-head">
      {running && section ? (
        <div className="day-head__now">
          <span className={`section-timer${paused ? ' is-paused' : ''}`} aria-live="polite">
            {formatCountdown(remaining)}
          </span>
          <span className="day-head__section">{paused ? 'Resting' : slotLabel(section)}</span>
        </div>
      ) : null}
      <dl className="day-head__stats">
        <div className="stat">
          <dt className="stat__label">Day</dt>
          <dd className="stat__value">{eventDay ? 'Event' : formatDuration(dayMinutes)}</dd>
        </div>
        <div className="stat">
          <dt className="stat__label">Packed</dt>
          <dd className={`stat__value${eventDay ? '' : ` stat__value--${loadTone(packedMinutes, dayMinutes)}`}`}>
            {formatDuration(packedMinutes)}
          </dd>
        </div>
      </dl>
    </header>
  );
}

function NormalDayControls({
  started,
  ended,
  ready,
  onStartDay,
}: {
  started: boolean;
  ended: boolean;
  ready: boolean;
  onStartDay: () => void;
}) {
  if (ended) {
    return (
      <div className="seal-wrap">
        <img className="day-seal is-done" src="/icon-192.png" alt="Day ended" width={192} height={192} />
      </div>
    );
  }
  if (!started) {
    return (
      <div className="seal-wrap">
        <button type="button" className="day-seal-btn" disabled={!ready} onClick={onStartDay}>
          <img className="day-seal" src="/icon-192.png" alt="" width={192} height={192} />
          <span className="day-seal-btn__label">Start Quest</span>
        </button>
      </div>
    );
  }
  return null;
}

function SectionEndActs({
  section,
  nextMinutes,
  onStartNext,
  onEvening,
}: {
  section: Slot;
  nextMinutes: number;
  onStartNext: () => void;
  onEvening: () => void;
}) {
  const action = nextSectionAction(section);
  return (
    <div className="day-acts day-acts--end">
      {action.kind === 'end' ? (
        <button type="button" className="btn--red" onClick={onEvening}>
          {action.label}
        </button>
      ) : (
        <button type="button" className="btn--quest" onClick={onStartNext}>
          <span className="btn--quest__label">{action.label}</span>
          <span className="btn--quest__time">{formatCountdown(nextMinutes)}</span>
        </button>
      )}
    </div>
  );
}

function BreakControl({
  on,
  color,
  index,
  onStart,
  onEnd,
}: {
  on: boolean;
  color?: string;
  index?: number;
  onStart: () => void;
  onEnd: () => void;
}) {
  return (
    // Break is the only Personal block Quest shows, so without --bcolor the
    // Personal colour never appeared anywhere on the page.
    <div className="item" style={{ ['--bcolor' as string]: `#${color || '5b9bd5'}`, ...stagger(index) }}>
      <div className="item-top">
        <div className="item-title">Break</div>
      </div>
      <div className="item-acts">
        {on ? (
          <button type="button" className="btn--red" onClick={onEnd}>
            End Rest
          </button>
        ) : (
          <button type="button" className="btn--green" onClick={onStart}>
            Rest ZZZ
          </button>
        )}
      </div>
    </div>
  );
}

function FallRow({
  block,
  date,
  act,
}: {
  block: PackedBlock;
  date: string;
  act: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const actsId = useId();
  const actionable = block.status === 'dropped' || block.status === 'pending';
  const label = `${block.title}${block.durationMinutes ? ` · ${formatDuration(block.durationMinutes)}` : ''}`;
  return (
    <div className={`fall-row${open ? ' is-open' : ''}`} style={{ ['--bcolor' as string]: `#${block.color}` }}>
      {actionable ? (
        <button
          type="button"
          className="item-open"
          aria-expanded={open}
          aria-controls={actsId}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{label}</span>
        </button>
      ) : (
        <div className="item-top">
          <span>{label}</span>
          <span>{block.status}</span>
        </div>
      )}
      {actionable ? (
        <div id={actsId} className="item-acts" hidden={!open}>
          <button type="button" className="btn--gold" onClick={() => act('Marked complete.', () => api.completeBlock({ date, id: block.id }))}>
            Complete
          </button>
          <button type="button" className="btn--red" onClick={() => act('Skipped.', () => api.skipBlock({ date, id: block.id }))}>
            Skip
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ItemCard({
  block,
  date,
  act,
  index,
}: {
  block: PackedBlock;
  date: string;
  act: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  index?: number;
}) {
  const [open, setOpen] = useState(false);
  const actsId = useId();
  const cls = `${block.status === 'complete' ? ' complete' : block.status === 'skipped' ? ' skipped' : ''}`;
  const pending = block.status === 'pending';
  const title = (
    <>
      {block.kind === 'event' ? <span className="item-tag">Event</span> : null}
      {block.kind === 'appointment' ? <span className="item-tag">Appt</span> : null}
      {block.title}
      {block.apptTime ? <span className="item-when">{formatApptTime(block.apptTime)}</span> : null}
    </>
  );
  const hours = block.durationMinutes ? formatDuration(block.durationMinutes) : null;
  return (
    <div
      className={`item${cls}${open ? ' is-open' : ''}`}
      style={{ ['--bcolor' as string]: `#${block.color}`, ...stagger(index) }}
    >
      {pending ? (
        <button
          type="button"
          className="item-open"
          aria-expanded={open}
          aria-controls={actsId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="item-title">{title}</span>
          {hours ? <span className="item-hours">{hours}</span> : null}
        </button>
      ) : (
        <div className="item-top">
          <div className="item-title">{title}</div>
          {hours ? <div className="item-hours">{hours}</div> : null}
        </div>
      )}
      {pending ? (
        <div id={actsId} className="item-acts" hidden={!open}>
          <button type="button" className="btn--gold" onClick={() => act('Marked complete.', () => api.completeBlock({ date, id: block.id }))}>
            Complete
          </button>
          <button type="button" className="btn--red" onClick={() => act('Skipped.', () => api.skipBlock({ date, id: block.id }))}>
            Skip
          </button>
        </div>
      ) : (
        <div className="item-meta">{block.status}</div>
      )}
    </div>
  );
}
