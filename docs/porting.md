# Porting Timelord

For whoever — human or AI — forks this to rewrite the front end or fold it into
a larger product. It exists because the valuable part of this app is not the
code, it is a set of rules that took real effort to get right and that look
arbitrary until you break one.

Read this before touching `src/domain/`.

---

## 1. What the app actually is

A **day packer**, not a calendar and not a to-do list. The difference matters:

- There are **no clocks**. Nothing is scheduled at a time. A day is three
  sections — morning, midday, evening — and things go *in* a section, not *at*
  a time. Every attempt to reintroduce times has been deliberately refused.
- Buckets have an **hours cap**, and items compete only for their own bucket's
  time. A bucket never expands into another's, and unused time is not carried
  forward.
- What does not fit is **falling off** — shown, not hidden, so the day tells the
  truth about being overbooked instead of quietly dropping work.

If a port keeps only one idea, keep that one: **the app's job is to tell you
what will not fit, before the day starts.**

## 2. The layer that must survive

`src/domain/` — ~1,860 lines across 18 modules, **no React, no Firebase, no I/O**.
Verified: nothing in it imports a UI or backend package. It is imported by both
the client and the Cloud Functions (`functions/src/index.ts` imports 13 domain
modules), which is why the packer cannot drift between them.

**Port this directory as-is.** Rewrite everything around it.

| Module | Holds |
| --- | --- |
| `packDay` | the packer: what lands in a day, and what falls off |
| `packWeek` | packs a date range |
| `sections` | section capacity, spans, and the reserved-time rules |
| `budget` | bucket hours, weekly caps, load colours |
| `cadence` | when a recurring item hits a date |
| `skip` | leftovers, auto-skip, and skip-push (renewal) |
| `score` | the XP score |
| `events`, `seed`, `order`, `today`, `timer`, `duration`, `log`, `etas` | supporting rules |
| `types` | every shape, plus the ids (`WORK_ID`, `EVENTS_ID`, …) |

The 37 test files are the specification. Port them too; if a rewrite passes
them, the behaviour survived.

## 3. Invariants that look arbitrary and are not

Each of these was a real bug. Breaking one reintroduces it.

**Appointment time is taken when the day is packed, not when it is completed.**
Completing an appointment changes nothing. This is not an oversight: falling-off
must be correct *in advance*, and the packer runs 42 days ahead where nothing
can be "completed" yet. Deferring the deduction would make every future day
optimistic fiction.

**An appointment costs the day its whole duration, spilling forward.** A 2h
appointment in a section with 10m free takes those 10m and 1h50m from the
sections after it. `capsAfterLoad` is the only definition; the packer *and* both
section timers read it. It used to live inline in the packer, and the countdown
consequently handed back time the day did not have.

**Skipping an appointment refunds it; completing does not.** Booking costs the
time, cancelling returns it, completing is a receipt.

**Auto-skip spares an appointment still spanning into a later section.** Leaving
midday must not skip a midday+evening appointment you are sitting in.

**Appointments and events are never skip-pushed.** A missed appointment is
missed, not deferred to tomorrow. Ordinary scheduled items *do* renew on their
bucket's next day.

**0-duration items are reminders and never drop.** They cost no capacity and
must survive any "does it fit" check.

**`durationInputs` distinguishes `undefined` from `0`.** Using `x || 30` turns a
saved 0-duration reminder into a 30-minute task, silently. It has happened.

**Days never started score nothing.** A day off is not a failure.

**Event days and days with appointments forgive what fell off.** The schedule
squeezed it out; adherence could not have saved it.

## 4. Data model contract

Firestore, one tenant per user at `tenants/{uid}`. **Clients read; only callables
write.** Keep that split or re-derive an equivalent — the security rules depend
on it.

| Collection | Notes |
| --- | --- |
| `settings/current` | day length, personal minutes, `personalCountsAsDay` |
| `buckets/{id}` | includes the four locked ones: `personal`, `work`, `events`, `appointments` |
| `items/{id}` | **everything is an item**: tasks, appointments, event entries |
| `days/{yyyy-mm-dd}` | packed output plus run state and `scoreDelta` |
| `skipPushes/{id}` | a scheduled item's renewal |
| `logs/{id}` | append-only history; Reroll Stats erases it |
| `score/current` | the running total |

**Appointments and events are not separate collections.** They are items in
locked buckets. Appointments *used* to be their own collection with a stopwatch;
that design produced three separate bugs and was removed. Do not restore it.

