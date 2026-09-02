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

### B2. Events redesign — **done**

Events are named, items belong to an event, and a passed event deletes itself.

Kept the ranges on the Events bucket rather than promoting them to their own
collection. Ranges already carry stable ids, so an `eventId` on the item is the
whole relationship — a new collection would have bought nothing for an app that
keeps no event history, and cost a migration.

- `EventRange` gains `name`; `ListItem` gains `eventId`.
- An event item picks its **event** first, and the date input is then clamped to
  that event's range with `min`/`max`. `upsertItem` re-checks the date server-side
  and names the range in the error, since the client bound is only a hint.
- Strategize → Lists groups event items under their event, with the dates on the
  group header, so nothing has to be remembered. Items whose event no longer
  exists collect under **Unassigned** rather than disappearing.
- `eventRangeForItem` matches by id and falls back to the range the date sits in,
  so items saved before events had ids still land in the right group with no
  migration step.
- `pruneExpiredEvents` deletes a range and its items once `endDate` is past. It
  runs off tenant data a repack has already loaded and writes only when there is
  something to remove, so the common case costs nothing.

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

### B4. Personal colour — **done, and the earlier diagnosis was wrong**

The backlog said `saveBuckets` never wrote `personal.color`. It does — that was
read from the first part of the function only. The colour was being saved and
`packDay` was stamping personal blocks with it correctly.

The actual bug was in `BreakControl`: it rendered `<div className="item">` with
no `--bcolor`, so it fell back to gold. Break is the **only** Personal block Quest
shows — `todaySectionItems` filters out Morning and Evening Routine — so the
Personal colour appeared nowhere on the page. Fixed and covered by a test.

### B5. Example seeds — **done**

Seeds are date-aware now: `seedItems(today)` and `seedEventRanges(today)` build
examples relative to the account's creation date, so they are live rather than
stale. A new account gets one or two of each thing — a dated appointment, two
Work items on different cadences, a timed home item, a **0-duration reminder**, a
weekly errand, and an event a fortnight out with an item inside its range.

The previously seeded appointment had `dueAt: ''` and so could never pack; it was
invisible outside Lists.

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

### E1–E5. Repack cost — **done**

`writePackedRange` used to: build a 42-day result with `packRange`, then loop and
call `packDay` **again** per date using only the date from the first pass; read
the 42 day docs one at a time; and write all 42 whether or not anything changed.

Now it packs each day once, reads all 42 in a single `getAll`, and writes only
the days whose content actually differs. The diff ignores `packedAt` and the
audit stamps, and uses a key-sorted serialiser — a plain `JSON.stringify` would
have reported every day as changed, because key order is not stable between what
Firestore returns and what we build, and the whole optimisation would have been
silently dead.

Skipping unchanged days is the part that should be felt in Quest: every save used
to wake every `onSnapshot` listener for all 42 documents.

**Scoped repacks (E3).** The single-day actions never called `writePackedRange`
at all, so the win there was smaller than the backlog assumed. The real one is
date-keyed items: `upsertItem` and `archiveItem` now repack only the dates an
appointment or event entry touches — the old `dueAt` and the new one — instead of
six weeks. Everything else runs on a cadence and genuinely can land anywhere in
the range, so it still rebuilds the range.

**`ensureTenant` (E4)** read settings and every bucket on all eight of its callers
just to find nothing to backfill. A `schema` marker on the tenant doc — which was
already being read — means the steady state is one read and out. Bump
`TENANT_SCHEMA` to make every tenant re-run the backfill once.

**Rebuild log rows (E5)** are gone. Since nearly every write repacked, Stats
filled with "Quest Log Packed"; with no pack button left, the row recorded
nothing a person did. `formatLogEvent` still renders existing rows.

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

### F1. One Save for Strategize — **done**

All three tabs now save as a page. `saveItems` takes every row, validates the
lot, writes one batch and repacks once — deliberately not a loop over the old
`upsertItem`, which ran a full repack per row.

`buildItemPayload` holds the validation so the rules cannot drift between paths,
and errors name the row (`Tidy up: pick at least one section.`) because "pick a
section" is useless when a page Save covers twenty of them. Nothing is written
until every row validates, so a bad row cannot leave the page half saved.

The repack is scoped when every row is date-keyed; one cadence item in the batch
puts it back to the full range, since a cadence can land anywhere.

Row Save buttons are gone; Remove stays, being per-row and immediate.
`upsertItem` was left with no caller and has been deleted, client binding and
deployed function both.

### F2. Count Personal hours as day hours (toggle)

A setting on Strategize → Day. When on:

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
Stats rows (event sentences, not titles) or the Strategize inputs (uppercasing text
as you type it is disorienting). Revert by deleting the marked TRIAL block at the
end of `global.css`.

### D2. Group Stats rows under day headers

Every row repeats its date. Grouping under `Sat Aug 29` headers, like the Quest
Log list day blocks, would make 14 days much faster to scan.

### D3. Reroll Stats during an active day — **done**

`clearLogs` refuses when today has `startedAt` and no `endedAt`. Enforced on the
server, since a client-side check is a suggestion. The message surfaces inline
now that toasts are gone.

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

### D6. Guide has no card for Stats or Strategize

The Guide covers every bucket plus Quest, Quest Log and the Lists tab. Stats and
Strategize itself are missing, though the docs describe the Guide as a tour of what
each bucket and page is for.

### Settled

- **D7 — one appointment colour.** Per-appointment colour is dropped; the bucket
  colour applies. Recorded in B1.
- **D8 — no Appointments tab.** The bucket lives in Strategize → Buckets, pinned
  first; its items sit under Lists. Recorded in B1.
- **Events auto-drop** deletes outright; no history is kept. Recorded in B2.
