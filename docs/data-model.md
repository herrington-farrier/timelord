# Data model

Solo tenant: `tenants/{uid}` where uid is the Google Auth uid. Clients read; only callables write. Google sign-in is invite-only (`src/domain/allowlist.ts`). Allowed users get an `allowlisted` auth claim. Firestore reads require that claim or an allowlisted email. Keep the email list in `firestore.rules` in sync when you add someone.

## accessLogs/{id}

Function-only. `type` is `signup` (first allowed tenant) or `denied`, plus `email`, `uid`, `at`. Watch this in the Firebase console to see new friends and blocked attempts.

## settings/current

- `dayMinutes` (productive time; split into three packer sections), `dayStartMinutes` (unused by the packer), `transitionMinutes`, `timezone`
- `morningMinutes`, `breakMinutes`, `eveningMinutes` (Personal pause lengths; not in weekly capacity)
- `timerSound`, `timerVibrate` (section timers and event stopwatch)
- audit stamps

## buckets/{id}

- `kind`: `personal | work | weighted | event`
- `name`, `weight`, `hoursMode` (`week` | `day`, default `week`), `hoursMinutes` (the hours field)
- `weeklyMinutes`: derived week total (`hoursMinutes` in week-mode; `hoursMinutes ×` checked days in day-mode)
- `days[]`, `slot`, `color`, `archived`
- Events: `ranges[]` (`id`, `startDate`, `endDate`, inclusive; start === end is a 1-day block). Legacy `startDate` / `endDate` on the bucket still count as one range until the next Save. No slot, no week hours.
- Work id is `work` (weight 1). Personal id is `personal`. Events id is `events`. Morning Routine, Break, and Evening Routine durations live on settings.

## items/{id}

- `bucketId`, `title`, `type` (`recurring` | `scheduled`), `weight`, `durationMinutes` (0 is a reminder; never dropped). Timed duration cannot exceed the bucket’s daily hours.
- `cadence` object, optional `dueAt`, `archived`. `everyNDays` may include `startDate`; no hits before it.
- Events items are always `scheduled`. `dueAt` is the date they pack; cadence is unused.

## appointments/{id}

- `title`, `date`, `durationMinutes`, `color`
- No start time. Today counts elapsed time up; stop subtracts from section capacity.

## days/{yyyy-mm-dd}

- `blocks[]` (each block may have `slot`), `dropped[]`, `droppedBuckets[]`, `startedAt`, `endedAt`, `packedAt`
- `section` (`morning` | `midday` | `evening` | `event`), `sectionStartedAt`, `sectionRemainingMinutes`, `pausedAt`
- `sectionExtra`, `sectionUsed` (appointment eat). Pack rebuilds 6 weeks from this week’s Sunday and clears both. Start Next Buckets does not write leftover extra.
- `eventStartedAt` (unused on event days; no stopwatch), `appointmentRuns` (`{ startedAt?, elapsedMinutes? }` keyed by appointment id)
- Pack restamps `color` from current buckets and appointments. Started or ended days keep Complete / Skip.

## logs/{id}

Append-only: `type`, `at`, `date`, `itemId`, `bucketId`, `minutes`, optional `title` and `section`. Never overwritten. `rebuild` displays as Schedule packed (gold). Complete is green; skip is red. Start Next Buckets writes one `skip` row per leftover item, then `start_next`.

## skipPushes/{id}

- `itemId`, `fromDate`, `toDate`
