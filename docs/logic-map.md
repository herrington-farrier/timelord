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

A failure toast is named for the control's own visible text when that text is unique on its page (`Start Quest`, `Start Next Chapter`, `Hearth`, `Rest ZZZ`, `End Rest`, `Respawn`, `Reroll Stats`). Generic buttons get a verb-noun failure-toast name, because `Save: …` alone would not say what failed:

| Control | Failure toast name |
| --- | --- |
| Complete (Quest item) | Complete Item |
| Skip (Quest item) | Skip Item |
| Save (Day tab) | Save Day |
| Save (Buckets tab; also an Events range that does not parse) | Save Buckets |
| Save (Lists tab) | Save Lists |
| Remove (bucket) | Remove Bucket |
| Remove (list item) | Remove Item |
| Drag to reorder (buckets) | Reorder Buckets |
| Drag to reorder (list items) | Reorder Items |

The rest of this document uses the functional names, because "today" also means
the date being packed and renaming that would make the packing rules ambiguous.

Google sign-in is invite-only. **Add someone by editing `config/allowlist` in the Firestore console** — one document, no deploy. The hardcoded list in `src/domain/allowlist.ts` and `firestore.rules` is only the owner floor, so a bad edit cannot lock the owner out. `bootstrap` is declared `invoker: 'public'` and needs the `allUsers` run-invoker binding to be reachable at all — see the README, since without it the function never runs and nothing says so. It refuses an uninvited caller before it reads anything, and logs a given denial once per instance so a spammed sign-in cannot run up writes. Every mutating callable asks that same document through `requireUid`, so an invite from the console reaches the write path too. An existing tenant is always admitted (setup is never wiped). New accounts need an allowlisted email. Firestore reads require the `allowlisted` claim or an allowlisted email. First allowed signup seeds Personal / Work / Events plus generic Home and Errands (and a couple of sample list items), packs 6 weeks from this week’s Sunday if the tenant has no days yet, and writes `accessLogs`. After bootstrap, the client waits for the claim before reading. Refresh keeps the session and skips bootstrap when the claim is already present. A server error on bootstrap does not sign the user out; only an invite denial does.

Timelord packs **productive** time only. `dayMinutes` splits into three sections. **Whole hours throughout**: Day Length is set in hours, and the even default divides them (`14h` is `4h / 5h / 5h`, spare hours going to the later stretches), so no stretch ever reads `4h 40m`. A day that is not a whole number of hours keeps its odd minutes on evening. Balanced on Strategize → Day with a +/− stepper per stretch. An hour added to one stretch comes out of the next (evening borrows from morning), so the three always add back to Day Length and there is nothing to validate; a step is offered only when the neighbour can pay for it. Changing Day Length rescales the balance proportionally rather than discarding it, rounding morning and midday to whole hours and giving evening the remainder. Day Length is still the truth: a stored split that does not add back to it is stale and an even split is used instead. Personal (Morning Routine, Break, Evening Routine) pauses productivity and is not in weekly capacity. Assignable week hours = `dayMinutes × 7`.

**Unless `personalCountsAsDay` is on** (Strategize → Day). Then Personal is inside the day: the routines and Break take their real minutes out of their sections, assignable week hours become `(dayMinutes − personal per day) × 7`, and the routines show as **static** rows on Quest — under appointments, above the list — and as chips on the board. They are not completed or skipped: the day has already paid for them, the way it has for an appointment. The packer uses section timers and bucket caps, not a clock.

Buckets pack by **weight** (lower number = higher priority) inside their slot. Each bucket’s assigned hours are a **cap**: items compete only for that bucket’s time. A bucket does not expand to fill the section. Going over on a bucket does not steal from later buckets or later sections. Unused section time is dropped; starting the next stretch does not carry it forward. A bucket with no open days places nothing.

0-duration items never drop; they stay on the list in weight order (reminders). Item order is unique weight only.

## Day container

