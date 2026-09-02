# Backlog

Open work, with what was actually verified in the code. Each entry says the
finding, the proposed shape, and what it costs.

**Verified** = read in the source and confirmed. **Suspected** = plausible from
the code but not proven; prove it before building on it.

Anything touching `functions/` needs a deploy. Deploy those in small batches —
the project has hit per-deploy quota before.

## Suggested order

1. **Appointments rewrite** (B1) — a live data bug that silently eats day time.
2. **Repack scope and cost** (E1–E4) — everything else gets faster underneath.
3. **Personal colour** (B4) and **seeds** (B5) — small, self-contained.
4. **Events redesign** (B2) — the biggest design question; do it with a clear head.
5. **Features** F1–F6, in whatever order suits.

E1–E4 before the features is deliberate: several features add writes, and
adding them on top of the current repack cost multiplies the problem.

---

## Bugs

### B1. Appointments: Start/Stop double-counts, and they never displace anything

Three separate defects, all verified.

**The stopwatch double-counts.** In `stopAppointment`:

```
elapsed = (run.elapsedMinutes || 0) + elapsedSince(run.startedAt, now)   // cumulative
used    = fullCaps - eatFromSections(capsAfterPrevUsed, section, elapsed) // = prevUsed + elapsed
```

`elapsed` is cumulative across runs, but `used` already contains the previous
runs. Stop #1 after 5m → used 5. Start, Stop #2 after 3m → elapsed 8, used
5 + 8 = 13 instead of 8. Pressing Start then Stop with no real time still adds
the whole prior total again. This matches "removes time every time I press STOP
despite not changing the state."

**Appointments never consume section capacity at pack time.** In `packDay`,
appointments are pushed as blocks with `flexible: false`, but nothing subtracts
`durationMinutes` from `caps[slot]` — only bucket items decrement `left`. So an
appointment displaces nothing, and nothing shows in Falling Off. Time is only
ever taken by the (broken) stopwatch path.

**Appointment blocks carry no `slot`.** That is why `todaySectionItems` shows
them in every section, and why `nextSectionMinutes` had to exclude them.

**Proposed shape** — remove the timer entirely, as requested:

- Drop `startAppointment` / `stopAppointment`, `appointmentRuns`,
  `appointmentElapsed`, and the Start/Stop UI. Appointments get Complete / Skip
  like every other item, behind the same tap-to-expand.
- Give appointments a `slot` so they sit in one section.
- At pack time, subtract `durationMinutes` from that section's capacity before
  buckets are placed. That alone makes displaced items fall off correctly.
- `durationMinutes === 0` is a checklist entry: no capacity math, never drops
  (same rule as 0-duration list items).
- Complete deducts the assigned duration and repacks the remaining sections by
  weight, exactly like any other completion. Skip returns the time.
- `sectionExtra` / `sectionUsed` / `eatFromSections` / `usedFromEat` may become
  dead once the stopwatch is gone — check before deleting; `Reset Today` and the
  Quest Log leftover row also read them.

**Migration:** existing day docs hold `appointmentRuns`. Harmless if ignored,
but a repack should stop writing it. No stored appointment field changes.

### B2. Events are unusable across multiple ranges

**Verified:** the Events bucket holds `ranges[]` (`id`, `startDate`, `endDate`),
and Events list items are `scheduled` with a `dueAt`. `itemHitsDate` matches
`item.dueAt === dateKey`. **There is no link between an item and a range.** So
you define ranges in one place and then have to remember those dates while
setting `dueAt` on each item — which is the reported mess.

**Proposed shape:** make an event a first-class named thing and hang items off it.

- Ranges gain a `name`. Either keep them on the Events bucket or promote them to
  an `events/{id}` collection — promoting is cleaner and makes the child
  relationship obvious, but it is a data-model change with a migration.
- Event list items gain `eventId` and pick a date *within* that event's range
  (the date picker clamps to it), so you never retype a range.
- Organize → Lists groups event items under their event name rather than under
  one flat Events bucket.
- **Auto-drop when the whole event has passed:** archive the event and its items
  once `endDate < today`. Needs a decision — see D3.

**This is the largest item here.** It touches the data model, the packer's
`itemHitsDate`, the Lists UI, and the Quest Log outline logic. Worth its own
session, and worth writing the migration down before starting.

### B3. Menu selection still solid — probably already fixed, verify first

The gold wash was removed from `.chrome-btn.is-on` / `.tab.is-on` / pills / day
chips and deployed after this was reported; selection is now a gold edge, gold
letters and a one-shot pulse. **Check against a hard refresh before touching
anything.**

