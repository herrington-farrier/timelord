# Logic map

## Screen names

The routes never changed; only what the menu calls them.

| Route | Screen | Called in this doc |
| --- | --- | --- |
| `/` | Quest | Today |
| `/calendar` | Quest Log | Calendar / the board |
| `/edit` | Strategize | Edit |
| `/log` | Stats | Log |
| `/guide` | Guide | Guide |

## Control names

| Control | Reads as |
| --- | --- |
| Start Day | Start Quest |
| Start Next Buckets | Start Next Chapter |
| End Day | Hearth |
| Start Break | Rest ZZZ (green) |
| End Break | End Rest |
| Reset Today | Respawn (green) — toast `Quests reset. +1 Life` |
| — | Reroll Stats — erases the log (`clearLogs`), behind an `Erase all Stats?` dialog |

The rest of this document uses the functional names, because "today" also means
the date being packed and renaming that would make the packing rules ambiguous.

Google sign-in is invite-only. **Add someone by editing `config/allowlist` in the Firestore console** — one document, no deploy. The hardcoded list in `src/domain/allowlist.ts` and `firestore.rules` is only the owner floor, so a bad edit cannot lock the owner out. `bootstrap` refuses an uninvited caller before it reads anything, and logs a given denial once per instance so a spammed sign-in cannot run up writes. An existing tenant is always admitted (setup is never wiped). New accounts need an allowlisted email. Firestore reads require the `allowlisted` claim or an allowlisted email. First allowed signup seeds Personal / Work / Events plus generic Home and Errands (and a couple of sample list items), packs 6 weeks from this week’s Sunday if the tenant has no days yet, and writes `accessLogs`. After bootstrap, the client waits for the claim before reading. Refresh keeps the session and skips bootstrap when the claim is already present. A server error on bootstrap does not sign the user out; only an invite denial does.

Timelord packs **productive** time only. `dayMinutes` splits into three equal sections (`floor(dayMinutes / 3)`, remainder on evening). Personal (Morning Routine, Break, Evening Routine) pauses productivity and is not in weekly capacity. Assignable week hours = `dayMinutes × 7`.

**Unless `personalCountsAsDay` is on** (Strategize → Day). Then Personal is inside the day: the routines and Break take their real minutes out of their sections, assignable week hours become `(dayMinutes − personal per day) × 7`, and the routines become items to complete or skip on Quest. The packer uses section timers and bucket caps, not a clock.

Buckets pack by **weight** (lower number = higher priority) inside their slot. Each bucket’s assigned hours are a **cap**: items compete only for that bucket’s time. A bucket does not expand to fill the section. Going over on a bucket does not steal from later buckets or later sections. Unused section time is dropped; starting the next stretch does not carry it forward.

0-duration items never drop; they stay on the list in weight order (reminders). Item order is unique weight only.

## Day container

Edit → Day shows the live morning / midday / evening section lengths, plus timer sound / vibrate, and **Reset Today** (re-packs today and clears start / complete / skip / timers). Edit → Buckets shows assigned weekly hours vs leftover. Personal hours are not subtracted from the week. Leftover week time stays unassigned. Save refuses a week that is over that cap.

Each Strategize tab has one **Save** (Lists keeps per-row Remove). Lists saves through `saveItems`: every row validated first, then one batch and one repack. After a successful write, this week’s Sunday + 6 weeks (42 days) rebuild. Buckets Save is `saveBuckets`: Personal settings + Work + Events + weighted buckets (Add New if named), cap check, then pack. Item Save keeps the stored list weight. Pack always uses fresh section thirds and clears leftover eat. Started or ended days keep Complete / Skip.

**Every** bucket picks one or more sections with toggles, and an item chooses among them whenever its bucket spans more than one. Work and weighted buckets set hours as **Week** or **Day**. Collapsed rows show `slot · 8h/wk` (Work can show `morning+midday · 8h/wk`; Personal: hours only). Packer daily budget: week-mode `floor(weeklyMinutes / days.length)` on a checked day; day-mode `hoursMinutes` on a checked day.

## Locked vs customizable

- **Personal** always exists. Morning Routine, Break, and Evening Routine durations are editable. Color can change. Cannot be renamed, removed, or given a list. Does not consume week hours.
- **Work** always exists, weight 1, first in each **selected** section (one or more; toggles on Edit). Cannot be deleted or drag-reordered. Break is always midday. If Work is in midday, Break sits in that Work block (2-hour split). Morning/evening Work is not split. If Work is not in midday, Break still lands once there. Each Work list item packs in one selected section.
- **Appointments** always exists. A container, not a scheduled bucket: no hours, no days, no sections of its own, and it cannot be renamed or deleted. Only its colour is editable, on Strategize → Buckets where it sits first. Its items are added under Lists.
- **Events** always exists. One or more **named** date ranges on the bucket (1-day ranges allowed). Add / remove / name them in Strategize → Buckets; page Save writes them. An event whose last day has passed deletes itself, and its items with it. Collapsed row summarises them (`2 ranges · 6d`) or `off` — the dates themselves live in the form. No slot, no week hours, no day sections. Cannot be deleted.
- **Weighted buckets** can be added, removed, renamed, recolored, reweighted, and given days / one or more sections / Week or Day hours.

