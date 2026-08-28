# Timelord

Personal day board: Google Sheets + Apps Script for data, GitHub Pages for **Today** and a **3-week** calendar.

Wake up, see the packed day in order, complete or skip as you go. Midnight rebuilds the plan. Overflow that did not fit lands on **Summary** (and **Falling off** on Today) so you can skip a bucket or change weekly hours and rebuild.

Time zone: **America/Chicago**.

## How a day is packed

1. **Personal** blocks (shower/breakfast, lunch, dinner) — immovable, not stealable.
2. **Busy** from your Google Calendar — immovable.
3. Remaining hours (default **12h** day minus personal, busy, and **15-minute buffers** between items) fill **buckets by weight**: Work → Fitness → Food → House → Garden → Projects.
4. Each bucket gets **one slot**. What fills it, in order: a due-dated one-off → a **scheduled** recurring chore that hits that day → a **rotate** list (fitness, dishes) if that cadence hits → the checked **Current** item (projects, work highlights).
5. If a bucket’s items do not fit the leftover **day** hours or that bucket’s **weekly remaining**, the whole bucket is pushed to overflow.

**Today display order:** morning Personal → House + Garden → Work → Fitness → Projects → lunch → evening Food → dinner.

Buffers count against the day, not against any bucket’s weekly budget. Consecutive personal rows in the same slot can be one block (the seed morning routine is already combined).

## Weekly hours

**Settings** is the budget home.

- Gross weekly hours = day hours × days per week (default 12 × 7 = 84).
- Personal weekly hours come off first.
- What is left is **assignable**. You split that across buckets.
- Each bucket has **daily hours** and **weekly hours** (daily × days/week). **Minimum** is weekly. Marked **This week** items consume the budget; remaining is shown per week and per day.

Raising a bucket (type **Daily hours** on Settings, the Settings dialog, or Today +/−):

1. Take from **Unallocated** first.
2. Then steal from lower-priority buckets (Projects → Garden → House → Food → Fitness → Work), never below each bucket’s minimum.
3. Never steal from Personal.

Budget changes update remaining immediately. The calendar does **not** reshuffle until **Rebuild today** or the midnight pack.

Seed weekly hours (after personal): Work 18, Fitness 6, Food 12, House 8, Garden 6, Projects 12.

## Setup (clasp)

Do this from the repo root. You need **Node.js 20+** and a Google account.

### 1. Install clasp and log in

```bash
cd /Users/reh/Dev/personal/timelord

npm install -g @google/clasp
clasp --version

# Enable the Apps Script API (required once per Google account):
# https://script.google.com/home/usersettings
# Turn Google Apps Script API → On

clasp login
```

A browser window asks you to authorize clasp. If you are on SSH with no browser: `clasp login --no-localhost`.

`.clasp.json` is gitignored (it has your script id). Keep using [`.clasp.json.example`](.clasp.json.example) as the template.

### 2. Create the Sheet and bind the script

1. In Drive, create a blank Google Sheet. Name it **Timelord**.
2. Copy the spreadsheet id from the URL:

   `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`

3. Open the sheet → **Extensions → Apps Script**. That creates a *bound* project. Delete the stub `Code.gs` if clasp will replace everything on push (or leave it; `--force` overwrites).
4. In Apps Script: **Project Settings** (gear) → copy **Script ID**.

```bash
cp .clasp.json.example .clasp.json
```

Put the Script ID in `.clasp.json`:

```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "google-apps-script"
}
```

Push the local files (this folder already has the `.gs` and `.html` sources):

```bash
clasp push --force
clasp open-script
```

`clasp open-script` opens the Apps Script editor so you can confirm the files landed.

**Alternative:** create the bound project from the CLI instead of Extensions → Apps Script:

```bash
clasp create-script --title "Timelord" --type sheets --parentId "SPREADSHEET_ID" --rootDir google-apps-script
```

If that errors because `google-apps-script/` is not empty, use the Script ID path above. After create, you still `clasp push --force`.

### 3. Authorize and seed the sheet

In the Apps Script editor:

1. Select function **`onOpen`** → **Run**. Approve Sheets (and later Calendar when you sync busy).
2. Reload the spreadsheet. The **Timelord** menu should appear.
3. **Timelord → Setup sheet (one-time)** → OK.

That creates every tab, colors, seed cadences, and packs today + 3 weeks.

On **Settings**, copy into [`web/config.js`](web/config.js):

- Spreadsheet ID
- Plan gid
- Summary gid
- Settings gid

Share the sheet **File → Share → Anyone with the link → Viewer** so GitHub Pages can fetch CSV.

### 4. Deploy the Web App (Complete / Skip / pickers)

From the repo root, after a successful push:

```bash
clasp deploy -d "Timelord web app"
clasp list-deployments
```

The deployment id is in the output. The exec URL is:

`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`

Paste that into `web_app_url` in `web/config.js`.

You can also deploy in the browser: Apps Script → **Deploy → New deployment → Web app** → Execute as **Me**, Who has access **Anyone**.

Bookmark that URL on your phone (no `action=` query opens the mobile editor). Anyone with the URL can edit — fine for a personal tool.

Later code changes:

