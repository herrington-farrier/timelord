# Timelord

Personal day packer. Invite-only Google sign-in. Each invited account owns its own schedule. Add a friend’s email to `src/domain/allowlist.ts` and deploy functions.

**App:** https://timelord-e0c80.web.app

Today runs productive-day section timers. Personal pauses (Morning Routine, Break, Evening Routine) do not consume week hours. Start Day begins the morning countdown; Start Next Buckets opens the next stretch without carrying leftover time. Appointments are duration-only and count up. Events can turn one or more date ranges (including single days) into unsectioned event days with Complete / Skip only. Overflow is falling-off. Priorities are drag-and-drop.

## Screens

- **Today** — section countdown, Start Next Buckets, End Day, Break pause, appointment stopwatches, Complete / Skip, Falling off
- **Calendar** — 2-week board, Today / Next 2wks, packs 6 weeks from Sunday, packed-hours marks, duration chips
- **Edit** — day length and timer sound/vibrate, Reset Today, weekly hours, Events date ranges, lists, duration-only appointments
- **Guide** — short tour of buckets, Today, the calendar, and lists
- **Log** — append-only events (gold packed, green complete, red skip)

Work stays first in its slot and cannot be deleted. Events is locked and uses one or more date ranges. Other buckets can be added, removed, renamed, or recolored.

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
