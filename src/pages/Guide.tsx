import { Chrome } from '../components/Chrome';

const CARDS = [
  {
    id: 'pack-how',
    kicker: 'The idea',
    title: 'How a day gets packed',
    body: 'Lists fill morning, midday, and evening by priority and each bucket’s hours. A bucket cannot take time from another. Unused stretch time is gone.',
  },
  {
    id: 'personal',
    kicker: 'Bucket',
    title: 'Personal',
    body: 'Pauses the day: Morning Routine, Break, Evening Routine. No list. No week hours. You cannot rename or remove it.',
  },
  {
    id: 'work',
    kicker: 'Bucket',
    title: 'Work',
    body: 'Your job block. Always first in its slot. Break is tied to it. You cannot delete or drag it.',
  },
  {
    id: 'events',
    kicker: 'Bucket',
    title: 'Events',
    body: 'Date ranges for days that are just events. One-day blocks are fine. No sections, no timer. Complete or skip the items. You cannot delete it.',
  },
  {
    id: 'weighted',
    kicker: 'Bucket',
    title: 'Your buckets',
    body: 'Everything else you want packed. Hours are a cap. An item cannot be longer than that bucket’s daily hours.',
  },
  {
    id: 'today',
    kicker: 'Page',
    title: 'Today',
    body: 'Run one stretch at a time. Start Next Buckets skips leftover items (logged as Skipped) and opens the next stretch. Leftover minutes do not come with you. End Day closes the evening.',
  },
  {
    id: 'calendar',
    kicker: 'Page',
    title: 'Calendar',
    body: 'What’s packed from today forward. Past days are blank. The list shows time still free in each section.',
  },
  {
    id: 'lists',
    kicker: 'Page',
    title: 'Lists',
    body: 'What gets packed, grouped by bucket. Duration cannot exceed the bucket’s daily hours. Zero-duration items are reminders and never drop.',
  },
] as const;

export function GuidePage() {
  return (
    <Chrome title="Guide" wide>
      <div className="guide">
        <p className="guide-lede">
          Set hours and lists in Edit. Pack the Day. Run it from Today.
        </p>
        <div className="guide-grid">
          {CARDS.map((card) => (
            <article key={card.id} className={`guide-card guide-card--${card.id}`}>
              <p className="guide-kicker">{card.kicker}</p>
              <h2>{card.title}</h2>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </Chrome>
  );
}
