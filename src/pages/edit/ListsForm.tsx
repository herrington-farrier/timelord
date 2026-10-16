import { useMemo, useState } from 'react';

import { CollapsibleBucket } from '../../components/CollapsibleBucket';
import { SortableList } from '../../components/SortableList';
import { eventRangeForItem, eventRangeName, eventRanges } from '../../domain/events';
import { isEventsBucket } from '../../domain/predicates';
import type { Bucket, ListItem } from '../../domain/types';
import type { ActionError } from '../../shared/actionError';
import { ItemFields } from './ItemFields';
import { itemPayloadFromForm } from './formRead';

export function ListsForm({
  busy,
  buckets,
  items,
  error,
  onSaveAll,
  onReorder,
  onRemove,
}: {
  busy: boolean;
  buckets: Bucket[];
  items: ListItem[];
  error: ActionError | null;
  onSaveAll: (rows: Record<string, unknown>[]) => Promise<boolean>;
  onReorder: (ids: string[]) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  // Same trap as the Buckets tab: a saved item's title stays in Add New, and
  // the next Save writes it again as a second item.
  const [addKey, setAddKey] = useState(0);
  const grouped = useMemo(() => {
    const map: Record<string, ListItem[]> = {};
    for (const it of items) {
      if (!map[it.bucketId]) map[it.bucketId] = [];
      map[it.bucketId].push(it);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.weight - b.weight);
    return map;
  }, [items]);

  return (
    <div className="edit-page">
      <div className="edit-card add-card">
        <h3 className="group-h">Add New</h3>
        <ItemFields key={addKey} buckets={buckets} error={error} />
      </div>
      {buckets.map((b) => {
        const rows = grouped[b.id] || [];
        if (!rows.length) return null;
        const ids = rows.map((r) => r.id);
        // Events items are grouped under the event they belong to, so you read
        // "Conference · 3" rather than one flat pile keyed by remembered dates.
        if (isEventsBucket(b)) {
          const ranges = eventRanges(b);
          const byEvent = ranges.map((r) => ({
            range: r,
            rows: rows.filter((row) => eventRangeForItem(ranges, row)?.id === r.id),
          }));
          const orphans = rows.filter((row) => !eventRangeForItem(ranges, row));
          return (
            <div key={b.id}>
              {byEvent.map(({ range, rows: eventRows }) => (
                <CollapsibleBucket
                  key={range.id}
                  title={eventRangeName(range)}
                  hours={`${range.startDate} to ${range.endDate} · ${eventRows.length}`}
                  color={b.color}
                >
                  {eventRows.map((row) => (
                    <div key={row.id} className="edit-card" style={{ ['--bcolor' as string]: `#${b.color}` }}>
                      <ItemFields buckets={buckets} item={row} error={error} />
                      <div className="edit-acts">
                        <button type="button" className="btn--red" onClick={() => onRemove(row.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {!eventRows.length ? <p className="hint">Nothing scheduled for this event yet.</p> : null}
                </CollapsibleBucket>
              ))}
              {orphans.length ? (
                <CollapsibleBucket title="Unassigned" hours={String(orphans.length)} color={b.color}>
                  {orphans.map((row) => (
                    <div key={row.id} className="edit-card" style={{ ['--bcolor' as string]: `#${b.color}` }}>
                      <ItemFields buckets={buckets} item={row} error={error} />
                      <div className="edit-acts">
                        <button type="button" className="btn--red" onClick={() => onRemove(row.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </CollapsibleBucket>
              ) : null}
            </div>
          );
        }
        return (
          <CollapsibleBucket key={b.id} title={b.name} hours={String(rows.length)} color={b.color}>
            <SortableList ids={ids} onReorder={(next) => onReorder(next)}>
              {(id) => {
                const row = rows.find((r) => r.id === id);
                if (!row) return null;
                return (
                  <div className="edit-card" style={{ ['--bcolor' as string]: `#${b.color}` }}>
                    <ItemFields buckets={buckets} item={row} error={error} />
                    <div className="edit-acts">
                      <button type="button" className="btn--red" onClick={() => onRemove(row.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              }}
            </SortableList>
          </CollapsibleBucket>
        );
      })}
      <div className="page-save">
        <button
          type="button"
          className="btn--gold"
          disabled={busy}
          onClick={async (e) => {
            const root = e.currentTarget.closest('.edit-page');
            if (!(root instanceof HTMLElement)) return;
            // Collapsed groups are hidden, not removed, so their fields are
            // still here to read.
            const rows = [...root.querySelectorAll<HTMLFormElement>('form[data-kind="item"]')]
              .map((form) => itemPayloadFromForm(form, buckets))
              .filter((row): row is Record<string, unknown> => row !== null);
            const added = rows.some((r) => !r.id);
            if ((await onSaveAll(rows)) && added) setAddKey((k) => k + 1);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
