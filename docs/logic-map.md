# Logic map

Google sign-in is invite-only. Add emails to `src/domain/allowlist.ts` and deploy functions. An existing tenant is always admitted (setup is never wiped). New accounts need an allowlisted email. Firestore reads require the `allowlisted` claim or an allowlisted email. First allowed signup and every denial write `accessLogs`. After the claim is set, refresh keeps the session and skips bootstrap. A server error on bootstrap does not sign the user out; only an invite denial does.

Timelord packs **productive** time only. `dayMinutes` splits into three equal sections (`floor(dayMinutes / 3)`, remainder on evening). Personal (Morning Routine, Break, Evening Routine) pauses productivity and is not in weekly capacity. Assignable week hours = `dayMinutes × 7`. The packer uses section timers and bucket caps, not a clock.

Buckets pack by **weight** (lower number = higher priority) inside their slot. Each bucket’s assigned hours are a **cap**: items compete only for that bucket’s time. A bucket does not expand to fill the section. Going over on a bucket does not steal from later buckets or later sections. Unused section time is dropped; starting the next stretch does not carry it forward.

0-duration items never drop; they stay on the list in weight order (reminders). Item order is unique weight only.

## Day container

Edit → Day shows the live morning / midday / evening section lengths, plus timer sound / vibrate, and **Reset Today** (re-packs today and clears start / complete / skip / timers). Edit → Buckets shows assigned weekly hours vs leftover. Personal hours are not subtracted from the week. Leftover week time stays unassigned. Save refuses a week that is over that cap.

Each Edit tab has one **Save** (Lists and Appointments keep row Save / Remove). After a successful write, this week’s Sunday + 6 weeks (42 days) rebuild. Buckets Save is `saveBuckets`: Personal settings + Work + Events + weighted buckets (Add New if named), cap check, then pack. Item Save keeps the stored list weight. Pack always uses fresh section thirds and clears leftover eat. Started or ended days keep Complete / Skip.

Work and weighted buckets set hours as **Week** or **Day**. Collapsed rows show `slot · 8h/wk` (Personal: hours only). Packer daily budget: week-mode `floor(weeklyMinutes / days.length)` on a checked day; day-mode `hoursMinutes` on a checked day.

## Locked vs customizable

- **Personal** always exists. Morning Routine, Break, and Evening Routine durations are editable. Color can change. Cannot be renamed, removed, or given a list. Does not consume week hours.
- **Work** always exists, weight 1, first in **its** slot (slot is editable). Cannot be deleted or drag-reordered. Break is tied to Work and centered in the Work block (2-hour split). Today, the 2-week board, and the side list keep Break between those Work halves. If Work has no items that day, Break still lands once in Work’s slot.
- **Events** always exists. One or more date ranges on the bucket (1-day ranges allowed). Add / remove ranges in Edit → Buckets; page Save writes them. Collapsed row shows each range (`5d, Aug 29/Sep 2 · 1d, Sep 10`) or `off`. No slot, no week hours, no day sections. Cannot be deleted.
- **Weighted buckets** can be added, removed, renamed, recolored, reweighted, and given days / slot / Week or Day hours.

## Today (normal day)

Buttons transform in place:

- **Start Day** begins the morning countdown. Morning Routine happens on your own; there is no Start Routine step.
- After Start Day, Today lists **this stretch only** (placed + falling-off) plus Personal pause controls.
- Break: Start Break / End Break pauses/resumes the current timer.
- After the list (and falling-off): **Start Next Buckets** + time remaining. Auto-skips unmarked items and opens the next stretch at its normal length. If the next stretch is 0, auto End Day.
- Evening: **End Day** after the list.
- Appointments sit at the top of the section list. Each has Start/Stop and counts **up**. On Stop, elapsed time is subtracted from the current section, then following sections; remaining sections repack. Appointments never sound.

Section timers show hours and minutes. They use the Day sound/vibrate toggles. Going over a bucket does not steal later time.

## Events

If today is inside any Events date range: **event day**. Show Events list items only, with Complete / Skip. No morning/midday/evening, no Break, no Start Day / End Day, no stopwatch.

Events list items are **scheduled only**: date + duration, no cadence. They pack on that date. Calendar chips use the same filled treatment as appointments and pin to the top of the cell.

## Calendar and list

The 2-week Sunday board and side list stay. Days before today are blank on the board (date number only) and omitted from the side list. Hours marks at the top of each list day and cell count **productive** packed minutes (no Personal), colored vs `dayMinutes` (green under 50%, gold 50–85%, red above). The side list also shows leftover morning / midday / evening minutes (section thirds minus packed items in that slot; leftover eat applies). Those leftover numbers use the same load colors by time used (green under 50%, gold through 85%, red when little or none is left). Event days omit that row. Chips are `title · duration` (title only if 0). No clocks. Appointments are visually distinct and first in the cell and list. Event items look like other list chips; the day outline marks an Events range. Other list items follow section, then weight. Evening chips stay in the last third, before Evening Routine; a missing packed slot uses the bucket’s slot. Falling-off stays at the bottom of that day. Event days outline the cell and list day in the Events color even when empty. Event items also show on a normal day on their date.

## Lists

Recurring = cadence forever. Scheduled = due date + cadence. A list item’s weekday pickers only allow days the bucket runs; unchecked bucket days are disabled. Every-N-days may include an optional start date; no hits before it. Duration cannot exceed that bucket’s daily hours (week-mode share, or the day-mode hours). 0-duration reminders are exempt. Events items have no hours cap. Skip scheduled → next assigned day for that bucket. Skip recurring → no makeup. Skip-push is scheduled-only.

End Day: leftover scheduled skip-push; leftover recurring drop. Next day starts clean.

## Controls

Menu, Pack the Day, transforming Start/End, Start Next Buckets, End Day, Complete / Skip, Save, Reset Today, and Remove share high-contrast control styles. Log rows: gold packed, green complete, red skip. Pack the Day is a sticky bar under the title on Calendar, Edit, and Log — not Today or Guide. Guide is a short tour of what each bucket and page is for, plus the hard limits. The chrome is navy and antique gold from the app icon. The current page is marked in the menu.
