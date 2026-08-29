import { httpsCallable } from 'firebase/functions';

import { functions } from './firebase';

function call<TReq, TRes>(name: string) {
  return async (payload?: TReq): Promise<TRes> => {
    if (!functions) {
      throw new Error('Firebase is not configured.');
    }
    const fn = httpsCallable<TReq, TRes>(functions, name);
    const res = await fn(payload);
    return res.data;
  };
}

export const api = {
  bootstrap: call<Record<string, never>, { ok: boolean }>('bootstrap'),
  saveSettings: call<Record<string, unknown>, { ok: boolean }>('saveSettings'),
  saveBuckets: call<Record<string, unknown>, { ok: boolean }>('saveBuckets'),
  archiveBucket: call<{ id: string }, { ok: boolean }>('archiveBucket'),
  resetBucket: call<{ id: string }, { ok: boolean }>('resetBucket'),
  reorderBuckets: call<{ weightedOrderIds: string[] }, { ok: boolean }>('reorderBuckets'),
  upsertItem: call<Record<string, unknown>, { ok: boolean; id: string }>('upsertItem'),
  archiveItem: call<{ id: string }, { ok: boolean }>('archiveItem'),
  reorderItems: call<{ orderedIds: string[] }, { ok: boolean }>('reorderItems'),
  upsertAppointment: call<Record<string, unknown>, { ok: boolean; id: string }>('upsertAppointment'),
  archiveAppointment: call<{ id: string }, { ok: boolean }>('archiveAppointment'),
  rebuildRange: call<{ start?: string; days?: number }, { ok: boolean }>('rebuildRange'),
  completeBlock: call<{ date: string; id: string }, { ok: boolean }>('completeBlock'),
  skipBlock: call<{ date: string; id: string }, { ok: boolean }>('skipBlock'),
  startDay: call<{ date: string }, { ok: boolean }>('startDay'),
  endDay: call<{ date: string }, { ok: boolean }>('endDay'),
};