Edit → Day shows the live morning / midday / evening section lengths, plus timer sound / vibrate, and **Reset Today** (re-packs today fresh and clears its start, end and timers; that day's own complete and skip log rows and the skip pushes it made are deleted, and its score is unwound). Edit → Buckets shows assigned weekly hours vs leftover. Personal hours are not subtracted from the week. Leftover week time stays unassigned. Save refuses a week that is over that cap.

Each Strategize tab has one **Save** (Lists keeps per-row Remove). Add New empties itself once the write lands, so a second Save does not add the same bucket or item again; a refused save keeps what was typed. Lists saves through `saveItems`: every row validated first, then one batch and one repack. After a successful write, this week’s Sunday + 6 weeks (42 days) rebuild. Buckets Save is `saveBuckets`: Personal settings + Work + Events + weighted buckets (Add New if named), cap check, then pack. Item Save keeps the stored list weight. An unstarted day packs with fresh section thirds. A started or ended day keeps Complete / Skip and its score, and packs with its carried section time (`sectionExtra` / `sectionUsed`).

**Every** bucket picks one or more sections with toggles, and an item chooses among them whenever its bucket spans more than one. Work and weighted buckets set hours as **Week** or **Day**. Collapsed rows show `slot · 8h/wk` (Work can show `morning · midday · 8h/wk` — a dot, since these are the sections a bucket runs in, not a sum; Personal: hours only). Packer daily budget: week-mode `floor(weeklyMinutes / days.length)` on a checked day; day-mode `hoursMinutes` on a checked day.

## Locked vs customizable

- **Personal** always exists. Morning Routine, Break, and Evening Routine durations are editable. Color can change. Cannot be renamed, removed, or given a list. Does not consume week hours.
- **Work** always exists, weight 1, first in each **selected** section (one or more; toggles on Edit). Cannot be deleted or drag-reordered. Break is always midday. If Work is in midday, Break sits in that Work block (2-hour split). Morning/evening Work is not split. If Work is not in midday, Break still lands once there. Each Work list item packs in one selected section. A Work item split around Break is two blocks but one item for scoring: it scores complete only when both halves are, and skipped when either is.
- **Appointments** always exists. A container, not a scheduled bucket: no hours, no days, no sections of its own, and it cannot be renamed or deleted. Only its colour is editable, on Strategize → Buckets where it sits first. Its items are added under Lists.
- **Events** always exists. One or more **named** date ranges on the bucket (1-day ranges allowed). Add / remove / name them in Strategize → Buckets; page Save writes them. An event whose last day has passed deletes itself, and its items with it. Collapsed row summarises them (`2 ranges · 6d`) or `off` — the dates themselves live in the form. No slot, no week hours, no day sections. Cannot be deleted.
- **Weighted buckets** can be added, removed, renamed, recolored, reweighted, and given days / one or more sections / Week or Day hours.

## Today (normal day)

Buttons transform in place:

- **Start Day** begins the morning countdown. Morning Routine happens on your own; there is no Start Routine step. Start Day on a day already started changes nothing. It is disabled until the day and the buckets have loaded.
- After Start Day, Today lists **this stretch only** (placed + falling-off) plus Personal pause controls. Completed and skipped items leave the list — Stats is the record. Break stays, being a control rather than an item.
- Break: Start Break / End Break pauses/resumes the current timer.
- Falling off is collapsed to a counted line and opens on tap.
- After the list (and falling-off): **Start Next Chapter** + the next stretch's total.
- Start Next auto-skips leftover placed and falling-off items (same skip log rows as Skip), including a missed appointment, but **not** one that spans into a later section, which is still running.
  - Leftover scheduled items renew on the bucket's next assigned day that is not an event day; appointments and events do not, since a missed one is missed rather than deferred.
- Start Next then opens the next stretch. If that stretch has no capacity left after reserved appointments, Start Next ends the day exactly like End Day.
- Start Next does nothing if the day has already left the stretch on screen (a double tap, for one).
- The countdown is wall-clock; hitting 0m sounds and does not start the next stretch.
- Evening: **End Day** after the list.
- Appointments are items in the locked `appointments` bucket, packed before every other bucket in their section. Each declares the **sections it spans** (multi-select, at least one); its hours come out of the first of those and spill forward, and it stays on the list through every section it spans. Nothing is inferred from `apptTime`. An appointment is Scheduled (one date) or Recurring (a cadence, for a standing appointment). They have no stopwatch: the duration you assign is what the day loses, its own section first and then spilling forward. Complete / Skip like any item; skipping cancels it and credits its freed minutes to the running section only. A cancelled appointment is not pushed to another day.

The Quest header shows **Day / Booked / Packed**; Booked is time committed to appointments, coloured on the same load scale, and is how an overbooked day reads. Section timers show hours and minutes. They use the Day sound/vibrate toggles. Going over a bucket does not steal later time. The section-end chime sounds once while the page is open; reloading into an overrun section does not replay it.

## Events

If today is inside any Events date range: **event day**. Show Events list items only, with Complete / Skip. No morning/midday/evening, no Break, no Start Day / End Day, no stopwatch.

Events list items are **scheduled only**: they pick an event, then a date inside that event's range, plus a duration. No cadence. Lists groups them under their event. Calendar chips use the same filled treatment as appointments and pin to the top of the cell.

## Calendar and list

The 2-week Sunday board and side list stay. Days before today are blank on the board (date number only) and omitted from the side list. Hours marks at the top of each list day and cell count **productive** packed minutes (no Personal), colored vs `dayMinutes` (green under 50%, gold 50–85%, red above). The side list also shows leftover morning / midday / evening minutes (section thirds minus packed items in that slot; leftover eat applies). Those leftover numbers use the same load colors by time used (green under 50%, gold through 85%, red when little or none is left). Event days omit that row. Chips are `title · duration` (title only if 0). No clocks. Appointments are visually distinct and first within their section in the cell and list; an event block leads the whole day. Event items look like other list chips; the day outline marks an Events range. Other list items follow section, then packing order. Evening chips stay in the last third, before Evening Routine; a missing packed slot uses the bucket’s slot. Falling-off stays at the bottom of that day. Event days outline the cell and list day in the Events color even when empty. Event items also show on a normal day on their date.

## Lists

Edit → Lists groups items by bucket. Groups start collapsed; the count is on the row. Add New stays open at the top.

- Recurring = cadence forever, unless given an **expiry date**, which is inclusive and ends the stream; the last occurrence is marked.
- Scheduled = due date + cadence.
- A monthly cadence on the 29th–31st lands on the month’s last day in shorter months.
- Every item shows its time of day, even when its bucket has only one and there is nothing to choose.
- A list item’s weekday pickers only allow days the bucket runs; unchecked bucket days are disabled.
- Every-N-days may include an optional start date; no hits before it.
- Duration cannot exceed that bucket’s daily hours (week-mode share, or the day-mode hours).
- 0-duration reminders are exempt from the duration cap.
- Events items have no hours cap.
- When Work has more than one section, each Work item picks one of those sections.
- Skip scheduled → next assigned day for that bucket that is not an event day.
- Skip recurring → no makeup.
- Skip-push is scheduled-only.

End Day: each leftover, in whichever section it sits, gets a skip log row. Leftover scheduled items skip-push; leftover recurring items drop. A split Work item makes one skip push, not one per half. Next day starts clean.

## Controls

- Menu, transforming Start/End, Start Next Chapter, End Day, Complete / Skip, Save, Reset Today, and Remove share high-contrast control styles.
- Log rows: gold packed, green complete, red skip.
- On Today and Edit, action buttons are disabled while a request is in flight.
- Routes are code-split behind a boundary that reloads once if a chunk went stale under a deploy.
- A failed user action shows a toast named for its control (`Start Quest: offline?`, `Save Lists — …`), built by `formatActionError`. Failure toasts stay until tapped or cleared, and an identical failure already on screen is not stacked again.
- A listener the server refuses toasts as `Load Day: …`, `Load Buckets: …` and so on, and the page shows `Could not load.` in place of its data.
- Today and the Edit tabs that wait on live data show `Loading…` until it arrives.
- A success is silent: the page re-rendering is the confirmation. Respawn is the exception (`Quests reset. +1 Life`).
- When the server names a row and field, that row is also marked in place on Lists.
- There is **no pack button**: every write that changes the schedule repacks 42 days on its own — inside the callable (`saveBuckets`, `resetBucket`, `upsertItem`, `reorderItems`, `archiveItem`, `reorderBuckets`) or via the client rebuild that follows it (`saveSettings`, `archiveBucket`, `upsertAppointment`, `archiveAppointment`).
- Guide is a short tour of what each bucket and page is for, plus the hard limits.
- The chrome is navy and antique gold from the app icon.
- The current page is marked in the menu.

Selected is one treatment everywhere — gold wash, gold edge, normal text — shared by the current page, Edit tabs, day chips and pills. Solid gold is reserved for actions (Save). Every multiple-choice control is a label-sized tap target of at least 44px; the native input stays for focus, name and form value. A greyed copy of the app icon sits fixed behind every screen.

**Every page** runs the same chrome: the page title *is* the menu button, and the nav sits hidden behind it, so each screen is title-only. Sign Out rides in that menu on Today. Today additionally uses tighter page padding, so it is nearly full screen. The menu closes on navigation, on Escape, and when you pick something. Start Day is the app icon, large and round, with a slow halo; pressing it starts the day and the list animates in one card at a time. When the day ends the same icon greys out — there is no “Day ended” text.
