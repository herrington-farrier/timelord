# Data model

Solo tenant: `tenants/{uid}` where uid is the Google Auth uid. Clients read; only callables write.

## settings/current

- `dayMinutes`, `dayStartMinutes`, `transitionMinutes`, `timezone`
- `morningMinutes`, `breakMinutes`, `eveningMinutes`
- audit stamps

## buckets/{id}

- `kind`: `personal | work | weighted`
- `name`, `weight`, `weeklyMinutes`, `days[]`, `slot`, `color`, `archived`
- Work id is `work`. Personal is not stored as a list bucket; its three blocks come from settings.

## items/{id}

- `bucketId`, `title`, `type` (`recurring` | `scheduled`), `weight`, `durationMinutes`
- `cadence` object, optional `dueAt`, `archived`

## appointments/{id}

- `title`, `date`, `startMinutes`, `durationMinutes`

## days/{yyyy-mm-dd}

- `blocks[]`, `dropped[]`, `droppedBuckets[]`, `startedAt`, `endedAt`, `packedAt`

## logs/{id}

Append-only: `type`, `at`, `date`, `itemId`, `bucketId`, `minutes`. Never overwritten.

## skipPushes/{id}

- `itemId`, `fromDate`, `toDate`
