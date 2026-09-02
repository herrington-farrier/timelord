# Timelord

Personal day packer. Invite-only Google sign-in. Each invited account owns its own schedule. Add a friend’s email to `src/domain/allowlist.ts` and `firestore.rules`, then deploy `bootstrap` and Firestore rules. First signup seeds buckets and packs 6 weeks.

**App:** https://timelord-e0c80.web.app

Quest runs productive-day section timers. Personal pauses (Morning Routine, Break, Evening Routine) do not consume week hours. Start Quest begins the morning countdown; Start Next Chapter opens the next stretch without carrying leftover time. Hearth closes the evening. Appointments are duration-only and count up. Events can turn one or more date ranges (including single days) into unsectioned event days with Complete / Skip only. Overflow is falling-off. Priorities are drag-and-drop.

## Screens

Every screen hides its nav behind the page title — tap the title to open the menu.

- **Quest** (`/`) — section countdown, Start Next Chapter, Hearth, Rest pause, appointment stopwatches, Complete / Skip, Falling off
- **Quest Log** (`/calendar`) — 2-week board, Today / Next 2wks, packs 6 weeks from Sunday, packed-hours marks, duration chips
- **Organize** (`/edit`) — day length and timer sound/vibrate, Respawn, weekly hours, Events date ranges, lists grouped by bucket, duration-only appointments
- **Guide** (`/guide`) — short tour of buckets, the day, the board, and lists
- **Stats** (`/log`) — append-only events (gold packed, green complete, red skip)

Work stays first in each section you pick and cannot be deleted. Events is locked and uses one or more date ranges. Other buckets can be added, removed, renamed, or recolored.

Design and packing rules live in [docs/logic-map.md](docs/logic-map.md), the Firestore shape in [docs/data-model.md](docs/data-model.md), and deferred work in [docs/todo.md](docs/todo.md).

## Run locally

Node 20+. Firebase project `timelord-e0c80` with Google Auth, Firestore, Functions, and Hosting (Blaze).

```bash
cp .env.example .env.local
npm install
npm install --prefix functions
npm test
npm run dev
```

Paste the Firebase web config into `.env.local`. Clients read Firestore; all writes go through callable functions. Deploy functions and Firestore rules together after changing the allowlist so existing sessions get the `allowlisted` claim before rules require it.

## Deploy

```bash
npm run deploy:hosting
npm run deploy:functions
```
