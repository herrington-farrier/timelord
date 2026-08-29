# Logic map

Timelord packs a day from Personal anchors, appointments, then buckets by **weight** (lower number = higher priority). Extra weekly hours go to Work. Overflow **buckets** drop as a unit when they do not fit remaining slot time; overflow **items** inside a placed bucket drop by item weight.

## Day container

`dayMinutes` is the full day, including Morning Routine, Break, Evening Routine, Work, other buckets, appointments, and transitions. Weekly capacity = `dayMinutes × 7`. Edit → Buckets shows a live total of assigned weekly hours vs hours left after Personal; leftover goes to Work. Save refuses a week that is over that cap.

Each Edit tab has one **Save** (Lists and Appointments keep row Save / Remove). After a successful write, today + 21 packed days rebuild so Today and Calendar match. Buckets Save is `saveBuckets`: Personal settings + every Work/weighted bucket (Add New if named), cap check, then pack. Drag-reorder and archive also rebuild.

Work and weighted buckets set hours as **Week** (total split across checked days) or **Day** (that many hours on each checked day; week total = hours × days). Collapsed rows show `8h/wk` or `2h/day`. Packer daily budget: week-mode `floor(weeklyMinutes / days.length)` on a checked day; day-mode `hoursMinutes` on a checked day.

## Locked vs customizable

- **Personal** always exists and is shown on Edit → Buckets as a collapsible row with weekly hours. Morning Routine, Break, and Evening Routine durations are editable. Color can change. Cannot be renamed, removed, or given a list.
- **Work** always exists and is shown on Edit → Buckets, weight 1, occupies midday split in half by Break. Can be **renamed** and recolored. Cannot be deleted. Days of week and Week/Day hours are editable.
- **Weighted buckets** can be added, removed, renamed, recolored, reweighted, and given days / slot / Week or Day hours. Each bucket is a collapsible row with the hours you set on that line.
- Day length and transition minutes are settings. The clock starts when you tap **Start Day** or complete **Morning Routine**; remaining hours (day length minus morning) get start/end times from that timestamp.

## Clock order

Morning Routine → morning buckets (by weight) → Work half 1 → Break → Work half 2 → other midday buckets → evening buckets → Evening Routine.

Appointments punch holes and never move. One transition between different buckets, and between Morning / Break / Evening. None between list items in the same bucket.

## Lists

Recurring = cadence forever. Scheduled = due date + cadence. Skip scheduled → next assigned day for that bucket. Skip recurring → no makeup.

Start Day (or completing Morning Routine) chains remaining flexible ETAs from now. Appointments stay put. End Day: leftover scheduled skip-push; leftover recurring drop. Rebuild restamps packed block colors from the current buckets.

Falling off lists dropped buckets and dropped items. Each item still needs Complete or Skip.

## Controls

Menu, Start Day / End Day, Complete / Skip, Save, and Remove share high-contrast control styles. The current page is marked in the menu.