```bash
clasp push --force
clasp deploy -i <DEPLOYMENT_ID> -d "Timelord web app"
```

(`-i` updates the existing deployment so `web_app_url` does not change.)

### 5. GitHub Pages

1. Fill `spreadsheet_id`, gids, and `web_app_url` in `web/config.js`.
2. Push the repo.
3. GitHub → **Settings → Pages** → source **GitHub Actions**. The workflow deploys `web/` on push to `main`.

### 6. Midnight pack + calendar busy

In the sheet:

1. **Timelord → Sync calendar busy** (authorize Calendar if asked).
2. **Timelord → Rebuild today**.
3. **Timelord → Install midnight trigger** — 00:05 America/Chicago: sync busy, then pack today + 3 weeks.

If the Pages tab stays open, Today also auto-fetches at midnight. Opening the page in the morning already has the packed CSV. Use **Refresh** only if you just edited the sheet by hand.

### Everyday clasp

| Command | What it does |
|---------|----------------|
| `clasp push --force` | Upload `google-apps-script/` to the bound project |
| `clasp pull` | Download from Apps Script (overwrites local files) |
| `clasp open-script` | Open the Apps Script editor |
| `clasp list-deployments` | Show Web App deployment ids |
| `clasp deploy -i ID -d "…"` | Update an existing Web App deployment |

Do not `clasp pull` unless you meant to overwrite local sources with whatever is in the cloud editor.

## Sheet tabs

| Tab | Role |
|-----|------|
| **Settings** | Day length, buffer minutes, weekly totals, per-bucket daily / weekly hours / min / marked / remaining, gids |
| **Personal** | Static life blocks (title, hours, slot, cadence). Locked against steal |
| **Templates** | Recurring bucket work. **This week** checkbox. Options list (semicolon-separated) |
| **Tasks** | One-offs: name, hours, due date, bucket, This week |
| **Work** | Week start, theme, daily hours, three Highlight candidates |
| **Projects** | Active projects + default hours. Learning lives here too (evening template). |
| **Fitness** | Weekday → session name + hours |
| **Busy** | Written by calendar sync. Do not edit |
| **Plan** | Packed rows for today + 3 weeks. Status `pending` / `complete` / `skipped` |
| **Summary** | Day totals and overflow for morning review |
| **Log** | Complete / skip history |

**Timelord** menu: Setup, Rebuild today, Sync calendar busy, Install midnight trigger, plus dialogs for Tasks, Templates, Work, Projects, Fitness, Personal, Settings.

Rebuild **preserves** complete / skip / chosen Highlight or project on matching rows (same date + bucket + source + title).

## Cadences

On Templates and Personal **Days** / **Cadence**:

| Value | Meaning |
|-------|---------|
| `daily` | Every day |
| `weekdays` / `weekends` | Mon–Fri / Sat–Sun |
| `eod` | Every other day from a configurable start date (defaults to 2026-01-01 if not set) |
| `weekly:Sat` | That weekday. Comma lists work: `weekly:Tue,Fri` |
| `every_3_4_days` | Tuesday and Friday (~2×/week) |
| `every_2_months` | 1st of even months |

### Start date for every-other-day items

Items with the `eod` cadence can have a custom **Start** date. This date determines which days the item appears on (the item shows on the start date, then every other day after that). Set the start date in the Edit UI when cadence is `eod`. If no start date is set, the default anchor of 2026-01-01 is used.

## Pages board

- **Today** (`index.html`) — ordered packed list, bucket colors, option lists, Complete / Skip, weekly +/− pickers, **Falling off**.
- **3-week** (`calendar.html`) — left list + this week and the next two. **This week** / **Next 3wks**. Packed chips only; overflow is muted.

Complete keeps weekly hours used. Skip returns them. **Skip** does not auto-repack; use **Rebuild** if you want overflow pulled into the freed hours.

Writes from Pages go through the Web App (`action=complete|skip|skipBucket|pick|setWeeklyHours|bumpWeeklyHours|rebuild`) via JSONP.

### `web/config.js`

```js
window.TIMELORD_CONFIG = {
  spreadsheet_id: "",
  timezone: "America/Chicago",
  web_app_url: "",
  plan_gid: "",
  summary_gid: "",
  settings_gid: ""
};
```

## Seed buckets

| Bucket | Color | Slot | Weekly | Min |
|--------|-------|------|--------|-----|
| Work | gold `#f0c14a` | midday | 18 | 8 |
| Fitness | orange `#fb923c` | midday | 6 | 3 |
| Food | red `#e85d4c` | evening | 12 | 7 |
| House | slate `#94a3b8` | morning | 8 | 5 |
| Garden | green `#4ade80` | morning | 6 | 3 |
| Projects | purple `#a78bfa` | midday / evening | 12 | 3 |
| Personal | sand `#e7d5c5` | — | (locked) | — |

Seed Personal: morning routine 1h, lunch 0.5h, dinner with husband 1h. Buffer default **15** minutes (set **Buffer minutes** to `10` for a tighter day).

## Repo

```
timelord/
  web/                      GitHub Pages
  google-apps-script/       bound script + dialogs (clasp rootDir)
  .clasp.json.example       copy to .clasp.json (gitignored)
  .github/workflows/        deploy web/ to Pages
```
