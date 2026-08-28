# Logic map

Timelord packs a day from Personal anchors, appointments, then buckets by **weight** (lower number = higher priority). Extra weekly hours go to Work. Overflow **buckets** drop as a unit when they do not fit remaining slot time; overflow **items** inside a placed bucket drop by item weight.

## Day container

`dayMinutes` is the full day, including Morning Routine, Break, Evening Routine, Work, other buckets, appointments, and transitions. Weekly capacity = `dayMinutes × 7`.

## Locked vs customizable

- **Personal** always exists: Morning Routine, Break, Evening Routine. Durations are editable. Not a weighted bucket.
- **Work** always exists, weight 1, occupies midday split in half by Break. Can be **renamed** and recolored. Cannot be deleted. Days of week and weekly hours are editable.
- **Weighted buckets** can be added, removed, renamed, recolored, reweighted, and given days / slot / weekly hours.
- Day length, day start, and transition minutes are settings.

## Clock order

Morning Routine → morning buckets (by weight) → Work half 1 → Break → Work half 2 → other midday buckets → evening buckets → Evening Routine.

Appointments punch holes and never move. One transition between different buckets; none between items in the same bucket.

## Lists

Recurring = cadence forever. Scheduled = due date + cadence. Skip scheduled → next assigned day for that bucket. Skip recurring → no makeup.

Start Day chains remaining flexible ETAs from now. Appointments stay put. End Day: leftover scheduled skip-push; leftover recurring drop.

Falling off lists dropped buckets and dropped items. Each item still needs Complete or Skip.

## Controls

Menu, Start Day / End Day, Complete / Skip, Save, and Remove share high-contrast control styles. The current page is marked in the menu.
