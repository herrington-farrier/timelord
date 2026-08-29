# Logic map

Timelord packs **productive** time only. `dayMinutes` splits into three equal sections (`floor(dayMinutes / 3)`, remainder on evening). Personal (Morning Routine, Break, Evening Routine) pauses productivity and is not in weekly capacity. Assignable week hours = `dayMinutes × 7`. The packer uses section timers and bucket caps, not a clock.

Buckets pack by **weight** (lower number = higher priority) inside their slot. Each bucket’s assigned hours are a **cap**: items compete only for that bucket’s time. A bucket does not expand to fill the section. Going over on a bucket does not steal from later buckets or later sections. Extra section time moves **forward only** when you hit **Start Next** before the section timer hits zero.

0-duration items never drop; they stay on the list in weight order (reminders). Item order is unique weight only.

## Day container

Edit → Day shows the live morning / midday / evening section lengths, plus timer sound / vibrate. Edit → Buckets shows assigned weekly hours vs leftover. Personal hours are not subtracted from the week. Leftover week time stays unassigned. Save refuses a week that is over that cap.

Each Edit tab has one **Save** (Lists and Appointments keep row Save / Remove). After a successful write, today + 21 packed days rebuild. Buckets Save is `saveBuckets`: Personal settings + Work + Events + weighted buckets (Add New if named), cap check, then pack. Item Save keeps the stored list weight. Unstarted days pack from current list order; started or ended days keep Complete / Skip.

Work and weighted buckets set hours as **Week** or **Day**. Collapsed rows show `slot · 8h/wk` (Personal: hours only). Packer daily budget: week-mode `floor(weeklyMinutes / days.length)` on a checked day; day-mode `hoursMinutes` on a checked day.

## Locked vs customizable

- **Personal** always exists. Morning Routine, Break, and Evening Routine durations are editable. Color can change. Cannot be renamed, removed, or given a list. Does not consume week hours.
- **Work** always exists, weight 1, first in **its** slot (slot is editable). Cannot be deleted or drag-reordered. Break is tied to Work and centered in the Work block (2-hour split). If Work has no items that day, Break still lands once in Work’s slot.
- **Events** always exists. Date range on the bucket. No slot, no week hours, no day sections. Cannot be deleted.
- **Weighted buckets** can be added, removed, renamed, recolored, reweighted, and given days / slot / Week or Day hours.

## Today (normal day)

Buttons transform in place:

- Morning Routine: Start → End. Ending it **is** Start Day: morning section countdown begins.
- After Start Day, Today lists **this section only** (placed + falling-off) plus Personal pause controls.
- Break: Start Break / End Break pauses/resumes the current section timer.
- Morning and midday bottom: **Start Next** + time remaining. Auto-skips unmarked items in the section you leave, adds leftover minutes to the next section, and repacks. If leftover + next section is 0, auto End Day.
- Evening: Start Evening Routine **is** End Day.
- Appointments sit at the top of the section list. Each has Start/Stop and counts **up**. On Stop, elapsed time is subtracted from the current section, then following sections; remaining sections repack. Appointments never sound.

Section timers use the Day sound/vibrate toggles. Going over a bucket does not steal later time.

## Events

If today is inside the Events date range: **event day**. Show Personal + Events list items only. No morning/midday/evening, no Break. Start Day / End Day are a count-up stopwatch. Total event hours are logged.

## Calendar and list

The 2-week Sunday board and side list stay. Hours marks at the top of each list day and cell count **productive** packed minutes (no Personal), colored vs `dayMinutes` (green under 50%, gold 50–85%, red above). Chips are `title · duration` (title only if 0). No clocks. Appointments are visually distinct and first in the cell. List order is section, then weight. Falling-off stays at the bottom of that day. Event days: one list of event items; hours mark is that day’s event time.

## Lists

Recurring = cadence forever. Scheduled = due date + cadence. Skip scheduled → next assigned day for that bucket. Skip recurring → no makeup. Skip-push is scheduled-only.

End Day: leftover scheduled skip-push; leftover recurring drop. Next day starts clean.

## Controls

Menu, transforming Start/End, Start Next, Complete / Skip, Save, and Remove share high-contrast control styles. The chrome is navy and antique gold from the app icon. The current page is marked in the menu.
