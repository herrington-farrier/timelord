import { formatDuration } from '../domain/duration';
import type { WeekBudgetSummary } from '../domain/budget';

export function WeekBudgetBar({ summary }: { summary: WeekBudgetSummary }) {
  const over = summary.leftoverMinutes < 0;
  return (
    <div className={`totals week-budget${over ? ' is-over' : ''}`}>
      <div className="total-card">
        <span>Week</span>
        <b>{formatDuration(summary.capacityMinutes)}</b>
      </div>
      <div className="total-card">
        <span>Personal</span>
        <b>{formatDuration(summary.personalMinutes)}</b>
      </div>
      <div className="total-card">
        <span>Assigned</span>
        <b>{formatDuration(summary.assignedMinutes)}</b>
      </div>
      <div className="total-card">
        <span>{over ? 'Over' : 'Leftover'}</span>
        <b>{formatDuration(Math.abs(summary.leftoverMinutes))}</b>
      </div>
    </div>
  );
}
