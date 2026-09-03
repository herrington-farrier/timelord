import { httpsCallable } from 'firebase/functions';

import { describeError, pushToast } from '../shared/toastBus';
import { functions } from './firebase';

/**
 * DEBUG TOASTS: every callable reports itself here. This is the one place all
 * of them pass through, so it catches a failure even on a page that renders no
 * error of its own — which is how a refused save came to look like a save that
 * quietly did nothing. See the note in `shared/toastBus.ts`; delete the two
 * pushToast calls to remove it.
 */
function call<TReq, TRes>(name: string) {
  return async (payload?: TReq): Promise<TRes> => {
    if (!functions) {
      pushToast('fail', name, 'Firebase is not configured.');
      throw new Error('Firebase is not configured.');
    }
    const fn = httpsCallable<TReq, TRes>(functions, name);
    const started = Date.now();
    try {
      const res = await fn(payload);
      pushToast('ok', name, undefined, Date.now() - started);
      return res.data;
    } catch (err) {
      pushToast('fail', name, describeError(err), Date.now() - started);
      throw err;
    }
  };
}

export const api = {
  bootstrap: call<{ email?: string }, { ok: boolean }>('bootstrap'),
  saveSettings: call<Record<string, unknown>, { ok: boolean }>('saveSettings'),
  saveBuckets: call<Record<string, unknown>, { ok: boolean }>('saveBuckets'),
  archiveBucket: call<{ id: string }, { ok: boolean }>('archiveBucket'),
  reorderBuckets: call<{ weightedOrderIds: string[] }, { ok: boolean }>('reorderBuckets'),
  saveItems: call<{ rows: Record<string, unknown>[] }, { ok: boolean; saved: number }>('saveItems'),
  archiveItem: call<{ id: string }, { ok: boolean }>('archiveItem'),
  reorderItems: call<{ orderedIds: string[] }, { ok: boolean }>('reorderItems'),
  rebuildRange: call<{ start?: string; days?: number }, { ok: boolean }>('rebuildRange'),
  resetToday: call<Record<string, never>, { ok: boolean }>('resetToday'),
  clearLogs: call<Record<string, never>, { ok: boolean; removed: number }>('clearLogs'),
  completeBlock: call<{ date: string; id: string }, { ok: boolean }>('completeBlock'),
  skipBlock: call<{ date: string; id: string }, { ok: boolean }>('skipBlock'),
  startDay: call<{ date: string }, { ok: boolean }>('startDay'),
  startNext: call<{ date: string }, { ok: boolean }>('startNext'),
  startBreak: call<{ date: string }, { ok: boolean }>('startBreak'),
  endBreak: call<{ date: string }, { ok: boolean }>('endBreak'),
  endDay: call<{ date: string }, { ok: boolean }>('endDay'),
  wipeAccount: call<Record<string, never>, { ok: boolean }>('wipeAccount'),
};
