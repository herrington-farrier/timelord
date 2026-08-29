# Data model

Solo tenant: `tenants/{uid}` where uid is the Google Auth uid. Clients read; only callables write.

## settings/current

- `dayMinutes`, `dayStartMinutes` (packer overlay for appointments; not a user start time), `transitionMinutes`, `timezone`
- `morningMinutes`, `breakMinutes`, `eveningMinutes`
- audit stamps

## buckets/{id}

- `kind`: `personal | work | weighted`
- `name`, `weight`, `hoursMode` (`week` | `day`, default `week`), `hoursMinutes` (the hours field)
- `weeklyMinutes`: derived week total (`hoursMinutes` in week-mode; `hoursMinutes ×` checked days in day-mode). Docs that only have `weeklyMinutes` are week-mode with that total.
- `days[]`, `slot`, `color`, `archived`
- Work id is `work`. Personal id is `personal` (name/color). Morning Routine, Break, and Evening Routine durations live on settings. Personal has no Week/Day toggle.

## items/{id}

- `bucketId`, `title`, `type` (`recurring` | `scheduled`), `weight`, `durationMinutes`
- `cadence` object, optional `dueAt`, `archived`

## appointments/{id}

- `title`, `date`, `startMinutes`, `durationMinutes`

## days/{yyyy-mm-dd}

- `blocks[]`, `dropped[]`, `droppedBuckets[]`, `startedAt`, `endedAt`, `packedAt`
- Rebuild restamps `color` on packed and dropped rows from the current buckets.

## logs/{id}

Append-only: `type`, `at`, `date`, `itemId`, `bucketId`, `minutes`. Never overwritten.

## skipPushes/{id}

- `itemId`, `fromDate`, `toDate`
