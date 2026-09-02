# To do

Open work, deferred deliberately. Each entry says what it is, why it was put off,
and enough detail to pick it up cold.

## Functionality

### One Save for the Lists tab

Lists still saves row by row. Buckets has a single page Save and it reads much
cleaner — do the same here.

**Why it is not just a loop.** Every `upsertItem` call runs
`writePackedRange(uid, todayKey(), PACK_RANGE_DAYS)` on the server, which rebuilds
42 day documents. Saving N rows by calling `upsertItem` N times would fire N full
repacks. That is the same duplicate-repack problem already removed from
`upsertItem` / `reorderItems` / `archiveItem` / `reorderBuckets`, so do not
reintroduce it from the client.

**Shape to build**, mirroring `saveBuckets`:

- New callable `saveItems` in `functions/src/index.ts` taking `rows[]`.
- Validate each row the way `upsertItem` does today: `itemFitsBucket` for duration
  against the bucket's daily hours (0-duration reminders exempt, Events items
  exempt), and the Work section pick when `workShowsItemSlot(bucket)` is true.
- Report which row failed, not just that something did — the current single-row
  error message has a row to point at; a batch one does not.
- One Firestore batch, then a single `writePackedRange` at the end.
- Client: `ListsForm` gathers every row form plus Add New into one payload and
  posts once, like `BucketsForm` does.

**Not a blocker:** collapsed bucket groups. Their fields are hidden with the
`hidden` attribute but are still in the DOM and still queryable — the Buckets page
Save already reads collapsed bucket forms exactly this way.

Needs a functions deploy.

## Server and cost

### Delete the `resetBucket` callable

The bucket Reset button and its client binding are gone, but the callable is still
deployed and still costs a Cloud Run service. Remove it from
`functions/src/index.ts` on the next functions deploy.

### Batch the reads in `writePackedRange`

It walks 42 days with `await daysCol.doc(row.date).get()` one at a time. A single
`getAll()` would cut most of the latency on every save. Functions change, so it
needs a deploy.

### Firebase is 68% of the initial download

`firebase` is 532 kB raw / 159 kB gzip of a 785 kB first load.
`firebase/firestore/lite` is far smaller but has no `onSnapshot`, which every hook
in `src/services/live.ts` depends on. That is a rearchitecture to polling, not a
cleanup — only worth it if load time becomes a real complaint.

## Decisions pending

### List item titles in caps?

Bucket names are tracked caps now. Item titles were deliberately left in normal
case: they are free text, so `Call Dr. Reyes` would become `CALL DR. REYES`,
losing the casing and getting harder to scan. The rule the styling follows is
chrome shouts, content does not. One line to change if that call turns out wrong.

### Group Log rows under day headers

Every Log row repeats its own date. Grouping under `Sat Aug 29` headers, the way
the Calendar list day blocks work, would make 14 days much faster to scan.

### An affordance on tap-to-expand items?

Today's item cards open on tap to reveal Complete / Skip, with no chevron or hint,
matching the preference for no menu indicator. If they turn out to be too subtle
to discover, add a faint one.
