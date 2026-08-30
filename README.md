# Timelord

Personal day packer. Sign in with Google. Each account owns its own schedule.

**App:** https://timelord-e0c80.web.app

Today runs productive-day section timers. Personal pauses (Morning Routine, Break, Evening Routine) do not consume week hours. Start Day begins the morning countdown; Start Next Buckets opens the next stretch without carrying leftover time. Appointments are duration-only and count up. Events can turn a date range into an unsectioned event day with Complete / Skip only. Overflow is falling-off. Priorities are drag-and-drop.

## Screens

- **Today** — section countdown, Start Next Buckets, End Day, Break pause, appointment stopwatches, Complete / Skip, Falling off
- **2-week** — calendar, Today / Next 2wks, packed-hours marks, duration chips
- **Edit** — day length and timer sound/vibrate, Reset Today, weekly hours, Events date range, lists, duration-only appointments
- **Guide** — short tour of buckets, Today, the calendar, and lists
- **Log** — append-only events (gold packed, green complete, red skip)

Work stays first in its slot and cannot be deleted. Events is locked and uses a date range. Other buckets can be added, removed, renamed, or recolored.

## Run locally

Node 20+. Firebase project `timelord-e0c80` with Google Auth, Firestore, Functions, and Hosting (Blaze).

```bash
cp .env.example .env.local
npm install
npm install --prefix functions
npm test
npm run dev
```

Paste the Firebase web config into `.env.local`. Clients read Firestore; all writes go through callable functions.

## Deploy

```bash
npm run deploy:hosting
npm run deploy:functions
```
