# Timelord

Personal day packer. Sign in with Google. Each account owns its own schedule.

**App:** https://timelord-e0c80.web.app

Today packs Personal, Work, weighted buckets, and appointments. Complete or Skip as you go. Start Day chains remaining ETAs from now; End Day clears leftovers. Priorities are drag-and-drop.

## Screens

- **Today** — packed day, Start Day / End Day, Complete / Skip, Falling off
- **3-week** — calendar
- **Edit** — day length, buckets, lists, appointments
- **Log** — append-only events

Work stays first and cannot be deleted. Other buckets can be added, removed, renamed, or recolored. Lower-priority buckets drop as a unit when the day is full.

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
