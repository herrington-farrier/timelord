# Data model

Solo tenant: `tenants/{uid}` where uid is the Google Auth uid. Clients read; only callables write. Google sign-in is invite-only (`src/domain/allowlist.ts`). Allowed users get an `allowlisted` auth claim. Firestore reads require that claim or an allowlisted email. Keep the email list in `firestore.rules` in sync when you add someone. First signup writes settings, seed buckets/items, then packs 6 weeks.

## config/allowlist

Function-only, and unreadable by clients — but the security rules `get()` it,
and rules bypass rules. `emails[]` is the live invite list: adding someone is
one edit here in the console, with no code change and no deploy.

`ALLOWED_EMAILS` in `src/domain/allowlist.ts` is the seed and the floor. It is
mirrored in `firestore.rules` deliberately, so a missing or mangled document
cannot lock the owner out. Everyone else is added to the document only.

The rules check the seed **first**, so the owners cost no extra reads; only an
invited non-owner pays the document lookup.

Every mutating callable reads this same list through `requireUid`. It once
checked only `ALLOWED_EMAILS`, so an account invited from the console could sign
in and read its own data but was refused on every write — the console edit that
is supposed to need no deploy only ever reached two thirds of the app. The
`allowlisted` claim is not accepted in place of the list, so removing an address
revokes writes once the cache expires.

## accessLogs/{id}

Function-only. `type` is `signup` (first allowed tenant) or `denied`, plus `email`, `uid`, `at`. Watch this in the Firebase console to see new friends and blocked attempts.

## settings/current

- `dayMinutes` (productive time; split into three packer sections), `dayStartMinutes` (unused by the packer), `transitionMinutes`, `timezone`
- `morningMinutes`, `breakMinutes`, `eveningMinutes` (Personal pause lengths; not in weekly capacity)
- `timerSound`, `timerVibrate` (section timers)
- `personalCountsAsDay` — when true, Personal minutes come out of the day and its sections rather than sitting beside them. The routines are then **static** on Quest and on the board: they take their time and are neither completed nor skipped
- `sectionSplit` — `{ morning, midday, evening }`, the day's own division. Day Length stays the truth: a split that does not add back to it is stale and an even split is used instead
- audit stamps

## buckets/{id}

- `kind`: `personal | work | weighted | event`
- `name`, `weight`, `hoursMode` (`week` | `day`, default `week`), `hoursMinutes` (the hours field)
- `weeklyMinutes`: derived week total (`hoursMinutes` in week-mode; `hoursMinutes ×` checked days in day-mode)
- `days[]`, `slot`, optional `slots[]` (Work: the sections it occupies; `slot` is the first of those. Weighted buckets keep a single `slot`.), `color`, `archived`
- Events: `ranges[]` (`id`, `name`, `startDate`, `endDate`, inclusive; start === end is a 1-day block). A range whose `endDate` has passed is deleted with its items on the next repack. Legacy `startDate` / `endDate` on the bucket still count as one range until the next Save. No slot, no week hours.
- Work id is `work` (weight 1). Personal id is `personal`. Events id is `events`. Morning Routine, Break, and Evening Routine durations live on settings. New accounts also get Home and Errands.

## items/{id}

- `bucketId`, `title`, `type` (`recurring` | `scheduled`), `weight`, `durationMinutes` (0 is a reminder; never dropped). Timed duration cannot exceed the bucket’s daily hours.
- `cadence` object, optional `dueAt`, `archived`. `everyNDays` may include `startDate`; no hits before it.
- `expiresAt` — recurring only, inclusive. No hits after it; the last occurrence is stamped `finalOccurrence` on its block so every screen can mark it.
- Work items may have `slot` when the Work bucket has more than one section. Each item packs in that one section.
- Events items are always `scheduled`, carry `eventId`, and their `dueAt` must fall inside that event's range. Cadence is unused. Items with no matching event show under Unassigned in Lists.

## Appointments

Not a collection. Appointments are items in the locked `appointments` bucket:
`type` is `scheduled` (one date in `dueAt`) or `recurring` (a cadence, for a standing appointment), `slots[]` are the
sections it spans (`slot` is the first of those), and `apptTime` is a display-only label (`14:30`, shown as `2:30 PM`).
They have no per-appointment colour — the bucket's colour applies.

An appointment costs the day its whole duration: its own section first, then
spilling into the sections after it. Skipping one cancels it and hands those
hours back. 0-duration appointments are checklist entries and cost nothing.

## days/{yyyy-mm-dd}

- `blocks[]` (each block may have `slot`), `dropped[]`, `droppedBuckets[]`, `startedAt`, `endedAt`, `packedAt`
- `section` (`morning` | `midday` | `evening` | `event`), `sectionStartedAt`, `sectionRemainingMinutes`, `pausedAt`
- `sectionExtra`, `sectionUsed` (appointment eat). Pack rebuilds 6 weeks from this week’s Sunday and clears both. Start Next Chapter does not write leftover extra.
- `eventStartedAt` (unused on event days; no stopwatch)
- Pack restamps `color` from current buckets and appointments. Started or ended days keep Complete / Skip.

## score/current

- `total` — the running score, never below zero. `+1` per completed item, `-1`
  per skipped, `+2` for completing one that had fallen off. Days never started
  score nothing; event days and days with appointments forgive what fell off.
- Written only when a day ends, unwound by Respawn, zeroed by Reroll Stats.

## days/{yyyy-mm-dd} — `scoreDelta`

What that day added to the total. Stored so Respawn can take back exactly its
contribution rather than recompute it after clearing the day.

## logs/{id}

Append-only: `type`, `at`, `date`, `itemId`, `bucketId`, `minutes`, optional `title` and `section`. Never overwritten — but **Reroll Stats** (`clearLogs`) erases the whole collection, and that is irreversible. `rebuild` displays as Quest Log Packed (gold). Complete is green (`Quest Completed: …`); skip is red (`Quest Failed: …`). Every Stats row's text takes its row colour. Start Next Chapter writes one `skip` row per leftover item, then `start_next`.

## skipPushes/{id}

- `itemId`, `fromDate`, `toDate`
