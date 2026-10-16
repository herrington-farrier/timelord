import { httpsCallable } from 'firebase/functions';

import type { Slot } from '../domain/types';
import { functions } from './firebase';

/**
 * Callables only call. The page that triggered one reports its own failure
 * (`toastFailure`), because only the page knows the control's name.
 */
function call<TReq, TRes>(name: string) {
  return async (payload?: TReq): Promise<TRes> => {
    if (!functions) throw new Error('Firebase is not configured.');
    const res = await httpsCallable<TReq, TRes>(functions, name)(payload);
    return res.data;
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
  startNext: call<{ date?: string; from: Slot | 'event' }, { ok: boolean }>('startNext'),
  startBreak: call<{ date: string }, { ok: boolean }>('startBreak'),
  endBreak: call<{ date: string }, { ok: boolean }>('endBreak'),
  endDay: call<{ date: string }, { ok: boolean }>('endDay'),
};