If something still reads as solid, the only remaining `--gold-bg` fill is
`.cal-cell.is-today` on the Quest Log board — that one is marking a calendar
cell, not text, so it is probably wanted.

### B4. The Personal colour picker does nothing

**Verified.** The client sends `personal.color` in the `saveBuckets` payload
(`Edit.tsx`, the personal form's colour input). `saveBuckets` reads only
`morningMinutes`, `breakMinutes` and `eveningMinutes` from `data.personal` — it
**never writes the colour**. The personal bucket is also not among the
`form[data-kind="work"], form[data-kind="weighted"]` rows the client collects,
so it falls through to `kept` untouched.

`packDay` does stamp blocks with `personal?.color`, so the pipeline is fine
downstream — the colour simply never gets saved. Fixing `saveBuckets` to persist
it should be enough; existing days restamp on the next pack.

Small, isolated, needs a functions deploy.

### B5. New accounts need better example seeds

**Verified:** `SEED_BUCKETS` is Work, Events, Home, Errands, plus
`PERSONAL_BUCKET` added in `ensureTenant`. `SEED_ITEMS` is **2 items**
(`Priority work`, `Tidy up`). **No appointments and no event are seeded at all**,
so two of the four concepts are invisible to a new account.

**Proposed:** one or two of each — a couple more list items across different
buckets and cadences, one appointment, one short event with an item in it. Enough
that a new account demonstrates every mechanic on day one. Keep them obviously
generic so they read as examples.

Seeds live in `src/domain/seed.ts` and are written by `ensureTenant`, so this is
a functions deploy. Only affects accounts created after it ships.

---

## Efficiency

The theme: **almost every write repacks 42 days**, and the repack itself is
wasteful. This is the main cost driver.

### E1. `writePackedRange` packs every day twice

**Verified.** It calls `packRange(from, days, ...)` to build `packed`, then loops
`packed` and calls `packDay` **again** for each date. `packed` is used only for
`row.date`. That is 42 redundant `packDay` computations per call.

Fix: use the `packRange` result, or replace it with a plain date list. Pure win,
no behaviour change, no data change.

### E2. 42 sequential reads, then 42 unconditional writes

**Verified.** The loop does `await daysCol.doc(row.date).get()` one at a time,
then `batch.set()` for **every** day whether or not anything changed.

Fix in two parts:
- One `getAll()` for the 42 docs instead of 42 round trips.
- Diff before writing — skip days whose packed output is unchanged. Most edits
  change a handful of days, not 42. This cuts billed writes and stops every save
  waking every `onSnapshot` listener, which is likely a large part of why Quest
  buttons feel slow.

### E3. Repack the days that actually changed

Right now every mutating write repacks this week's Sunday + 42 days. Completing
an appointment affects **one day**.

Fix: a `writePackedDay(uid, date)` for single-day effects, and let callers
declare their scope. A rough map of what each write can touch:

| Write | Real scope |
| --- | --- |
| complete / skip / appointment complete | that one day |
| `startDay`, `startNext`, `endDay`, break | that one day |
| `resetToday` | that one day (already single-day) |
| item add / edit / remove, reorder | days the item's cadence hits, in range |
| bucket hours / days / slots, settings | full range |
| appointment add / edit / remove | that appointment's date |
| event range change | the affected ranges only |

Even a coarse split — single-day vs full-range — removes most of the cost,
because the day-flow buttons in Quest are the ones that feel slow.

### E4. `ensureTenant` re-reads the whole tenant on every call

**Verified.** Called by 10 callables. On the existing-tenant path it runs
`Promise.all([settings.get(), buckets.get()])` **every time** just to backfill
missing buckets, so every callable pays 1 + 1 + N-buckets reads before doing any
work.

Fix: only run the backfill where it belongs (`bootstrap`), or gate it behind a
cheap marker on the tenant doc.

### E5. Every repack writes a `rebuild` log row

**Verified**, last line of `writePackedRange`. Since nearly every write repacks,
Stats fills with "Quest Log Packed" rows — which is most of what Reroll Stats
exists to clear. Consider logging only explicit rebuilds, or dropping the row
entirely once E3 lands.

### E6. Also open

- `deleteAllDocs` chunking is done; `wipeAccount` uses it.
- The `resetBucket` callable is still deployed but unreachable from the app —
  delete it on the next functions deploy.
- Firebase is 68% of the 785 kB first load. `firebase/firestore/lite` is much
  smaller but has no `onSnapshot`, which every hook in `src/services/live.ts`
  needs. That is a rearchitecture to polling, not a cleanup — only if load time
  becomes a real complaint.

---

## Features

### F1. One Save for the whole Organize page

Carried over, and the request now extends past Lists to **every Organize tab**.

**Do not implement as a loop.** Every `upsertItem` runs a full repack, so saving
N rows with N calls fires N repacks — the same duplicate-repack problem already
removed from four callables.

Shape, mirroring `saveBuckets`: a `saveItems` callable taking `rows[]`,
validating each the way `upsertItem` does (`itemFitsBucket`, and the Work section
pick when `workShowsItemSlot`), reporting **which row** failed, then one batch and
one repack. Same for appointments.

Not a blocker: collapsed groups are hidden with the `hidden` attribute but are
still in the DOM and still readable — the Buckets page Save already does exactly
this.

Worth doing **after E3**, so page Save repacks a scoped range rather than 42 days.

### F2. Count Personal hours as day hours (toggle)

A setting on Organize → Day. When on:

- Morning Routine and Evening Routine become completable / skippable items rather
  than silent pauses.
- Their minutes count against the day's capacity and against weekly capacity.

**Care needed:** `assignableWeekMinutes` is `dayMinutes × 7` and deliberately
excludes Personal; the week-budget cap check on Buckets Save depends on that. The
toggle changes that arithmetic, so `weekBudgetSummary`, `assignedWeekMinutes` and
the Buckets cap check all need to read the flag. Get the budget maths right
before touching the UI.

### F3. Appointments get list-item features

After B1 lands (not before — B1 changes what an appointment *is*). Bring them
closer to list items: repeat/cadence, and whatever else transfers. Once
appointments have a cadence they stop being purely date-keyed, which affects
`itemHitsDate` and the Quest Log chips.

### F4. Multi-section toggle for every bucket

Work already has it — `slots[]`, `bucketSlots()`, `parseBucketSlots()`,
`workShowsItemSlot()`, `itemWorkSlot()`. Generalising is mostly removing the
"work only" guards:

- `BucketFields` renders the checkbox group only when `kind === 'work'`.
- `upsertItem` validates a per-item slot only for the Work bucket.
- `packDay` calls `itemWorkSlot` only for the work bucket.

The packer already iterates `bucketSlots(b)` for every bucket, so the hard part
is largely done. Decide whether every multi-section bucket's *items* pick a
section, or only Work's.

### F5. Day-end summary after Hearth

Show the day's result on screen: completed vs skipped, a level-up style progress
bar, and a message with some humour.

The data is already there — day `blocks` carry `status`, and the log has one row
per complete/skip. Prefer counting from the day's blocks so it works offline and
does not depend on log retention (**Reroll Stats erases the log**, so a summary
built from logs would vanish).

### F6. Stats history over time

The bigger version of F5 on the Stats page — completion rate across days with a
larger progress bar.

**Depends on a decision:** logs are the only history, and Reroll Stats erases
them. Either accept that rerolling resets history, or keep aggregate day totals
somewhere Reroll does not touch. Decide before building (see D4).

---

## Decisions pending

### D1. List item titles in caps

Applied to Quest's day list and the falling-off rows, deliberately **not** to
Stats rows (event sentences, not titles) or the Organize inputs (uppercasing text
as you type it is disorienting). Revert by deleting the marked TRIAL block at the
end of `global.css`.

### D2. Group Stats rows under day headers

Every row repeats its date. Grouping under `Sat Aug 29` headers, like the Quest
Log list day blocks, would make 14 days much faster to scan.

### D3. What "auto drop" means for a passed event

Archive the event and its items, or delete them? Archiving keeps Stats history
intact and is reversible; deleting is truly tidy but loses the record. Also decide
*when* it runs — on read, on the next pack, or on a schedule.

### D4. Does Reroll Stats erase history that F6 needs?

See F6. If Stats grows a long-term progress view, erasing the log erases the
progress. Either that is intended ("reroll" = start over), or day aggregates need
to live outside `logs/`.

### D5. An affordance on tap-to-expand items?

Quest's item cards open on tap with no chevron, matching the preference for no
menu indicator. If they prove hard to discover, add a faint one.

### D6. Guide has no card for Stats or Organize

The Guide covers every bucket plus Quest, Quest Log and the Lists tab. Stats and
Organize itself are missing, though the docs describe the Guide as a tour of what
each bucket and page is for.
