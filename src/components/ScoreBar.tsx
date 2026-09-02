import { useEffect, useRef, useState } from 'react';

import { scoreBand } from '../domain/score';

type Props = {
  total: number;
  /** What today added, shown once beside the bar after Hearth. */
  delta?: number;
};

/**
 * The running score, as a bar that fills and starts again every hundred. The
 * level is arbitrary and says so — the number that means anything is the total.
 */
export function ScoreBar({ total, delta }: Props) {
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
    <div className="score">
      <div className="score__head">
        <span className="score__level">Level {level}</span>
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
        aria-valuemax={100}
        aria-label={`Level ${level}, ${total} points`}
      >
        <div className="score__fill" style={{ width: `${shown}%` }} />
      </div>
    </div>
  );
}
