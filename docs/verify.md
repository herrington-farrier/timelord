# Manual checks

**This list is deliberately short.** Anything a test can assert belongs in
`src/test/`, not here — 342 tests across 45 files cover the packing rules,
cadences, appointments, events, the score, validation, ordering, and the shapes
each page renders. What is left is what a test genuinely cannot reach.

Four things keep an item on this list:

- **Rendered appearance.** jsdom loads no CSS and lays nothing out, so colour,
  size, spacing and animation are unverifiable in a test. (`buttonStyles.test.ts`
  parses the stylesheet as text, which catches a rule being wrong — never that
  the result looks right.)
- **A real device.** Touch, hover-after-tap, sound, vibration, scrolling.
- **The real backend.** Auth, IAM, security rules, deploys, live data.
- **Feel.** Whether something is fast enough, or legible at a glance.

If you find yourself adding an item that is none of those, write a test instead.

Tick as you go. Anything that fails, tell me the item number.

## Appearance

1. **Start Quest** — the app icon, large and round, with a slow halo. After
   Hearth the same icon, greyed. No "Day ended" text.
2. **Countdown** — big gold numerals, section name beneath in caps. While
   resting the name reads `RESTING` and the timer greys.
3. **Rest** — `REST ZZZ` is green and becomes `END REST` in red.
4. **Falling off** — the collapsed line is muted with a rule above it and the
   count in a chip. Open, the rows are faded, dashed and indented, with no
   strikethrough, and come to full opacity on hover.
5. **A routine, when Personal counts as day time** — static under the
   appointments, reading as committed rather than pending.
6. **The last time round** — an expiring item shows a gold `FINAL` tag and a
   dashed trailing edge, on Quest and on the board. Noticeable while scanning,
   not alarming.
7. **Start Next Chapter** — gold outlined medallion with a halo.
8. **Header stats** — `DAY / BOOKED / PACKED`, colour-coded on the load scale.
9. **Quest Log** — each day in the side list is its own bordered block; today is
   gold-tinted; event days are outlined in the Events colour even when empty.
10. **Stats rows** — every row's text takes its row colour. No row has a
    coloured edge with white text.
11. **Forms read left-aligned** — fields in even columns, Title on its own row.
12. **Selected is one treatment** — gold wash, gold edge, normal text — on the
    current page, Edit tabs, day chips and pills. Solid gold only on actions.

## On a device

13. **Nothing renders solid gold when pressed.** This is the `background-clip`
    bug: `:hover` sticks after a tap, so it only appears on touch.
    `buttonStyles.test.ts` guards the cause; this checks the effect.
14. **Tap to expand** — an item opens on tap, and there is dead space down the
    right edge to scroll on without opening anything.
15. **Timer alerts** — the sound and vibrate toggles do what they say when a
    section runs out.
16. **The menu** — opens from the title, closes on selection, on Escape, and
    whenever you navigate.

## Against the real backend

17. **Adding someone** — put their address in `config/allowlist` (Firestore
    console, lowercase). They can sign in within about five minutes; the
    functions cache the list that long, and every write asks that same list.
18. **A stranger** — an uninvited Google account is refused with "This app is
    invite-only" and signed straight back out.
19. **You are never locked out** — the owner addresses are a floor in both the
    rules and the code, so an empty or deleted `config/allowlist` leaves your
    own access intact.
20. **Every callable is reachable.** A function missing its `allUsers`
    run-invoker binding is refused by the front end before it runs, logs
    nothing, and surfaces as `functions/internal`. See the README for the curl
    that tells a reachable function from a blocked one — worth running after any
    deploy that creates a function.
21. **A page after a deploy** — with the app open, redeploy and then navigate to
    a page you have not visited. It should reload itself rather than showing a
    blank background.
22. **A brand-new account** — first sign-in creates the tenant, seeds one or two
    of each thing, and packs six weeks. *(Only testable on a fresh account; what
    is seeded is covered by `seed.test.ts`, but that it happens at sign-in is
    not.)*
23. **Appointments created before the rewrite** are still there under
    Strategize → Lists, in the Appointments group, with the bucket colour.
    *(Real data; the migration runs once per tenant.)*
24. **Event items created before events had ids** land in the right group by
    date, with none under **Unassigned** unless they genuinely match no event.

## Feel

25. **Quest responds quickly** — Complete, Skip and Start Next Chapter. Saves
    rewrite only the days that changed, not all 42.
26. **Adding an appointment is fast** — it repacks only the dates it touches.
27. **The day is readable at a glance** — what you are doing now is the first
    thing you see, and what will not fit is legible without being loud.

## Known by design — not bugs

- Completing an appointment does not change remaining time. The hours come out
  when the day is packed; that is what lets falling-off be right in advance.
- An appointment reserves its section even if you never mark it, until the
  section it spans is over.
- A Personal routine is never completed or skipped. When Personal counts as day
  time the day has already paid for it, exactly as it has for an appointment.
- Reroll Stats erases history permanently. There is no undo.
