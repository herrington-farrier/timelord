import { useSyncExternalStore } from 'react';

import {
  clearToasts,
  dismissToast,
  getToasts,
  subscribeToasts,
  toastsAsText,
} from '../shared/toastBus';

/** DEBUG TOASTS. See the note at the top of `shared/toastBus.ts`. */
export function Toasts() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  if (!toasts.length) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      <div className="toasts__bar">
        <button
          type="button"
          className="chrome-btn toasts__act"
          onClick={() => {
            // A phone has no console, so the log has to be liftable by hand.
            void navigator.clipboard?.writeText(toastsAsText(toasts));
          }}
        >
          Copy
        </button>
        <button type="button" className="chrome-btn toasts__act" onClick={() => clearToasts()}>
          Clear
        </button>
      </div>
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`toast toast--${t.kind}`}
          onClick={() => dismissToast(t.id)}
        >
          <span className="toast__label">
            {t.label}
            {t.ms == null ? null : <span className="toast__ms"> {t.ms}ms</span>}
          </span>
          {t.detail ? <span className="toast__detail">{t.detail}</span> : null}
        </button>
      ))}
    </div>
  );
}
