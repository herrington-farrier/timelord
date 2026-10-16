import { useSyncExternalStore } from 'react';

import { clearToasts, dismissToast, getToasts, subscribeToasts } from '../shared/toastBus';

/** Failures and the few confirmations that are worth a line. See `shared/toastBus.ts`. */
export function Toasts() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  if (!toasts.length) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      <div className="toasts__bar">
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
          {t.message}
        </button>
      ))}
    </div>
  );
}
