import { useRef, useState } from 'react';

import { Chrome } from '../components/Chrome';
import { PACK_RANGE_DAYS } from '../domain/packWeek';
import { listableBuckets } from '../domain/seed';
import type { Cadence } from '../domain/types';
import { api } from '../services/api';
import { useBuckets, useItems, useSettings } from '../services/live';
import { isLoadFailed } from '../services/loadState';
import { toActionError, type ActionError } from '../shared/actionError';
import { pushToast, toastFailure } from '../shared/toastBus';
import { useAuth } from '../shared/useAuth';
import { BucketsForm } from './edit/BucketsForm';
import { DayForm } from './edit/DayForm';
import { dayFormKey } from './edit/formRead';
import { ListsForm } from './edit/ListsForm';

const TABS = ['day', 'buckets', 'lists'] as const;


export function EditPage() {
  const { user } = useAuth();
  const settings = useSettings(user?.uid);
  const bucketsRaw = useBuckets(user?.uid);
  const loadFailed = isLoadFailed(bucketsRaw);
  const buckets = isLoadFailed(bucketsRaw) ? undefined : bucketsRaw;
  const items = useItems(user?.uid);
  const [tab, setTab] = useState<(typeof TABS)[number]>('day');
  const [error, setError] = useState<ActionError | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // No success message: the page re-renders from live data, which is the
  // confirmation. A failure toasts under the control's own name ("Save Lists");
  // when the server names a row and field, that row is also marked in place.
  //
  // Returns whether the write landed, because an Add New form must be emptied
  // on success and must NOT be emptied on failure — clearing it after a refused
  // save would throw away what was typed.
  //
  // One request at a time: a second click while one is out is refused, so a
  // double-clicked Save cannot send an Add New row twice. The ref catches a
  // click that lands before Save has re-rendered disabled.
  async function act(label: string, fn: () => Promise<unknown>, okMessage?: string): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (okMessage) pushToast('ok', okMessage);
      return true;
    } catch (err) {
      console.error(err);
      const failure = toActionError(err, label);
      setError(failure);
      toastFailure(err, label);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function rebuild() {
    await api.rebuildRange({ days: PACK_RANGE_DAYS });
  }

  return (
    <Chrome title="Strategize">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`tab${tab === t ? ' is-on' : ''}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      {tab === 'day' && !settings ? <p className="hint">Loading…</p> : null}
      {tab === 'buckets' && loadFailed ? <p className="err">Could not load.</p> : null}
      {tab === 'buckets' && !loadFailed && !(settings && buckets) ? <p className="hint">Loading…</p> : null}
      {tab === 'lists' && loadFailed ? <p className="err">Could not load.</p> : null}
      {tab === 'lists' && !loadFailed && !buckets ? <p className="hint">Loading…</p> : null}
      {tab === 'day' && settings ? (
        <DayForm
          key={dayFormKey(settings)}
          settings={settings}
          busy={busy}
          onSave={(payload) =>
            act('Save Day', async () => {
              await api.saveSettings(payload);
              await rebuild();
            })
          }
          onResetToday={() => act('Respawn', () => api.resetToday(), 'Quests reset. +1 Life')}
          onReroll={() => act('Reroll Stats', () => api.clearLogs())}
        />
      ) : null}
      {tab === 'buckets' && settings && buckets ? (
        <BucketsForm
          settings={settings}
          busy={busy}
          buckets={buckets}
          onSave={(payload) => act('Save Buckets', () => api.saveBuckets(payload))}
          onReorder={(ids) =>
            act('Reorder Buckets', async () => {
              await api.reorderBuckets({ weightedOrderIds: ids });
            })
          }
          onRemove={(id) =>
            act('Remove Bucket', async () => {
              await api.archiveBucket({ id });
              await rebuild();
            })
          }
        />
      ) : null}
      {tab === 'lists' && buckets ? (
        <ListsForm
          busy={busy}
          buckets={listableBuckets(buckets)}
          items={items}
          error={error}
          onSaveAll={(rows) =>
            act('Save Lists', async () => {
              // Validation blocks the write; the server refuses the same thing.
              // Thrown inside act so the stale row mark is cleared with it.
              if (rows.some((r) => (r.cadence as Cadence).kind === 'weekly' && (r.cadence as { days: unknown[] }).days.length === 0)) {
                throw new Error('Pick at least one day to repeat on.');
              }
              await api.saveItems({ rows });
            })
          }
          onReorder={(ids) =>
            act('Reorder Items', async () => {
              await api.reorderItems({ orderedIds: ids });
            })
          }
          onRemove={(id) =>
            act('Remove Item', async () => {
              await api.archiveItem({ id });
            })
          }
        />
      ) : null}
    </Chrome>
  );
}
