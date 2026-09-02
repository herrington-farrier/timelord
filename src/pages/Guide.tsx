import { Chrome } from '../components/Chrome';

type GuideCard = {
  id: string;
  kicker: string;
  title: string;
  /** Only the idea card leads with the one-line version of the whole app. */
  lede?: string;
  body: string;
};

const CARDS: GuideCard[] = [
  {
    id: 'pack-how',
    kicker: 'The idea',
    title: 'How a day gets packed',
    lede: 'Set it up in Organize. Go Quest.',
    body: 'Buckets fill morning, midday and evening in priority order, each capped at its own hours. No bucket borrows from another. Unused time is gone.',
  },
  {
    id: 'personal',
    kicker: 'Bucket',
    title: 'Personal',
    body: 'Morning Routine, Break, Evening Routine. These pause the day. No list, no week hours. Cannot be renamed or removed.',
  },
  {
    id: 'work',
    kicker: 'Bucket',
    title: 'Work',
    body: 'Your job block, first in every section you give it. Each Work item picks one of those sections. Break is always midday. Cannot be deleted or reordered.',
  },
  {
    id: 'events',
    kicker: 'Bucket',
    title: 'Events',
    body: 'Date ranges that replace the normal day. Just the Events list, Complete or Skip. No sections, no timer. Cannot be deleted.',
  },
  {
    id: 'weighted',
    kicker: 'Bucket',
    title: 'Your buckets',
    body: 'Everything else you want packed. Hours are a cap, not a target. No item may run longer than its bucket gets in a day.',
  },
  {
    id: 'today',
    kicker: 'Page',
    title: 'Quest',
    body: 'One stretch at a time. Start Next Chapter skips whatever is left, logs it, and opens the next stretch. Leftover minutes do not carry.',
  },
  {
    id: 'calendar',
    kicker: 'Page',
    title: 'Quest Log',
    body: 'What is packed from today on. Past days are blank. Each day shows the time still free in each section.',
  },
  {
    id: 'lists',
    kicker: 'Organize tab',
    title: 'Lists',
    body: 'What gets packed, grouped by bucket. Zero-duration items are reminders and never drop.',
  },
];

export function GuidePage() {
  return (
    <Chrome title="Guide" wide>
      <div className="guide">
        <div className="guide-grid">
          {CARDS.map((card) => (
            <article key={card.id} className={`guide-card guide-card--${card.id}`}>
              <p className="guide-kicker">{card.kicker}</p>
              <h2>{card.title}</h2>
              {card.lede ? <p className="guide-card__lede">{card.lede}</p> : null}
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </Chrome>
  );
}