## Today (normal day)

Buttons transform in place:

- **Start Day** begins the morning countdown. Morning Routine happens on your own; there is no Start Routine step.
- After Start Day, Today lists **this stretch only** (placed + falling-off) plus Personal pause controls. Completed and skipped items leave the list — Stats is the record. Break stays, being a control rather than an item.
- Break: Start Break / End Break pauses/resumes the current timer.
- After the list (and falling-off): **Start Next Chapter** + the next stretch's total. Auto-skips leftover placed and falling-off items (same skip log rows as Skip) — including a missed appointment, but **not** one that spans into a later section, which is still running. Leftover scheduled items renew on the bucket's next day; appointments and events do not, since a missed one is missed rather than deferred. Then opens the next stretch. If the next stretch is 0, auto End Day. The countdown is wall-clock; hitting 0m sounds and does not start the next stretch.
- Evening: **End Day** after the list.
- Appointments are items in the locked `appointments` bucket, packed before every other bucket in their section. Each declares the **sections it spans** (multi-select, at least one); its hours come out of the first of those and spill forward, and it stays on the list through every section it spans. Nothing is inferred from `apptTime`. An appointment is Scheduled (one date) or Recurring (a cadence, for a standing appointment). They have no stopwatch: the duration you assign is what the day loses, its own section first and then spilling forward. Complete / Skip like any item; skipping cancels it and returns the hours. A cancelled appointment is not pushed to another day.

The Quest header shows **Day / Booked / Packed**; Booked is time committed to appointments, coloured on the same load scale, and is how an overbooked day reads. Section timers show hours and minutes. They use the Day sound/vibrate toggles. Going over a bucket does not steal later time.

## Events

If today is inside any Events date range: **event day**. Show Events list items only, with Complete / Skip. No morning/midday/evening, no Break, no Start Day / End Day, no stopwatch.

Events list items are **scheduled only**: they pick an event, then a date inside that event's range, plus a duration. No cadence. Lists groups them under their event. Calendar chips use the same filled treatment as appointments and pin to the top of the cell.

## Calendar and list

The 2-week Sunday board and side list stay. Days before today are blank on the board (date number only) and omitted from the side list. Hours marks at the top of each list day and cell count **productive** packed minutes (no Personal), colored vs `dayMinutes` (green under 50%, gold 50–85%, red above). The side list also shows leftover morning / midday / evening minutes (section thirds minus packed items in that slot; leftover eat applies). Those leftover numbers use the same load colors by time used (green under 50%, gold through 85%, red when little or none is left). Event days omit that row. Chips are `title · duration` (title only if 0). No clocks. Appointments are visually distinct and first in the cell and list. Event items look like other list chips; the day outline marks an Events range. Other list items follow section, then weight. Evening chips stay in the last third, before Evening Routine; a missing packed slot uses the bucket’s slot. Falling-off stays at the bottom of that day. Event days outline the cell and list day in the Events color even when empty. Event items also show on a normal day on their date.

## Lists

Edit → Lists groups items by bucket. Groups start collapsed; the count is on the row. Add New stays open at the top.

Recurring = cadence forever. Scheduled = due date + cadence. A list item’s weekday pickers only allow days the bucket runs; unchecked bucket days are disabled. Every-N-days may include an optional start date; no hits before it. Duration cannot exceed that bucket’s daily hours (week-mode share, or the day-mode hours). 0-duration reminders are exempt. Events items have no hours cap. When Work has more than one section, each Work item picks one of those sections. Skip scheduled → next assigned day for that bucket. Skip recurring → no makeup. Skip-push is scheduled-only.

End Day: leftover scheduled skip-push; leftover recurring drop. Next day starts clean.

## Controls

Menu, transforming Start/End, Start Next Chapter, End Day, Complete / Skip, Save, Reset Today, and Remove share high-contrast control styles. Log rows: gold packed, green complete, red skip. There are no toasts — a save confirms itself by the page re-rendering, and a failure is shown beside the control that failed, with the offending row and field marked. There is **no pack button**: every write that changes the schedule repacks 42 days on its own — inside the callable (`saveBuckets`, `resetBucket`, `upsertItem`, `reorderItems`, `archiveItem`, `reorderBuckets`) or via the client rebuild that follows it (`saveSettings`, `archiveBucket`, `upsertAppointment`, `archiveAppointment`). Guide is a short tour of what each bucket and page is for, plus the hard limits. The chrome is navy and antique gold from the app icon. The current page is marked in the menu.

Selected is one treatment everywhere — gold wash, gold edge, normal text — shared by the current page, Edit tabs, day chips and pills. Solid gold is reserved for actions (Save). Every multiple-choice control is a label-sized tap target of at least 44px; the native input stays for focus, name and form value. A greyed copy of the app icon sits fixed behind every screen.

**Every page** runs the same chrome: the page title *is* the menu button, and the nav sits hidden behind it, so each screen is title-only. Sign Out rides in that menu on Today. Today additionally uses tighter page padding, so it is nearly full screen. The menu closes on navigation, on Escape, and when you pick something. Start Day is the app icon, large and round, with a slow halo; pressing it starts the day and the list animates in one card at a time. When the day ends the same icon greys out — there is no “Day ended” text.
