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

type DayActionName = 'warm' | 'complete' | 'skip' | 'startDay' | 'startNext' | 'startBreak' | 'endBreak' | 'endDay';
type DayActionPayload = { action: DayActionName; date?: string; id?: string; from?: Slot | 'event' };

/** Every Today-page action goes through one callable so they share one warm instance. */
const dayAction = call<DayActionPayload, { ok: boolean; delta?: number }>('dayAction');

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
  completeBlock: (p: { date: string; id: string }) => dayAction({ action: 'complete', ...p }),
  skipBlock: (p: { date: string; id: string }) => dayAction({ action: 'skip', ...p }),
  startDay: (p: { date: string }) => dayAction({ action: 'startDay', ...p }),
  startNext: (p: { date?: string; from: Slot | 'event' }) => dayAction({ action: 'startNext', ...p }),
  startBreak: (p: { date: string }) => dayAction({ action: 'startBreak', ...p }),
  endBreak: (p: { date: string }) => dayAction({ action: 'endBreak', ...p }),
  endDay: (p: { date: string }) => dayAction({ action: 'endDay', ...p }),
  warmDay: () => dayAction({ action: 'warm' }),
};
