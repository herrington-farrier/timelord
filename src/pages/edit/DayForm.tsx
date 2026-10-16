import { useState } from 'react';

import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DaySectionsBar } from '../../components/DaySectionsBar';
import { FormField } from '../../components/FormField';
import { formatDuration, hoursToMinutes, splitMinutes } from '../../domain/duration';
import { evenSectionSplit, rescaleSectionSplit, sectionMinutes, stepSectionSplit } from '../../domain/sections';
import { SLOTS, type DaySettings, type Slot } from '../../domain/types';
import { durationFrom } from './formRead';

const STEP = 60;


/**
 * One stretch, stepped in whole hours. No minute field: a day is planned in
 * hours, and the arithmetic that used to need one is now done by the step
 * itself — an hour added here is an hour taken from the next stretch, so the
 * three always add back to the day and there is nothing to get wrong.
 *
 * A step is offered only when it can actually happen, so the buttons never
 * promise something the neighbouring stretch cannot pay for.
 */
function SectionStepper({
  slot,
  split,
  onStep,
}: {
  slot: Slot;
  split: Record<Slot, number>;
  onStep: (deltaMinutes: number) => void;
}) {
  const name = slot[0].toUpperCase() + slot.slice(1);
  const canAdd = stepSectionSplit(split, slot, STEP) !== split;
  const canTake = stepSectionSplit(split, slot, -STEP) !== split;
  return (
    <div className="stepper" data-slot={slot}>
      <span className="stepper__name">{name}</span>
      <div className="stepper__row">
        <button
          type="button"
          className="stepper__btn"
          aria-label={`Less ${name}`}
          disabled={!canTake}
          onClick={() => onStep(-STEP)}
        >
          −
        </button>
        <b className="stepper__value">{formatDuration(split[slot])}</b>
        <button
          type="button"
          className="stepper__btn"
          aria-label={`More ${name}`}
          disabled={!canAdd}
          onClick={() => onStep(STEP)}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function DayForm({
  settings,
  busy,
  onSave,
  onResetToday,
  onReroll,
}: {
  settings: DaySettings;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<boolean>;
  onResetToday: () => Promise<boolean>;
  onReroll: () => Promise<boolean>;
}) {
  // Erasing the log cannot be undone, so it asks. A dialog rather than a
  // second press on the same button: a label that changes under your finger
  // never reads as a question.
  const [confirmReroll, setConfirmReroll] = useState(false);
  const day = splitMinutes(settings.dayMinutes);
  // The split is held here rather than read off the inputs, because a step
  // changes two stretches at once: there is nothing sensible to read from a
  // field halfway through being balanced.
  const [dayMinutes, setDayMinutes] = useState(settings.dayMinutes);
  const [split, setSplit] = useState<Record<Slot, number>>(() => sectionMinutes(settings));

  function readDay(form: HTMLElement) {
    const nextDay = durationFrom(form, 'day', settings.dayMinutes);
    // A field halfway through being retyped reads as 0 for a keystroke or two.
    // Rescaling to that would collapse the balance to nothing and then spread
    // the new day evenly, quietly undoing whatever was just set.
    if (nextDay <= 0 || nextDay === dayMinutes) return;
    // Carry the balance onto the new day rather than discarding it.
    setSplit((prev) => rescaleSectionSplit(prev, dayMinutes, nextDay));
    setDayMinutes(nextDay);
  }

  return (
    <form
      className="edit-page"
      onInput={(e) => readDay(e.currentTarget)}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSave({
          dayMinutes: hoursToMinutes(fd.get('dayH'), fd.get('dayM')),
          sectionSplit: split,
          dayStartMinutes: settings.dayStartMinutes,
          transitionMinutes: Number(fd.get('trans')),
          morningMinutes: settings.morningMinutes,
          breakMinutes: settings.breakMinutes,
          eveningMinutes: settings.eveningMinutes,
          timerSound: fd.get('timerSound') === 'on',
          timerVibrate: fd.get('timerVibrate') === 'on',
          personalCountsAsDay: fd.get('personalCountsAsDay') === 'on',
        });
      }}
    >
      <DaySectionsBar dayMinutes={dayMinutes} split={split} />
      <div className="edit-card meta-form">
        <div className="fields">
          {/* Hours only. The day is planned in hours, and a minute field here
              would put the stretches back to reading 4h40m. */}
          <FormField label="Day Length (hrs)">
            <input name="dayH" type="number" min={1} max={24} defaultValue={day.hours} />
          </FormField>
          <FormField label="Transition minutes">
            <input name="trans" type="number" min={0} defaultValue={settings.transitionMinutes} />
          </FormField>
        </div>
      </div>
      <div className="edit-card meta-form">
        <h3 className="group-h">Sections</h3>
        <div className="steppers">
          {SLOTS.map((slot) => (
            <SectionStepper
              key={slot}
              slot={slot}
              split={split}
              onStep={(delta) => setSplit((prev) => stepSectionSplit(prev, slot, delta))}
            />
          ))}
        </div>
        <div className="split-sum">
          <p className="hint">An hour added to one stretch comes out of the next.</p>
          <button type="button" className="chrome-btn" onClick={() => setSplit(evenSectionSplit(dayMinutes))}>
            Even Split
          </button>
        </div>
      </div>
      <div className="edit-card meta-form">
        <div className="fields">
          <div className="field">
            <span>Personal time</span>
            <div className="pills" role="group" aria-label="Personal time">
              <label>
                <input
                  name="personalCountsAsDay"
                  type="checkbox"
                  defaultChecked={settings.personalCountsAsDay === true}
                />
                Counts as day hours
              </label>
            </div>
          </div>
          <div className="field">
            <span>Timer alerts</span>
            <div className="pills" role="group" aria-label="Timer alerts">
              <label>
                <input name="timerSound" type="checkbox" defaultChecked={settings.timerSound !== false} />
                Sound
              </label>
              <label>
                <input name="timerVibrate" type="checkbox" defaultChecked={settings.timerVibrate === true} />
                Vibrate
              </label>
            </div>
          </div>
        </div>
      </div>
      <div className="page-save">
        <button type="button" className="btn--green" disabled={busy} onClick={() => onResetToday()}>
          Respawn
        </button>
        <button type="button" className="btn--red" onClick={() => setConfirmReroll(true)}>
          Reroll Stats
        </button>
        <button type="submit" className="btn--gold" disabled={busy}>
          Save
        </button>
      </div>
      <ConfirmDialog
        open={confirmReroll}
        title="Erase all Stats?"
        confirmLabel="Erase"
        onCancel={() => setConfirmReroll(false)}
        onConfirm={() => {
          setConfirmReroll(false);
          onReroll();
        }}
      />
    </form>
  );
}
