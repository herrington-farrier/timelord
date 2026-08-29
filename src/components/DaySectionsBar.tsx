import { formatDuration } from '../domain/duration';
import { sectionMinutes } from '../domain/packDay';

export function DaySectionsBar({
  dayMinutes,
}: {
  dayMinutes: number;
}) {
  const parts = sectionMinutes({ dayMinutes });
  return (
    <div className="totals week-budget">
      <div className="total-card">
        <span>Morning</span>
        <b>{formatDuration(parts.morning)}</b>
      </div>
      <div className="total-card">
        <span>Midday</span>
        <b>{formatDuration(parts.midday)}</b>
      </div>
      <div className="total-card">
        <span>Evening</span>
        <b>{formatDuration(parts.evening)}</b>
      </div>
    </div>
  );
}