The four locked buckets cannot be deleted or renamed, and `bucketsToBackfill`
restores any that go missing. `TENANT_SCHEMA` in `functions/src/tenant.ts` gates
one-time migrations — bump it to re-run backfill for every tenant once.

## 5. Cost model — the traps are all here

This app is meant to be cheap. The expensive mistakes, all of which were made
and fixed:

- **Do not repack on a loop.** Every write that changes the schedule repacks 42
  days. `saveItems` exists specifically so a page save is one repack rather than
  twenty. Any new "save many" path must batch.
- **Diff before writing days.** Rewriting unchanged days bills writes *and* wakes
  every `onSnapshot` listener, which is what made the UI feel slow.
  `unchangedDay` compares a **key-sorted** serialisation — a plain
  `JSON.stringify` reports every day as changed, silently disabling the whole
  optimisation.
- **Scope the repack when you can.** Date-keyed edits touch one or two days.
  `datesForItemEdit` returns `null` for anything on a cadence, because a cadence
  can land anywhere. Returning `[]` instead of `null` means *no repack at all* —
  that bug shipped once.
- **Firestore batches cap at 500 writes.** `deleteAllDocs` chunks; logs cross 500
  faster than you expect.
- **`ensureTenant` must stay cheap.** It runs on nearly every callable; the
  schema marker keeps the steady state at one read.

## 6. What is disposable

The whole front end. `src/pages/`, `src/components/`, `src/styles/global.css`
are one opinionated take — dark navy and gold, a quest theme, tap-to-expand
cards, no toasts. None of it is load-bearing. Rewrite freely.

Two front-end lessons worth carrying anyway, both of which cost hours here:

- **The `background` shorthand resets `background-clip`.** On any control using
  gradient text, `background: …` in a hover rule turns the text into a solid
  block, and touch devices keep `:hover` after a tap so it stays that way.
  `src/test/buttonStyles.test.ts` guards it by parsing the stylesheet — jsdom
  never loads CSS, so no rendering test can.
- **`hidden` loses to an author `display` rule.** `[hidden] { display: none
  !important }` is in the stylesheet for a reason.
- **A code-split app on Firebase Hosting needs an error boundary.** The catch-all
  rewrite serves `index.html` for a missing chunk, so a stale chunk arrives as
  HTML with a 200 and fails to parse as a module. Without a boundary the routed
  tree unmounts and the page goes blank. `ChunkBoundary` catches it and reloads
  once. Any rewrite of the front end reintroduces this the moment it lazy-loads
  a route.

Naming is themed and shallow: Quest / Quest Log / Strategize / Stats are the
routes `/`, `/calendar`, `/edit`, `/log`. `docs/logic-map.md` has the mapping.
Rename freely; the routes never changed.

## 7. Integrating into something larger

**Keep:** `src/domain/` and its tests, the Firestore shapes, the write-through-
callables rule.

**Expect to replace:** the auth gate (invite-only allowlist, with hardcoded
emails in `src/domain/allowlist.ts` *and* `firestore.rules` that must be kept in
sync), and the whole UI.

**Fix the timezone before anything else.** `America/Chicago` is hardcoded in
**nine places across five files**, including `todayKey()` in `src/shared/dates.ts`,
`functions/src/index.ts`, `functions/src/tenant.ts`, and `DEFAULT_SETTINGS`.

The trap: `settings.timezone` **exists as a stored field and is never read**.
`todayKey()` takes a timezone parameter, but every caller invokes it with no
argument, so the default always wins. Anyone porting will reasonably assume the
setting works. It does not. Every date key in the system — every `days/{date}`
document id, every `dueAt`, every cadence match — derives from that one
function, so this is the single most invasive thing to change later and the
cheapest to change first.

**Watch for:** anything that recomputes a rule the domain already owns. Every
serious bug in this project's history came from the same shape — a rule
implemented in two places, drifting apart. The section timers not knowing about
appointment spill, the packer and the client both repacking, two copies of item
validation. If you find yourself writing the same rule twice, put it in
`src/domain/` and have both callers read it.

## 8. Where the rest is written down

- `docs/logic-map.md` — behaviour, screen by screen. The closest thing to a spec.
- `docs/data-model.md` — every field.
- `docs/todo.md` — what was built and why, including decisions and their reasons.
- `docs/verify.md` — the manual check list; a fast way to see what the app does.
