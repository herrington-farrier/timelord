# Manual checks

Things I cannot verify myself — visual, interactive, or dependent on your real
data. Tests, typecheck and lint pass; this is the rest.

Tick as you go. Anything that fails, tell me the item number.

## Quest

1. **Start Quest** — the app icon, large and round, with a slow halo. Tapping it
   starts the day.
2. **Day ended** — after Hearth, the same icon greyed out. No "Day ended" text.
3. **Countdown** — big gold numerals, section name beneath in caps.
4. **Rest** — `REST ZZZ` is green, becomes `END REST` (red). While resting the
   section name reads `RESTING` and the timer greys.
5. **Header stats** — `DAY / BOOKED / PACKED`. Booked only appears when the day
   has appointments, and is colour-coded like Packed.
6. **Tap to expand** — an item shows nothing until tapped; Complete and Skip
   appear side by side, and there is dead space down the right edge to scroll on.
7. **Finished items leave the list** — completing or skipping removes the row.
   Break stays after use.
8. **Falling off** — faded, dashed, indented, no strikethrough. Full opacity on
   hover or when opened.
9. **Start Next Chapter** — gold outlined medallion with a halo; the time shown
   is the **next** stretch's total, not the current countdown.
10. **Break colour** — the Break card takes the Personal bucket's colour, not
    gold. Change the Personal colour in Strategize → Buckets and re-check.
11. **Menu** — the `TIMELORD` title opens it; it closes on selection, on Escape,
    and whenever you navigate. Nothing renders solid gold when pressed.

## Appointments

12. **Appt tag and time** — an appointment shows an `APPT` tag and its time as
    `2:30 PM` (stored from the time picker).
13. **Placement** — an appointment set to Evening takes evening time and leaves
    your morning alone.
14. **Spanning** — one set to midday **and** evening stays on the list in both,
    rather than vanishing when the next stretch opens.
15. **The day feels it** — an appointment longer than its section pushes work
    into Falling off, including work in *later* sections.
16. **Cancel refunds** — skipping an appointment gives the hours back: displaced
    work returns, and the running countdown grows by what that section recovered.
17. **Complete does not refund** — by design. The hours were taken when the day
    was packed.
18. **Auto-skip** — Start Next Chapter marks a missed appointment as skipped, but
    **not** one still spanning into a later section.
19. **Not deferred** — a cancelled appointment does not reappear tomorrow. An
    ordinary scheduled item still renews on its bucket's next day.
20. **Migration** — appointments created before the rewrite are still there, now
    under Strategize → Lists in the Appointments group. Their per-appointment
    colours are gone by design; the bucket colour applies.

20b. **Repeating** — set an appointment to Recurring with a weekly cadence. It
    should appear on every matching day in Quest Log, take its hours out of
    those days, and keep its Time label and sections.

## Events

21. **Naming** — each range has a name field in Strategize → Buckets.
22. **Items pick an event** — an Events item chooses its event, then a date the
    picker limits to that event's range.
23. **Grouping** — Lists groups event items under their event name with its dates.
24. **Pre-existing items** — event items created before this land in the right
    group by date, with none under **Unassigned** unless they genuinely match no
    event.
25. **Auto-delete** — an event whose last day has passed disappears with its
    items on the next save.

## Strategize

26. **One Save per tab** — Day, Buckets and Lists each save as a page. No per-row
    Save buttons; Remove is still per-row.
27. **Collapsed groups still save** — edit an item, collapse its group, hit Save,
    and the edit persists.
28. **Errors land in place** — save an appointment with no sections ticked. The
    message names the row, the row is outlined, the field is marked, and nothing
    floats over the page.
29. **Nothing half-saves** — with one bad row among several, no row is written.
30. **Respawn** is green; **Reroll Stats** opens an `Erase all Stats?` dialog with
    Cancel / Erase.
31. **Reroll is blocked mid-day** — start the day, then try Reroll Stats: it
    should refuse with "Finish the day before rerolling Stats."
32. **Forms read left-aligned** — fields in even columns, Title on its own row.
32b. **Every bucket picks sections** — Buckets shows section toggles on every
    bucket, not a dropdown. Give a weighted bucket two sections; its items in
    Lists then get a section picker offering just those two.

44. **Personal as day time** — Strategize → Day, tick "Counts as day hours".
    Morning Routine and Evening Routine then appear on Quest as items with their
    minutes, come out of their sections, and the assignable week in Buckets
    shrinks by the Personal total. Untick it and they go back to invisible
    markers. With a full week already assigned, turning it on should be refused
    by the week cap rather than silently overbooking.

## Quest Log

33. **Booked per day** — days with appointments show `2h booked` in the
    appointment colour, beside the packed-hours mark.
34. **Chips lead with the time** — appointment chips read `2:30 PM Dentist · 1h`.
35. **Day blocks** — each day in the side list is its own bordered block; today
    is gold-tinted.
36. **Event days** — outlined in the Events colour.

## Stats

37. **Wording** — `Quest Completed: X`, `Quest Failed: X`, `Quest Log Packed`.
38. **Row colour matches its text** — green complete, red skip, gold for packs
    and system events. No row has a coloured edge with white text.
39. **No pack spam** — saving in Strategize no longer adds a "Quest Log Packed"
    row every time.
40. **Readable dates** — `Sat Aug 29 · 7:00 AM · 20m`, not raw ISO strings.

## Score

45. **After Hearth** — the bar appears under the greyed seal, animates, and
    shows the day's delta (`+4`) beside the running total.
46. **Counting** — finish two items and skip one: `+1`. Complete something in
    Falling off: that one is worth `+2`.
47. **Forgiven days** — on a day with an appointment, items left in Falling off
    do not subtract. A skip you chose still does.
48. **A day never started** scores nothing at all.
49. **Respawn** takes back exactly what today added, and today's rows leave Stats.
50. **Reroll Stats** sets the total to 0 along with the history.
51. **Stats** — the same bar sits at the top of the page.

## Speed and cost

41. **Quest feels quicker** — Complete, Skip and Start Next Chapter should
    respond noticeably faster than before; saves no longer rewrite all 42 days.
42. **Adding an appointment is fast** — it repacks only the dates it touches.

## New account

43. Seeds show one or two of each thing: an appointment today at 2:30 PM, two
    Work items on different cadences, a home item, a 0-duration reminder, a
    weekly errand, and an event a fortnight out with an item in it.
    *(Only testable on a fresh account.)*

## Known by design — not bugs

- Completing an appointment does not change remaining time. The hours come out
  when the day is packed; that is what lets Falling off be right in advance.
- An appointment reserves its section even if you never mark it, until the
  section it spans is over.
- Reroll Stats erases history permanently. There is no undo.
