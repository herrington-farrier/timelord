import { formatDuration } from '../domain/duration';
import { sectionMinutes } from '../domain/sections';
import { SLOTS, type Slot } from '../domain/types';

export function DaySectionsBar({
  dayMinutes,
  split,
}: {
  dayMinutes: number;
  /** The live split while it is being edited. Without one the day divides evenly. */
  split?: Record<Slot, number>;
}) {
  const parts = split ?? sectionMinutes({ dayMinutes });
  return (
    <div className="totals week-budget">
      {SLOTS.map((slot) => (
        <div className="total-card" key={slot}>
          <span>{slot[0].toUpperCase() + slot.slice(1)}</span>
          <b>{formatDuration(parts[slot])}</b>
        </div>
      ))}
    </div>
  );
}
