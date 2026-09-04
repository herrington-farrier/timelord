import { useEffect, useRef, useState } from 'react';

import { SCORE_BAND, scoreBand } from '../domain/score';

type Props = {
  total: number;
  /** What today added, shown once beside the bar after Hearth. */
  delta?: number;
  /** Stats gives it the whole column; Quest keeps it to the width of the seal. */
  wide?: boolean;
};

/** Notches, so the bar reads as a gauge filling rather than a plain rectangle. */
const NOTCHES = 10;

/**
 * The running score, as a bar that fills and starts again every hundred. The
 * level is arbitrary and says so — the number that means anything is the total.
 */
export function ScoreBar({ total, delta, wide }: Props) {
  const { level, into, pct } = scoreBand(total);
  // Animate from where the bar was, so a finished day visibly moves it.
  const [shown, setShown] = useState(pct);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      const id = window.setTimeout(() => setShown(pct), 60);
      return () => window.clearTimeout(id);
    }
    setShown(pct);
  }, [pct]);

  return (
    <div className={`score${wide ? ' score--wide' : ''}`}>
      <div className="score__head">
        <span className="score__badge">
          <span className="score__badge-word">Lv</span>
          <b className="score__badge-num">{level}</b>
        </span>
        <span className="score__xp">
          {into} <i>/ {SCORE_BAND}</i>
        </span>
        {delta ? (
          <span className={`score__delta${delta < 0 ? ' is-down' : ''}`}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
        ) : null}
        <span className="score__total">{total}</span>
      </div>
      <div
        className="score__track"
        role="progressbar"
        aria-valuenow={into}
        aria-valuemin={0}
        aria-valuemax={SCORE_BAND}
        aria-label={`Level ${level}, ${total} points`}
      >
        <div className="score__fill" style={{ width: `${shown}%` }}>
          <span className="score__shine" aria-hidden="true" />
        </div>
        <span className="score__notches" aria-hidden="true">
          {Array.from({ length: NOTCHES - 1 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      </div>
    </div>
  );
}
