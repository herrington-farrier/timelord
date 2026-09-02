# Timelord

Personal day packer. Invite-only Google sign-in; each invited account owns its
own schedule. First sign-in seeds buckets and packs six weeks.

**App:** https://timelord-e0c80.web.app

Quest runs productive-day section timers. Personal pauses (Morning Routine,
Break, Evening Routine) do not consume week hours unless you turn that on.
Start Quest begins the morning countdown; Start Next Chapter opens the next
stretch without carrying leftover time. Hearth closes the evening and scores it.
Appointments take their whole duration out of the day when it is packed. Events
turn one or more named date ranges into unsectioned event days with Complete /
Skip only. Overflow is falling-off. Priorities are drag-and-drop.

## Adding a user

The invite list is a single Firestore document. **No code change, no deploy.**

1. Firebase console → **Firestore Database**
2. Open the **`config`** collection → the **`allowlist`** document
3. Edit the **`emails`** array → **Add item** → type the address **in lowercase**
4. Save

They can sign in within about **five minutes** — the functions cache the list
that long. Their first sign-in creates their own tenant, seeds example buckets
and items, and packs six weeks.

If `config/allowlist` does not exist yet, it is created from the owner list the
next time anyone signs in. Sign in once and it will be there to edit.

**Removing someone:** delete their address from the same array. Their data stays
under `tenants/{uid}`; delete that document tree in the console if you want it
gone. See the caveat below.

### Why you cannot lock yourself out

The addresses in `src/domain/allowlist.ts` are mirrored in `firestore.rules` as
a **floor**, deliberately. Security rules must not depend on data a bad edit
could delete, so those accounts keep working even if `config/allowlist` is
emptied or deleted. Everyone else lives in the document only.

The rules test that floor first, and rules short-circuit, so the owner accounts
cost no extra read — only an invited non-owner pays the document lookup.

Changing the floor itself — adding a permanent owner — means editing
`src/domain/allowlist.ts` **and** `firestore.rules`, then deploying functions and
rules. It is the only access change that still needs a deploy.

### What a stranger gets

Nothing, at three layers:

- **`gateSignUp`**, a `beforeUserCreated` blocking function, refuses an uninvited
  Google account *before Firebase creates the user*, so strangers never appear
  in your account list at all.
- **`bootstrap`** checks the caller's own token against the cached list before
  touching Auth or Firestore, so a refused sign-in costs no reads and no writes.
  Each instance logs a given denial once rather than per attempt, so hammering
  the endpoint cannot run up writes.
- **Firestore rules** admit only the claim, the floor, or the document.

Where to look afterwards: the `accessLogs` collection holds every new signup, and
any denial that reached `bootstrap` — someone whose account already existed when
you removed them. A stranger stopped by `gateSignUp` never gets that far, so
those refusals show up in the Cloud Functions log for `gateSignUp`, not in
Firestore.

**Caveat on removal.** The rules also admit anyone carrying the `allowlisted`
custom claim, and `bootstrap` calls `setCustomUserClaims` on every sign-in — so
by design, removing an address does *not* revoke someone who has signed in
before. In practice the claim is not landing on any account today
(`firebase auth:export` shows no `customAttributes` on any of the three), which
is why removal works right now. That is a bug, not the design, so do not build
on it. If you need revocation to be guaranteed, drop the
`request.auth.token.allowlisted == true` clause from `firestore.rules`; the
floor and the document still authorize everyone who should get in.

## Screens

Every screen hides its nav behind the page title — tap the title to open the menu.

- **Quest** (`/`) — section countdown, Start Next Chapter, Hearth, Rest pause,
  Complete / Skip, Falling off, and the day's score
- **Quest Log** (`/calendar`) — 2-week board, packs 6 weeks from Sunday,
  packed-hours marks, booked time, duration chips
- **Strategize** (`/edit`) — day length, timer alerts, Respawn, Reroll Stats,
  weekly hours, buckets and their sections, named events, and every list item
  including appointments. One Save per tab.
- **Guide** (`/guide`) — short tour of buckets, the day, the board, and lists
- **Stats** (`/log`) — your score over time, and the event history

Personal, Work, Events and Appointments are locked buckets: they cannot be
deleted or renamed. Every other bucket can be added, removed, renamed,
recoloured, and given one or more day sections.

## Docs

- [docs/logic-map.md](docs/logic-map.md) — behaviour, screen by screen
- [docs/data-model.md](docs/data-model.md) — every Firestore field
- [docs/todo.md](docs/todo.md) — what was built, and the reasoning behind it
- [docs/verify.md](docs/verify.md) — the manual check list
- [docs/porting.md](docs/porting.md) — read before forking or integrating

## Run locally

Node 20+. Firebase project `timelord-e0c80` with Google Auth, Firestore,
Functions, and Hosting (Blaze). Blocking functions need Identity Platform, which
is already enabled on this project.

```bash
cp .env.example .env.local
npm install
npm install --prefix functions
npm test
npm run dev
```

Paste the Firebase web config into `.env.local`. Clients read Firestore; every
write goes through a callable function.

## Deploy

```bash
npm run deploy:hosting
npm run deploy:functions
npx firebase deploy --only firestore:rules
```

Deploy functions in **small batches** — `--only functions:a,functions:b`. Larger
batches have repeatedly reported success while silently skipping some functions.
Re-run and confirm each one.
