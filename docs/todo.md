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

### B1. Appointments as a locked bucket — **done**

Shipped. Appointments are items in the `appointments` bucket, packed ahead of
every other bucket in their section, with an `apptTime` display label. The
stopwatch, the collection, the `Appointment` type, `appointmentRuns` and five
callables are gone.

`capsAfterLoad` / `appointmentLoad` in `sections.ts` are the single definition of
"an appointment costs the day its whole duration, spilling forward". The packer
and both section timers read it — the countdown not knowing about the spill was
a real bug precisely because that rule had lived inline in `packDay`.

Two bugs found on the way: `ItemFields` used `splitMinutes(x || 30)`, so a saved
0-duration reminder became 30m when edited; and `skipPushDate` deferred any
scheduled item, so a cancelled appointment (or event) reappeared the next day.

Still open from this area: **F3** is now mostly a question of which list-item
features make sense for an appointment, not new machinery.

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
- **Auto-drop when the whole event has passed:** **decided — delete outright**
  once `endDate < today`. No history is kept for events, so archiving would only
  accumulate dead rows.

**This is the largest item here.** It touches the data model, the packer's
`itemHitsDate`, the Lists UI, and the Quest Log outline logic. Worth its own
session, and worth writing the migration down before starting.

### B3. Controls went solid gold on press — **fixed**

Confirmed fixed on device. Cause was `background-clip`, not the gradient.

`background-clip: text` paints the ink into the letters; the `background`
shorthand resets it to `border-box`, and `button:hover:not(:disabled)` (0,2,1)
is more specific than the rule declaring the clip (0,1,0). So hover dropped the
clip and the gradient filled the whole element — and on touch, `:hover` sticks
after a tap, so it stayed. Only controls using `background-clip: text` were
affected, which is why the menu items behaved and the action buttons did not.

Every control rule now uses `background-color`, never the shorthand.
`src/test/buttonStyles.test.ts` parses the stylesheet and fails on a shorthand
in any control rule — jsdom never loads CSS, so no rendering test could catch
this class of bug.

**Keep in mind when styling controls:** the `background` shorthand also resets
`background-clip`, `background-image`, `background-position` and the rest. On
this codebase that silently breaks gradient text.

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

### B6. Respawn already resets the day — but not the log

**Verified.** `resetToday` already sets `startedAt`, `endedAt`, `section`,
`sectionStartedAt`, `sectionRemainingMinutes`, `pausedAt`, `eventStartedAt` and
`appointmentRuns` to null, clears `sectionExtra` / `sectionUsed`, and repacks
with `packDay(asPackInput(loaded, date))` — no `previous` blocks, so every
complete / skip status is dropped too. Timestamps and progress are both already
wiped. Nothing to add there.

**The real gap:** it does not touch `logs/`. Today's `complete` and `skip` rows
survive a Respawn. So anything counting progress from the log would still show
the pre-Respawn result, while the day itself reads as untouched.

**Decided:** the day summary (F5) counts from the day's `blocks`, not the log.
That keeps Respawn correct for free, and survives Reroll Stats erasing the log.

**Still to decide:** whether Respawn should also delete today's `complete` /
`skip` log rows so the Stats history agrees with the day. Deleting is the simple,
consistent answer for an app that wants no long-term history. See D4.

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
| appointment add / edit / remove | that appointment's date (after B1: same as any item) |
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

**Largely absorbed by B1.** Once appointments are items in a bucket they inherit
cadence, weight and section handling directly. What remains is deciding which of
those actually make sense for an appointment — a repeating dentist appointment is
reasonable, a 0-duration repeating checklist entry probably is too. Once they
carry a cadence they stop being purely date-keyed, which affects `itemHitsDate`
and the Quest Log chips.

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

### D3. Reroll Stats during an active day — **decided: block it**

Rerolling mid-day would erase the day's own completes and skips while the day is
still running, leaving the progress bar and the day disagreeing. Refuse it
server-side when today has `startedAt` and no `endedAt`, and disable the button
in Organize with a reason. Server-side matters: the client check alone is a
suggestion.

### D4. Should Respawn also delete today's log rows?

`resetToday` wipes the day but not `logs/` (B6). The day summary counts from
blocks, so the on-screen bar is already correct — but the Stats history would
still hold the pre-Respawn completes and skips.

Deleting today's `complete` / `skip` rows on Respawn makes the two agree and
suits an app that keeps no long-term history. Against: it makes an "append-only"
collection lose rows in a second place. Cheap either way; decide when F6 is built.

### D5. An affordance on tap-to-expand items?

Quest's item cards open on tap with no chevron, matching the preference for no
menu indicator. If they prove hard to discover, add a faint one.

### D6. Guide has no card for Stats or Organize

The Guide covers every bucket plus Quest, Quest Log and the Lists tab. Stats and
Organize itself are missing, though the docs describe the Guide as a tour of what
each bucket and page is for.

### Settled

- **D7 — one appointment colour.** Per-appointment colour is dropped; the bucket
  colour applies. Recorded in B1.
- **D8 — no Appointments tab.** The bucket lives in Organize → Buckets, pinned
  first; its items sit under Lists. Recorded in B1.
- **Events auto-drop** deletes outright; no history is kept. Recorded in B2.
